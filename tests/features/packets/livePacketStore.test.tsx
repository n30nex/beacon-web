import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePackets } from "../../../src/features/packets/usePackets";
import type { WsPacketObservation } from "../../../src/types/ws";

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

const getPackets = vi.fn();
vi.mock("../../../src/api/client", () => ({
  getPackets: (...args: unknown[]) => getPackets(...args),
}));

function obs(hash: string, observerId = "o1", observationCount = 1): WsPacketObservation["data"] {
  return {
    packetHash: hash,
    packet: {
      payloadType: 4,
      payloadTypeName: "ADVERT",
      routeType: 1,
      routeTypeName: "FLOOD",
      observationCount,
    },
    observation: { observerId, observerName: observerId, iata: "YOW", heardAt: 1 },
  } as unknown as WsPacketObservation["data"];
}

// The live buffer is rAF-batched: pushOrUpdate stages, flush() materializes once per frame. These
// tests pin the externally-observable invariants the rewrite must preserve — newest-first order,
// in-place re-observation (no reorder), and oldest-evicted capping.
describe("LivePacketStore (via usePackets) batched live buffer", () => {
  let qc: QueryClient;
  beforeEach(() => {
    getPackets.mockReset();
    getPackets.mockResolvedValue({ items: [], nextCursor: null }); // empty history -> allPackets == live buffer
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  it("orders live packets newest-first across a burst that shares one frame", async () => {
    const { result } = renderHook(() => usePackets(), { wrapper });
    act(() => {
      result.current.handlePacketObservation(obs("a"));
      result.current.handlePacketObservation(obs("b"));
      result.current.handlePacketObservation(obs("c"));
    });
    await waitFor(() => expect(result.current.allPackets).toHaveLength(3));
    expect(result.current.allPackets.map((p) => p.packetHash)).toEqual(["c", "b", "a"]);
  });

  it("updates a re-observed packet in place without reordering, and accrues observers", async () => {
    const { result } = renderHook(() => usePackets(), { wrapper });
    act(() => {
      result.current.handlePacketObservation(obs("a"));
      result.current.handlePacketObservation(obs("b"));
      result.current.handlePacketObservation(obs("c"));
    });
    await waitFor(() => expect(result.current.allPackets).toHaveLength(3));

    act(() => {
      result.current.handlePacketObservation(obs("a", "o2", 2)); // re-observe the oldest
    });
    await waitFor(() => expect(result.current.allPackets[2]?.observationCount).toBe(2));
    expect(result.current.allPackets.map((p) => p.packetHash)).toEqual(["c", "b", "a"]);
    expect(result.current.observersByHash.get("a")?.size).toBe(2);
  });

  it("caps the buffer at 500, evicting the oldest packets", async () => {
    const { result } = renderHook(() => usePackets(), { wrapper });
    act(() => {
      for (let i = 0; i < 520; i += 1) result.current.handlePacketObservation(obs(`p${i}`));
    });
    await waitFor(() => expect(result.current.allPackets).toHaveLength(500));
    expect(result.current.allPackets[0]?.packetHash).toBe("p519"); // newest kept
    expect(result.current.allPackets[499]?.packetHash).toBe("p20"); // oldest kept (p0..p19 evicted)
    // evicted hashes' observer sets are dropped
    expect(result.current.observersByHash.has("p0")).toBe(false);
  });

  it("keeps a packet re-observed in the same frame a new one would evict it (at cap)", async () => {
    const { result } = renderHook(() => usePackets(), { wrapper });
    act(() => {
      for (let i = 0; i < 500; i += 1) result.current.handlePacketObservation(obs(`p${i}`));
    });
    await waitFor(() => expect(result.current.allPackets).toHaveLength(500)); // p0 is the oldest

    // one frame: a new packet (would evict the oldest) AND a re-observation of that same oldest packet
    act(() => {
      result.current.handlePacketObservation(obs("pNew"));
      result.current.handlePacketObservation(obs("p0", "o2", 2));
    });
    await waitFor(() => expect(result.current.allPackets[0]?.packetHash).toBe("pNew"));

    const hashes = result.current.allPackets.map((p) => p.packetHash);
    expect(result.current.allPackets).toHaveLength(500);
    expect(hashes).toContain("p0"); // re-observed -> survives instead of being evicted
    expect(hashes).not.toContain("p1"); // the oldest UNTOUCHED packet is evicted instead
    expect(result.current.allPackets.find((p) => p.packetHash === "p0")?.observationCount).toBe(2);
    expect(result.current.observersByHash.get("p0")?.size).toBe(2); // observers preserved, not dropped
    expect(result.current.observersByHash.has("p1")).toBe(false); // the evicted one's observers released
  });
});
