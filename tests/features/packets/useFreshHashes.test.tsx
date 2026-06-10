import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFreshHashes } from "../../../src/features/packets/useFreshHashes";
import type { PacketSummary } from "../../../src/types/api";

function pkt(hash: string): PacketSummary {
  return {
    packetHash: hash,
    payloadType: 2,
    payloadTypeName: "TEXT_MESSAGE",
    routeType: 0,
    routeTypeName: "FLOOD",
    firstHeardAt: 0,
    lastHeardAt: 0,
    observationCount: 1,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFreshHashes", () => {
  it("does not mark the initial batch fresh", () => {
    const { result } = renderHook(({ packets }) => useFreshHashes(packets), {
      initialProps: { packets: [pkt("a"), pkt("b")] },
    });
    expect(result.current.size).toBe(0);
  });

  it("marks prepended hashes fresh and clears them after the delay", () => {
    const { result, rerender } = renderHook(({ packets }) => useFreshHashes(packets), {
      initialProps: { packets: [pkt("a")] },
    });

    rerender({ packets: [pkt("b"), pkt("a")] });
    expect(result.current.has("b")).toBe(true);

    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.has("b")).toBe(false);
  });

  it("clears each batch on its own delay during a steady stream", () => {
    const { result, rerender } = renderHook(({ packets }) => useFreshHashes(packets), {
      initialProps: { packets: [pkt("a")] },
    });

    // t=0: b arrives
    rerender({ packets: [pkt("b"), pkt("a")] });
    expect(result.current.has("b")).toBe(true);

    // t=500: c arrives while b's highlight is still pending
    act(() => vi.advanceTimersByTime(500));
    rerender({ packets: [pkt("c"), pkt("b"), pkt("a")] });
    expect(result.current.has("c")).toBe(true);
    expect(result.current.has("b")).toBe(true);

    // t=1100: b is past its 1s window and must clear even though c arrived after it
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.has("b")).toBe(false);
    expect(result.current.has("c")).toBe(true);

    // t=1600: c clears too
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.has("c")).toBe(false);
  });

  it("a packets change with no new hashes does not cancel a pending clear", () => {
    const { result, rerender } = renderHook(({ packets }) => useFreshHashes(packets), {
      initialProps: { packets: [pkt("a")] },
    });

    rerender({ packets: [pkt("b"), pkt("a")] });
    expect(result.current.has("b")).toBe(true);

    // same content, new array identity — e.g. a filter re-evaluation
    act(() => vi.advanceTimersByTime(100));
    rerender({ packets: [pkt("b"), pkt("a")] });

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.has("b")).toBe(false);
  });
});
