import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLiveOverview } from "../../../src/features/stats/useLiveStats";
import type { StatsOverview } from "../../../src/features/stats/types";
import type { WsManager } from "../../../src/api/ws-manager";
import type { WsPacketObservation } from "../../../src/types/ws";

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

const overview: StatsOverview = {
  totalPackets: 100,
  totalObservations: 200,
  activeObservers: 5,
  activeIatas: 2,
  windowHours: 24,
};

// Captures the packet handler the hook registers and lets the test push events through it.
function fakeManager() {
  const handlers: Array<(d: WsPacketObservation["data"]) => void> = [];
  const manager = {
    onPacketObservation: (h: (d: WsPacketObservation["data"]) => void) => {
      handlers.push(h);
      return () => {};
    },
  } as unknown as WsManager;
  return { manager, emit: (d: WsPacketObservation["data"]) => handlers.forEach((h) => h(d)) };
}

describe("useLiveOverview", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bumps the cached stats-overview counters on packet observations", () => {
    const qc = new QueryClient();
    qc.setQueryData<StatsOverview>(["stats-overview", "YOW"], overview);
    const { manager, emit } = fakeManager();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useLiveOverview(manager), { wrapper });

    emit({ packet: { isFirstObservation: true } } as WsPacketObservation["data"]);
    emit({ packet: { isFirstObservation: false } } as WsPacketObservation["data"]);
    rafCallbacks.forEach((cb) => cb(0)); // flush the coalesced frame

    const after = qc.getQueryData<StatsOverview>(["stats-overview", "YOW"]);
    expect(after?.totalPackets).toBe(101);
    expect(after?.totalObservations).toBe(202);
  });
});
