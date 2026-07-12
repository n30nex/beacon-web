import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsDiagnostics, WsManager, WsStatus } from "../../../src/api/ws-manager";
import {
  appendHomeLiveEvent,
  createHomeLiveBuffer,
  HOME_LIVE_BATCH_MS,
  homeLivePacePerMinute,
  overlayLiveSummary,
  overlayStatsHome,
  rebaseHomeLiveBuffer,
  useHomeLiveActivity,
} from "../../../src/features/home/useHomeLiveActivity";
import type { StatsHome } from "../../../src/features/stats/types";
import type { LiveSummary } from "../../../src/types/api";
import type { WsLagged, WsPacketObservation } from "../../../src/types/ws";

type PacketObservation = WsPacketObservation["data"];

function event({
  id,
  iata = "YOW",
  observerId = "obs-a",
  heardAt = 1_300,
  first = false,
  payloadType = 1,
  payloadTypeName = "Advert",
  routeType = 1,
  routeTypeName = "Direct",
  packetHash = `hash-${id ?? heardAt}`,
}: {
  id?: number;
  iata?: string;
  observerId?: string;
  heardAt?: number;
  first?: boolean;
  payloadType?: number;
  payloadTypeName?: string;
  routeType?: number;
  routeTypeName?: string;
  packetHash?: string;
} = {}): PacketObservation {
  return {
    packetHash,
    packet: {
      payloadType,
      payloadTypeName,
      routeType,
      routeTypeName,
      isFirstObservation: first,
      observationCount: 1,
    },
    observation: {
      ...(id === undefined ? {} : { id }),
      observerId,
      observerName: observerId,
      iata,
      heardAt,
      rssi: -90,
      snr: 7,
      sourceBroker: "mqtt-1",
    },
  };
}

function homeSnapshot(overrides: Partial<StatsHome> = {}): StatsHome {
  return {
    serverTime: 1_000,
    window: { since: 0, until: 1_000, bucket: "1h" },
    overview: { totalPackets: 100, totalObservations: 200, activeObservers: 3, activeIatas: 2, windowHours: 24 },
    live: {
      serverTime: 1_000,
      since: 0,
      until: 1_000,
      latestObservationId: 100,
      packetCount: 10,
      observationCount: 20,
      activeObservers: 2,
      payloadMix: [{ payloadType: 1, payloadTypeName: "Advert", count: 8 }],
      routeMix: [{ routeType: 1, routeTypeName: "Direct", count: 12 }],
      topIatas: [{ iata: "YOW", count: 15 }],
      topObservers: [{ observerId: "obs-a", displayName: "Alpha", observerType: "mqtt", iata: "YOW", observationCount: 11 }],
    },
    topIatas: [{ iata: "YOW", count: 150 }, { iata: "YYZ", count: 120 }],
    topObservers: [
      { observerId: "obs-a", displayName: "Alpha", observerType: "mqtt", iata: "YOW", observationCount: 110 },
      { observerId: "obs-b", displayName: "Beta", observerType: "mqtt", iata: "YYZ", observationCount: 90 },
    ],
    topNodes: [],
    ...overrides,
  };
}

function liveSnapshot(overrides: Partial<LiveSummary> = {}): LiveSummary {
  return {
    serverTime: 1_200,
    since: 200,
    until: 1_200,
    latestObservationId: 102,
    packetCount: 12,
    observationCount: 24,
    activeObservers: 2,
    payloadMix: [{ payloadType: 1, payloadTypeName: "Advert", count: 10 }],
    routeMix: [{ routeType: 1, routeTypeName: "Direct", count: 14 }],
    topIatas: [{ iata: "YOW", count: 18 }],
    topObservers: [{ observerId: "obs-a", displayName: "Alpha", observerType: "mqtt", iata: "YOW", observationCount: 13 }],
    ...overrides,
  };
}

function append(
  buffer: ReturnType<typeof createHomeLiveBuffer>,
  data: PacketObservation,
  options: Parameters<typeof appendHomeLiveEvent>[2] = {},
) {
  return appendHomeLiveEvent(buffer, data, options).buffer;
}

describe("Home live overlay model", () => {
  it("overlays each immutable REST snapshot above its own watermark", () => {
    const home = homeSnapshot();
    const live = liveSnapshot();
    const originalHome = structuredClone(home);
    const originalLive = structuredClone(live);
    let buffer = createHomeLiveBuffer(900);
    buffer = append(buffer, event({ id: 101, first: true }), { homeSnapshot: home, liveSnapshot: live, now: 1_010 });
    buffer = append(buffer, event({ id: 103, routeType: 2, routeTypeName: "Flood", payloadType: 2, payloadTypeName: "Text" }), { homeSnapshot: home, liveSnapshot: live, now: 1_020 });
    buffer = append(buffer, event({ iata: "YVR", observerId: "obs-new", heardAt: 1_300 }), { homeSnapshot: home, liveSnapshot: live, now: 1_030 });

    const homeOverlay = overlayStatsHome(home, buffer)!;
    const liveOverlay = overlayLiveSummary(live, buffer)!;

    expect(homeOverlay.overview).toMatchObject({ totalPackets: 101, totalObservations: 203 });
    expect(homeOverlay.live).toMatchObject({ latestObservationId: 103, packetCount: 11, observationCount: 23 });
    expect(homeOverlay.live.routeMix).toEqual([
      { routeType: 1, routeTypeName: "Direct", count: 14 },
      { routeType: 2, routeTypeName: "Flood", count: 1 },
    ]);
    expect(homeOverlay.live.payloadMix).toEqual([
      { payloadType: 1, payloadTypeName: "Advert", count: 10 },
      { payloadType: 2, payloadTypeName: "Text", count: 1 },
    ]);
    expect(homeOverlay.topIatas.map((row) => row.iata)).toEqual(["YOW", "YYZ"]);
    expect(homeOverlay.topIatas[0]?.count).toBe(152);
    expect(homeOverlay.topObservers.map((row) => row.observerId)).toEqual(["obs-a", "obs-b"]);
    expect(homeOverlay.topObservers[0]?.observationCount).toBe(112);

    expect(liveOverlay).toMatchObject({ latestObservationId: 103, packetCount: 12, observationCount: 26 });
    expect(liveOverlay.routeMix).toEqual([
      { routeType: 1, routeTypeName: "Direct", count: 15 },
      { routeType: 2, routeTypeName: "Flood", count: 1 },
    ]);
    expect(home).toEqual(originalHome);
    expect(live).toEqual(originalLive);
  });

  it("accepts unique out-of-order IDs while rejecting duplicates, fallback replays, stale events, and other IATAs", () => {
    const home = homeSnapshot();
    const live = liveSnapshot({ latestObservationId: 100, serverTime: 1_000 });
    let buffer = createHomeLiveBuffer(900);
    const options = { iatas: ["YOW"], homeSnapshot: home, liveSnapshot: live, now: 1_100 };

    let result = appendHomeLiveEvent(buffer, event({ id: 103 }), options);
    expect(result.accepted).toBe(true);
    buffer = result.buffer;
    result = appendHomeLiveEvent(buffer, event({ id: 101 }), { ...options, now: 1_110 });
    expect(result.accepted).toBe(true);
    buffer = result.buffer;
    expect(appendHomeLiveEvent(buffer, event({ id: 103 }), options).accepted).toBe(false);
    expect(appendHomeLiveEvent(buffer, event({ id: 99 }), options).accepted).toBe(false);
    expect(appendHomeLiveEvent(buffer, event({ id: 104, iata: "YVR" }), options).accepted).toBe(false);

    const fallback = event({ heardAt: 1_200, packetHash: "fallback" });
    result = appendHomeLiveEvent(buffer, fallback, { ...options, now: 1_120 });
    expect(result.accepted).toBe(true);
    buffer = result.buffer;
    expect(appendHomeLiveEvent(buffer, fallback, { ...options, now: 1_130 }).accepted).toBe(false);
    expect(buffer.events.map((item) => item.observationId)).toEqual([103, 101, null]);
  });

  it("rebases covered events and permits authoritative rolling-window totals to decrease", () => {
    const initial = liveSnapshot({ latestObservationId: 100, observationCount: 100 });
    let buffer = createHomeLiveBuffer(900);
    buffer = append(buffer, event({ id: 101 }), { liveSnapshot: initial, now: 1_100 });
    expect(overlayLiveSummary(initial, buffer)?.observationCount).toBe(101);

    const rolled = liveSnapshot({ latestObservationId: 101, observationCount: 90, serverTime: 1_400 });
    buffer = rebaseHomeLiveBuffer(buffer, undefined, rolled, 1_400);
    expect(buffer.events).toHaveLength(0);
    expect(overlayLiveSummary(rolled, buffer)?.observationCount).toBe(90);
  });

  it("keeps 24-hour deltas when only the fresher rolling watermark advances", () => {
    const initialHome = homeSnapshot({
      live: { ...homeSnapshot().live, latestObservationId: 100 },
    });
    const initialLive = liveSnapshot({ latestObservationId: 100 });
    let buffer = rebaseHomeLiveBuffer(createHomeLiveBuffer(900), initialHome, initialLive, 1_000);
    buffer = append(buffer, event({ id: 101, first: true }), {
      homeSnapshot: initialHome,
      liveSnapshot: initialLive,
      now: 1_100,
    });

    const refreshedHome = homeSnapshot({
      serverTime: 1_200,
      topObservers: [
        { observerId: "obs-a", displayName: "Alpha", observerType: "mqtt", iata: "YOW", observationCount: 111 },
        { observerId: "obs-b", displayName: "Beta", observerType: "mqtt", iata: "YYZ", observationCount: 90 },
      ],
      live: {
        ...homeSnapshot().live,
        latestObservationId: 101,
        packetCount: 11,
        observationCount: 21,
      },
    });
    const refreshedLive = liveSnapshot({ latestObservationId: 101 });
    buffer = rebaseHomeLiveBuffer(buffer, refreshedHome, refreshedLive, 1_200);

    expect(buffer.events).toHaveLength(0);
    expect(buffer.homeCarry).toMatchObject({ packetCount: 1, observationCount: 1 });
    expect(overlayStatsHome(refreshedHome, buffer)?.overview).toMatchObject({
      totalPackets: 101,
      totalObservations: 201,
    });
    expect(overlayStatsHome(refreshedHome, buffer)?.live).toMatchObject({
      packetCount: 11,
      observationCount: 21,
    });
    expect(overlayStatsHome(refreshedHome, buffer)?.topObservers[0]?.observationCount).toBe(111);

    const refreshedOverview = homeSnapshot({
      serverTime: 2_000,
      overview: { ...homeSnapshot().overview, totalPackets: 101, totalObservations: 201 },
      live: { ...homeSnapshot().live, latestObservationId: 101 },
    });
    buffer = rebaseHomeLiveBuffer(buffer, refreshedOverview, refreshedLive, 2_000);
    expect(buffer.homeCarry).toMatchObject({ packetCount: 0, observationCount: 0 });
    expect(overlayStatsHome(refreshedOverview, buffer)?.overview).toMatchObject({
      totalPackets: 101,
      totalObservations: 201,
    });
  });

  it("reports overflow without growing beyond its bound", () => {
    let buffer = createHomeLiveBuffer(0);
    buffer = append(buffer, event({ id: 1 }), { now: 1, limit: 2 });
    buffer = append(buffer, event({ id: 2 }), { now: 2, limit: 2 });
    const result = appendHomeLiveEvent(buffer, event({ id: 3 }), { now: 3, limit: 2 });
    expect(result).toMatchObject({ accepted: false, overflowed: true });
    expect(result.buffer.events).toHaveLength(2);
  });

  it("exposes a ten-second observations-per-minute pace only after warmup", () => {
    let buffer = createHomeLiveBuffer(0);
    buffer = append(buffer, event({ id: 1 }), { now: 1_000 });
    buffer = append(buffer, event({ id: 2 }), { now: 9_000 });
    expect(homeLivePacePerMinute(buffer, 9_999)).toBeNull();
    expect(homeLivePacePerMinute(buffer, 10_000)).toBe(12);
    expect(homeLivePacePerMinute(buffer, 12_000)).toBe(6);
  });
});

function fakeManager(initialStatus: WsStatus = "connected", initialSubscribed = true) {
  const packetHandlers = new Set<(data: PacketObservation) => void>();
  const laggedHandlers = new Set<(data: WsLagged) => void>();
  const statusHandlers = new Set<(status: WsStatus) => void>();
  const diagnosticsHandlers = new Set<(diagnostics: WsDiagnostics) => void>();
  let status = initialStatus;
  let subscribed = initialSubscribed;
  const diagnostics = (): WsDiagnostics => ({
    status,
    lastEventTimestamp: 0,
    connectedAt: status === "connected" ? 1 : null,
    reconnectAttempt: 0,
    parseFailureCount: 0,
    lastParseFailureAt: null,
    laggedNoticeCount: 0,
    lastLaggedAt: null,
    lastLaggedDroppedCount: null,
    lastLaggedSince: null,
    activeSubscriptionId: subscribed ? "sub-1" : null,
  });
  const manager = {
    getStatus: () => status,
    getDiagnostics: diagnostics,
    onPacketObservation: (handler: (data: PacketObservation) => void) => {
      packetHandlers.add(handler);
      return () => packetHandlers.delete(handler);
    },
    onLagged: (handler: (data: WsLagged) => void) => {
      laggedHandlers.add(handler);
      return () => laggedHandlers.delete(handler);
    },
    onStatusChange: (handler: (next: WsStatus) => void) => {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    onDiagnosticsChange: (handler: (next: WsDiagnostics) => void) => {
      diagnosticsHandlers.add(handler);
      return () => diagnosticsHandlers.delete(handler);
    },
  } as unknown as WsManager;
  return {
    manager,
    emit: (data: PacketObservation) => packetHandlers.forEach((handler) => handler(data)),
    lag: (droppedCount = 3) => laggedHandlers.forEach((handler) => handler({ v: 1, type: "lagged", droppedCount, since: 0 })),
    setStatus: (next: WsStatus) => {
      status = next;
      statusHandlers.forEach((handler) => handler(next));
    },
    setSubscribed: (next: boolean) => {
      subscribed = next;
      diagnosticsHandlers.forEach((handler) => handler(diagnostics()));
    },
    listenerCount: () => packetHandlers.size + laggedHandlers.size + statusHandlers.size + diagnosticsHandlers.size,
  };
}

describe("useHomeLiveActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces events into 250ms visual batches", () => {
    const socket = fakeManager();
    const home = homeSnapshot({ serverTime: 9_000, live: { ...homeSnapshot().live, latestObservationId: 10 } });
    const live = liveSnapshot({ serverTime: 9_000, latestObservationId: 10 });
    const { result } = renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: home,
      liveSnapshot: live,
      refetchHome: vi.fn(),
      refetchLive: vi.fn(),
    }));

    act(() => {
      socket.emit(event({ id: 11, heardAt: 10_001, first: true }));
      socket.emit(event({ id: 12, heardAt: 10_002 }));
      vi.advanceTimersByTime(HOME_LIVE_BATCH_MS - 1);
    });
    expect(result.current.home?.overview.totalObservations).toBe(200);
    expect(result.current.pulseRevision).toBe(0);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.home?.overview).toMatchObject({ totalPackets: 101, totalObservations: 202 });
    expect(result.current.live).toMatchObject({ packetCount: 13, observationCount: 26 });
    expect(result.current.pulseRevision).toBe(1);
    expect(result.current.state).toBe("ACTIVE");
  });

  it("freezes the visible overlay while lag reconciliation runs, then resumes without an extra pulse", async () => {
    const socket = fakeManager();
    let resolveHome!: () => void;
    let resolveLive!: () => void;
    const refetchHome = vi.fn(() => new Promise<void>((resolve) => { resolveHome = resolve; }));
    const refetchLive = vi.fn(() => new Promise<void>((resolve) => { resolveLive = resolve; }));
    const home = homeSnapshot({ serverTime: 9_000, live: { ...homeSnapshot().live, latestObservationId: 10 } });
    const live = liveSnapshot({ serverTime: 9_000, latestObservationId: 10 });
    const { result } = renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: home,
      liveSnapshot: live,
      refetchHome,
      refetchLive,
    }));

    act(() => {
      socket.emit(event({ id: 11, heardAt: 10_001 }));
      vi.advanceTimersByTime(HOME_LIVE_BATCH_MS);
    });
    expect(result.current.home?.overview.totalObservations).toBe(201);

    act(() => socket.lag());
    expect(result.current.state).toBe("SYNCING");
    expect(result.current.home?.overview.totalObservations).toBe(201);
    act(() => socket.emit(event({ id: 12, heardAt: 10_002 })));
    expect(result.current.home?.overview.totalObservations).toBe(201);

    await act(async () => {
      resolveHome();
      resolveLive();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("ACTIVE");
    expect(result.current.home?.overview.totalObservations).toBe(202);
    expect(result.current.pulseRevision).toBe(1);
  });

  it("reconciles on visibility return and reconnect, waits for subscription readiness, and cleans up", async () => {
    const socket = fakeManager("connected", true);
    const refetchHome = vi.fn(async () => undefined);
    const refetchLive = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: homeSnapshot(),
      liveSnapshot: liveSnapshot(),
      refetchHome,
      refetchLive,
    }));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(refetchHome).toHaveBeenCalledTimes(1);
    expect(refetchLive).toHaveBeenCalledTimes(1);

    act(() => socket.setStatus("connecting"));
    expect(result.current.state).toBe("SYNCING");
    act(() => {
      socket.setSubscribed(false);
      socket.setStatus("connected");
    });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state).toBe("SYNCING");
    act(() => socket.setSubscribed(true));
    expect(result.current.state).toBe("ACTIVE");
    expect(refetchHome).toHaveBeenCalledTimes(2);
    expect(refetchLive).toHaveBeenCalledTimes(2);

    expect(socket.listenerCount()).toBe(4);
    unmount();
    expect(socket.listenerCount()).toBe(0);
  });

  it("stays syncing after a failed reconciliation and retries instead of claiming the gap healed", async () => {
    const socket = fakeManager();
    const refetchHome = vi.fn()
      .mockResolvedValueOnce({ isError: true })
      .mockResolvedValue({ isError: false });
    const refetchLive = vi.fn().mockResolvedValue({ isError: false });
    const { result } = renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: homeSnapshot(),
      liveSnapshot: liveSnapshot(),
      refetchHome,
      refetchLive,
    }));

    await act(async () => {
      socket.lag();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("SYNCING");
    expect(refetchHome).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });
    expect(refetchHome).toHaveBeenCalledTimes(2);
    expect(refetchLive).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("ACTIVE");
  });

  it("deduplicates the connected and lag signals emitted by one reconnect", async () => {
    const socket = fakeManager("connecting", false);
    let resolveHome!: () => void;
    let resolveLive!: () => void;
    const refetchHome = vi.fn(() => new Promise<void>((resolve) => { resolveHome = resolve; }));
    const refetchLive = vi.fn(() => new Promise<void>((resolve) => { resolveLive = resolve; }));
    renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: homeSnapshot(),
      liveSnapshot: liveSnapshot(),
      refetchHome,
      refetchLive,
    }));

    act(() => {
      socket.setStatus("connected");
      socket.lag(0);
    });
    expect(refetchHome).toHaveBeenCalledTimes(1);
    expect(refetchLive).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveHome();
      resolveLive();
      await Promise.resolve();
    });
    expect(refetchHome).toHaveBeenCalledTimes(1);
    expect(refetchLive).toHaveBeenCalledTimes(1);
  });

  it("queues a genuine lag that arrives during an in-flight reconciliation", async () => {
    const socket = fakeManager();
    let resolveFirstHome!: () => void;
    let resolveFirstLive!: () => void;
    const refetchHome = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstHome = resolve; }))
      .mockResolvedValue(undefined);
    const refetchLive = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstLive = resolve; }))
      .mockResolvedValue(undefined);
    renderHook(() => useHomeLiveActivity({
      wsManager: socket.manager,
      regionKey: "YOW",
      iatas: ["YOW"],
      homeSnapshot: homeSnapshot(),
      liveSnapshot: liveSnapshot(),
      refetchHome,
      refetchLive,
    }));

    act(() => {
      socket.lag();
      socket.lag();
    });
    expect(refetchHome).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstHome();
      resolveFirstLive();
      await Promise.resolve();
    });
    expect(refetchHome).toHaveBeenCalledTimes(2);
    expect(refetchLive).toHaveBeenCalledTimes(2);
  });

  it("resets the overlay synchronously when the region changes", async () => {
    const socket = fakeManager();
    const refetchHome = vi.fn(async () => undefined);
    const refetchLive = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ regionKey, home, live }: { regionKey: string; home: StatsHome; live: LiveSummary }) => useHomeLiveActivity({
        wsManager: socket.manager,
        regionKey,
        iatas: [regionKey],
        homeSnapshot: home,
        liveSnapshot: live,
        refetchHome,
        refetchLive,
      }),
      { initialProps: { regionKey: "YOW", home: homeSnapshot({ live: { ...homeSnapshot().live, latestObservationId: 10 } }), live: liveSnapshot({ latestObservationId: 10 }) } },
    );
    act(() => {
      socket.emit(event({ id: 11, heardAt: 10_001 }));
      vi.advanceTimersByTime(HOME_LIVE_BATCH_MS);
    });
    expect(result.current.home?.overview.totalObservations).toBe(201);

    const yvrHome = homeSnapshot({ overview: { ...homeSnapshot().overview, totalObservations: 50 }, live: { ...homeSnapshot().live, latestObservationId: 20 } });
    const yvrLive = liveSnapshot({ latestObservationId: 20 });
    rerender({ regionKey: "YVR", home: yvrHome, live: yvrLive });
    expect(result.current.home?.overview.totalObservations).toBe(50);
    await act(async () => { await Promise.resolve(); });
    expect(refetchHome).toHaveBeenCalledTimes(1);
    expect(refetchLive).toHaveBeenCalledTimes(1);
  });
});
