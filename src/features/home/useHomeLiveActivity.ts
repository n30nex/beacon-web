import { useCallback, useEffect, useRef, useState } from "react";
import type { WsManager, WsStatus } from "../../api/ws-manager";
import type { LiveSummary } from "../../types/api";
import type { WsPacketObservation } from "../../types/ws";
import type {
  IataCount,
  PayloadBreakdownItem,
  RouteMixItem,
  StatsHome,
  TopObserver,
} from "../stats/types";

export const HOME_LIVE_BATCH_MS = 250;
export const HOME_LIVE_BUFFER_LIMIT = 4_096;
export const HOME_LIVE_PACE_WINDOW_MS = 10_000;

export type HomeLiveState = "ACTIVE" | "QUIET" | "SYNCING" | "OFFLINE";

type PacketObservation = WsPacketObservation["data"];

export interface BufferedHomeLiveEvent {
  key: string;
  observationId: number | null;
  eventAt: number;
  receivedAt: number;
  homeSnapshotKey: string | null;
  data: PacketObservation;
}

export interface HomeLiveCarry {
  homeSnapshotKey: string;
  packetCount: number;
  observationCount: number;
}

export interface HomeLiveBuffer {
  events: readonly BufferedHomeLiveEvent[];
  keys: ReadonlySet<string>;
  paceTimestamps: readonly number[];
  paceStartedAt: number;
  homeCarry?: HomeLiveCarry;
}

export interface AppendHomeLiveEventOptions {
  iatas?: readonly string[];
  homeSnapshot?: StatsHome;
  liveSnapshot?: LiveSummary;
  now?: number;
  limit?: number;
}

export interface AppendHomeLiveEventResult {
  buffer: HomeLiveBuffer;
  accepted: boolean;
  overflowed: boolean;
}

interface SnapshotWatermark {
  latestObservationId: number;
  serverTime: number;
}

export interface UseHomeLiveActivityOptions {
  wsManager: WsManager;
  regionKey: string;
  iatas?: readonly string[];
  homeSnapshot?: StatsHome;
  liveSnapshot?: LiveSummary;
  refetchHome: () => unknown | Promise<unknown>;
  refetchLive: () => unknown | Promise<unknown>;
}

export interface HomeLiveActivity {
  home: StatsHome | undefined;
  live: LiveSummary | undefined;
  state: HomeLiveState;
  pacePerMinute: number | null;
  pulseRevision: number;
  isSyncing: boolean;
}

export function createHomeLiveBuffer(now = Date.now()): HomeLiveBuffer {
  return {
    events: [],
    keys: new Set<string>(),
    paceTimestamps: [],
    paceStartedAt: now,
  };
}

function homeSnapshotKey(snapshot: StatsHome | undefined): string | null {
  if (!snapshot) return null;
  const overview = snapshot.overview;
  return JSON.stringify([
    overview.totalPackets,
    overview.totalObservations,
    overview.activeObservers,
    overview.activeIatas,
    overview.windowHours,
  ]);
}

function observationIdOf(data: PacketObservation): number | null {
  const id = data.observation.id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function homeLiveEventKey(data: PacketObservation): string {
  const observationId = observationIdOf(data);
  if (observationId !== null) return `id:${observationId}`;

  const observation = data.observation;
  return [
    "fp",
    data.packetHash,
    observation.observerId,
    observation.iata.toUpperCase(),
    observation.heardAt,
    observation.sourceBroker,
  ].join("\u001f");
}

function eventTimestamp(data: PacketObservation, receivedAt: number): number {
  const heardAt = data.observation.heardAt;
  return typeof heardAt === "number" && Number.isFinite(heardAt) && heardAt > 0 ? heardAt : receivedAt;
}

function homeWatermark(snapshot: StatsHome | undefined): SnapshotWatermark | undefined {
  if (!snapshot) return undefined;
  return {
    latestObservationId: snapshot.live.latestObservationId,
    serverTime: snapshot.serverTime,
  };
}

function liveWatermark(snapshot: LiveSummary | undefined): SnapshotWatermark | undefined {
  if (!snapshot) return undefined;
  return {
    latestObservationId: snapshot.latestObservationId,
    serverTime: snapshot.serverTime,
  };
}

function eventIsNewerThan(event: BufferedHomeLiveEvent, watermark: SnapshotWatermark | undefined): boolean {
  if (!watermark) return true;
  if (event.observationId !== null) return event.observationId > watermark.latestObservationId;
  return event.eventAt > watermark.serverTime;
}

function matchesIata(data: PacketObservation, iatas: readonly string[] | undefined): boolean {
  if (!iatas || iatas.length === 0) return true;
  const eventIata = data.observation.iata.toUpperCase();
  return iatas.some((iata) => iata.toUpperCase() === eventIata);
}

export function appendHomeLiveEvent(
  buffer: HomeLiveBuffer,
  data: PacketObservation,
  options: AppendHomeLiveEventOptions = {},
): AppendHomeLiveEventResult {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? HOME_LIVE_BUFFER_LIMIT;
  if (!matchesIata(data, options.iatas)) return { buffer, accepted: false, overflowed: false };

  const key = homeLiveEventKey(data);
  if (buffer.keys.has(key)) return { buffer, accepted: false, overflowed: false };

  const event: BufferedHomeLiveEvent = {
    key,
    observationId: observationIdOf(data),
    eventAt: eventTimestamp(data, now),
    receivedAt: now,
    homeSnapshotKey: homeSnapshotKey(options.homeSnapshot),
    data,
  };
  const neededByHome = options.homeSnapshot
    ? eventIsNewerThan(event, homeWatermark(options.homeSnapshot))
    : false;
  const neededByLive = options.liveSnapshot
    ? eventIsNewerThan(event, liveWatermark(options.liveSnapshot))
    : false;
  if ((options.homeSnapshot || options.liveSnapshot) && !neededByHome && !neededByLive) {
    return { buffer, accepted: false, overflowed: false };
  }
  if (buffer.events.length >= limit) return { buffer, accepted: false, overflowed: true };

  const paceCutoff = now - HOME_LIVE_PACE_WINDOW_MS;
  const keys = new Set(buffer.keys);
  keys.add(key);
  return {
    buffer: {
      events: [...buffer.events, event],
      keys,
      paceTimestamps: [...buffer.paceTimestamps.filter((timestamp) => timestamp >= paceCutoff), now],
      paceStartedAt: buffer.paceStartedAt,
      homeCarry: buffer.homeCarry,
    },
    accepted: true,
    overflowed: false,
  };
}

export function rebaseHomeLiveBuffer(
  buffer: HomeLiveBuffer,
  homeSnapshot: StatsHome | undefined,
  liveSnapshot: LiveSummary | undefined,
  now = Date.now(),
): HomeLiveBuffer {
  const currentHomeKey = homeSnapshotKey(homeSnapshot);
  let homeCarry = currentHomeKey === null
    ? undefined
    : buffer.homeCarry?.homeSnapshotKey === currentHomeKey
      ? buffer.homeCarry
      : {
          homeSnapshotKey: currentHomeKey,
          packetCount: 0,
          observationCount: 0,
        };
  let carriedPackets = homeCarry?.packetCount ?? 0;
  let carriedObservations = homeCarry?.observationCount ?? 0;
  const events: BufferedHomeLiveEvent[] = [];
  for (const event of buffer.events) {
    const neededByHomeOverview = homeSnapshot
      ? event.homeSnapshotKey === currentHomeKey || eventIsNewerThan(event, homeWatermark(homeSnapshot))
      : false;
    const neededByRollingSnapshot = (homeSnapshot
      ? eventIsNewerThan(event, homeWatermark(homeSnapshot))
      : false)
      || (liveSnapshot ? eventIsNewerThan(event, liveWatermark(liveSnapshot)) : false);

    if (neededByHomeOverview && !neededByRollingSnapshot && homeCarry) {
      carriedPackets += event.data.packet.isFirstObservation ? 1 : 0;
      carriedObservations += 1;
    }
    if (neededByRollingSnapshot || (neededByHomeOverview && !homeCarry)) events.push(event);
  }
  if (homeCarry) {
    homeCarry = {
      homeSnapshotKey: homeCarry.homeSnapshotKey,
      packetCount: carriedPackets,
      observationCount: carriedObservations,
    };
  }
  return {
    events,
    keys: new Set(events.map((event) => event.key)),
    paceTimestamps: buffer.paceTimestamps.filter((timestamp) => timestamp >= now - HOME_LIVE_PACE_WINDOW_MS),
    paceStartedAt: buffer.paceStartedAt,
    homeCarry,
  };
}

export function homeLivePacePerMinute(buffer: HomeLiveBuffer, now = Date.now()): number | null {
  if (now - buffer.paceStartedAt < HOME_LIVE_PACE_WINDOW_MS) return null;
  const cutoff = now - HOME_LIVE_PACE_WINDOW_MS;
  const observations = buffer.paceTimestamps.filter((timestamp) => timestamp >= cutoff).length;
  return observations * (60_000 / HOME_LIVE_PACE_WINDOW_MS);
}

function eventsAfter(events: readonly BufferedHomeLiveEvent[], watermark: SnapshotWatermark): BufferedHomeLiveEvent[] {
  return events.filter((event) => eventIsNewerThan(event, watermark));
}

function incrementIatas<T extends { iata: string; count: number }>(rows: readonly T[], events: readonly BufferedHomeLiveEvent[]): T[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.data.observation.iata.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const count = counts.get(row.iata.toUpperCase()) ?? 0;
    return count > 0 ? { ...row, count: row.count + count } : row;
  });
}

function incrementObservers<T extends { observerId: string; observationCount: number }>(
  rows: readonly T[],
  events: readonly BufferedHomeLiveEvent[],
): T[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.data.observation.observerId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const count = counts.get(row.observerId) ?? 0;
    return count > 0 ? { ...row, observationCount: row.observationCount + count } : row;
  });
}

function incrementPayloadMix(
  rows: readonly PayloadBreakdownItem[],
  events: readonly BufferedHomeLiveEvent[],
): PayloadBreakdownItem[] {
  const deltas = new Map<number, { count: number; name: string }>();
  for (const event of events) {
    const packet = event.data.packet;
    const current = deltas.get(packet.payloadType);
    deltas.set(packet.payloadType, {
      count: (current?.count ?? 0) + 1,
      name: current?.name ?? packet.payloadTypeName,
    });
  }
  const seen = new Set<number>();
  const result = rows.map((row) => {
    seen.add(row.payloadType);
    const delta = deltas.get(row.payloadType)?.count ?? 0;
    return delta > 0 ? { ...row, count: row.count + delta } : row;
  });
  for (const [payloadType, delta] of deltas) {
    if (!seen.has(payloadType)) result.push({ payloadType, payloadTypeName: delta.name, count: delta.count });
  }
  return result;
}

function incrementRouteMix(rows: readonly RouteMixItem[], events: readonly BufferedHomeLiveEvent[]): RouteMixItem[] {
  const deltas = new Map<number, { count: number; name: string }>();
  for (const event of events) {
    const packet = event.data.packet;
    const current = deltas.get(packet.routeType);
    deltas.set(packet.routeType, {
      count: (current?.count ?? 0) + 1,
      name: current?.name ?? packet.routeTypeName,
    });
  }
  const seen = new Set<number>();
  const result = rows.map((row) => {
    seen.add(row.routeType);
    const delta = deltas.get(row.routeType)?.count ?? 0;
    return delta > 0 ? { ...row, count: row.count + delta } : row;
  });
  for (const [routeType, delta] of deltas) {
    if (!seen.has(routeType)) result.push({ routeType, routeTypeName: delta.name, count: delta.count });
  }
  return result;
}

function latestObservationId(base: number, events: readonly BufferedHomeLiveEvent[]): number {
  let latest = base;
  for (const event of events) {
    if (event.observationId !== null) latest = Math.max(latest, event.observationId);
  }
  return latest;
}

function packetDelta(events: readonly BufferedHomeLiveEvent[]): number {
  return events.reduce((count, event) => count + (event.data.packet.isFirstObservation ? 1 : 0), 0);
}

export function overlayStatsHome(snapshot: StatsHome | undefined, buffer: HomeLiveBuffer): StatsHome | undefined {
  if (!snapshot) return undefined;
  const watermark = homeWatermark(snapshot)!;
  const rollingEvents = eventsAfter(buffer.events, watermark);
  const currentHomeKey = homeSnapshotKey(snapshot);
  const overviewEvents = buffer.events.filter(
    (event) => event.homeSnapshotKey === currentHomeKey || eventIsNewerThan(event, watermark),
  );
  const carry = buffer.homeCarry?.homeSnapshotKey === currentHomeKey ? buffer.homeCarry : undefined;
  if (rollingEvents.length === 0 && overviewEvents.length === 0 && !carry) return snapshot;
  const overviewPackets = packetDelta(overviewEvents) + (carry?.packetCount ?? 0);
  const overviewObservations = overviewEvents.length + (carry?.observationCount ?? 0);
  const rollingPackets = packetDelta(rollingEvents);

  return {
    ...snapshot,
    overview: {
      ...snapshot.overview,
      totalPackets: snapshot.overview.totalPackets + overviewPackets,
      totalObservations: snapshot.overview.totalObservations + overviewObservations,
    },
    live: {
      ...snapshot.live,
      latestObservationId: latestObservationId(snapshot.live.latestObservationId, rollingEvents),
      packetCount: snapshot.live.packetCount + rollingPackets,
      observationCount: snapshot.live.observationCount + rollingEvents.length,
      payloadMix: incrementPayloadMix(snapshot.live.payloadMix, rollingEvents),
      routeMix: incrementRouteMix(snapshot.live.routeMix, rollingEvents),
      topIatas: incrementIatas<IataCount>(snapshot.live.topIatas, rollingEvents),
      topObservers: incrementObservers<TopObserver>(snapshot.live.topObservers, rollingEvents),
    },
    topIatas: incrementIatas<IataCount>(snapshot.topIatas, rollingEvents),
    topObservers: incrementObservers<TopObserver>(snapshot.topObservers, rollingEvents),
  };
}

export function overlayLiveSummary(snapshot: LiveSummary | undefined, buffer: HomeLiveBuffer): LiveSummary | undefined {
  if (!snapshot) return undefined;
  const events = eventsAfter(buffer.events, liveWatermark(snapshot)!);
  if (events.length === 0) return snapshot;
  const packets = packetDelta(events);

  return {
    ...snapshot,
    latestObservationId: latestObservationId(snapshot.latestObservationId, events),
    packetCount: snapshot.packetCount + packets,
    observationCount: snapshot.observationCount + events.length,
    payloadMix: incrementPayloadMix(snapshot.payloadMix, events),
    routeMix: incrementRouteMix(snapshot.routeMix, events),
    topIatas: incrementIatas(snapshot.topIatas, events),
    topObservers: incrementObservers(snapshot.topObservers, events),
  };
}

function managerStatus(manager: WsManager): WsStatus {
  return manager.getStatus?.() ?? "disconnected";
}

function managerSubscriptionReady(manager: WsManager): boolean {
  return Boolean(manager.getDiagnostics?.().activeSubscriptionId);
}

function refetchSucceeded(result: PromiseSettledResult<unknown>): boolean {
  if (result.status === "rejected") return false;
  if (!result.value || typeof result.value !== "object") return true;
  return !("isError" in result.value && result.value.isError === true);
}

export function useHomeLiveActivity({
  wsManager,
  regionKey,
  iatas,
  homeSnapshot,
  liveSnapshot,
  refetchHome,
  refetchLive,
}: UseHomeLiveActivityOptions): HomeLiveActivity {
  const [renderedBuffer, setRenderedBuffer] = useState(() => ({
    regionKey,
    buffer: createHomeLiveBuffer(),
  }));
  const bufferRef = useRef<HomeLiveBuffer>(renderedBuffer.buffer);
  const snapshotsRef = useRef({ homeSnapshot, liveSnapshot });
  const iatasRef = useRef(iatas);
  const refetchersRef = useRef({ refetchHome, refetchLive });
  const regionKeyRef = useRef(regionKey);
  const previousRegionKeyRef = useRef(regionKey);
  const mountedRef = useRef(true);
  const syncingRef = useRef(false);
  const reconcileRequestedRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileRef = useRef<(resetEvents?: boolean) => Promise<void>>(async () => undefined);
  const frozenSnapshotsRef = useRef<{ homeSnapshot?: StatsHome; liveSnapshot?: LiveSummary } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WsStatus>(() => managerStatus(wsManager));
  const [subscriptionReady, setSubscriptionReady] = useState(() => managerSubscriptionReady(wsManager));
  const [isSyncing, setIsSyncing] = useState(false);
  const [frozenSnapshots, setFrozenSnapshots] = useState<{
    homeSnapshot?: StatsHome;
    liveSnapshot?: LiveSummary;
  } | null>(null);
  const [pulseRevision, setPulseRevision] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    snapshotsRef.current = { homeSnapshot, liveSnapshot };
    iatasRef.current = iatas;
    refetchersRef.current = { refetchHome, refetchLive };
    regionKeyRef.current = regionKey;
  }, [homeSnapshot, iatas, liveSnapshot, refetchHome, refetchLive, regionKey]);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const reconcile = useCallback(async (resetEvents = false, queueIfBusy = true) => {
    if (resetEvents) bufferRef.current = createHomeLiveBuffer();
    if (syncingRef.current) {
      if (queueIfBusy) reconcileRequestedRef.current = true;
      return;
    }
    syncingRef.current = true;
    clearFlushTimer();
    clearRetryTimer();
    if (!resetEvents) {
      bufferRef.current = {
        ...bufferRef.current,
        paceTimestamps: [],
        paceStartedAt: Date.now(),
      };
    }
    if (mountedRef.current) {
      if (!frozenSnapshotsRef.current) {
        frozenSnapshotsRef.current = snapshotsRef.current;
        setFrozenSnapshots(snapshotsRef.current);
      }
      setIsSyncing(true);
    }

    const invokeRefetch = (refetch: () => unknown | Promise<unknown>): Promise<unknown> => {
      try {
        return Promise.resolve(refetch());
      } catch (error) {
        return Promise.reject(error);
      }
    };
    do {
      reconcileRequestedRef.current = false;
      const { refetchHome: refreshHome, refetchLive: refreshLive } = refetchersRef.current;
      const results = await Promise.allSettled([
        invokeRefetch(refreshHome),
        invokeRefetch(refreshLive),
      ]);
      if (!results.every(refetchSucceeded)) {
        syncingRef.current = false;
        if (mountedRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void reconcileRef.current();
          }, 2_000);
        }
        return;
      }
      bufferRef.current = rebaseHomeLiveBuffer(
        bufferRef.current,
        snapshotsRef.current.homeSnapshot,
        snapshotsRef.current.liveSnapshot,
      );
    } while (reconcileRequestedRef.current && mountedRef.current);

    syncingRef.current = false;
    if (mountedRef.current) {
      frozenSnapshotsRef.current = null;
      setFrozenSnapshots(null);
      setIsSyncing(false);
      setRenderedBuffer({ regionKey: regionKeyRef.current, buffer: bufferRef.current });
    }
  }, [clearFlushTimer, clearRetryTimer]);

  useEffect(() => {
    reconcileRef.current = reconcile;
  }, [reconcile]);

  const scheduleFlush = useCallback(() => {
    if (syncingRef.current || flushTimerRef.current !== null || document.visibilityState === "hidden") return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      if (syncingRef.current || !mountedRef.current || document.visibilityState === "hidden") return;
      setPulseRevision((revision) => revision + 1);
      setRenderedBuffer({ regionKey: regionKeyRef.current, buffer: bufferRef.current });
    }, HOME_LIVE_BATCH_MS);
  }, []);

  useEffect(() => {
    let previousStatus = managerStatus(wsManager);

    const offPacket = wsManager.onPacketObservation((data) => {
      const snapshots = snapshotsRef.current;
      const result = appendHomeLiveEvent(bufferRef.current, data, {
        iatas: iatasRef.current,
        homeSnapshot: snapshots.homeSnapshot,
        liveSnapshot: snapshots.liveSnapshot,
      });
      if (result.overflowed) {
        void reconcile();
        return;
      }
      if (!result.accepted) return;
      bufferRef.current = result.buffer;
      scheduleFlush();
    });
    const offLagged = wsManager.onLagged((notice) => {
      // WsManager emits a zero-drop synthetic lag immediately after the connected status on
      // reconnect. The connected handler already started the same reconciliation; real lag
      // notices still queue one follow-up pass if a refresh is in flight.
      void reconcile(false, notice.droppedCount !== 0);
    });
    const offStatus = wsManager.onStatusChange((status) => {
      const wasConnected = previousStatus === "connected";
      previousStatus = status;
      if (mountedRef.current) setConnectionStatus(status);
      if (status === "connected" && !wasConnected) void reconcile();
    });
    const offDiagnostics = wsManager.onDiagnosticsChange(() => {
      if (mountedRef.current) setSubscriptionReady(managerSubscriptionReady(wsManager));
    });

    return () => {
      offPacket();
      offLagged();
      offStatus();
      offDiagnostics();
    };
  }, [reconcile, scheduleFlush, wsManager]);

  useEffect(() => {
    if (previousRegionKeyRef.current === regionKey) return;
    previousRegionKeyRef.current = regionKey;
    void reconcile(true);
  }, [reconcile, regionKey]);

  useEffect(() => {
    bufferRef.current = rebaseHomeLiveBuffer(bufferRef.current, homeSnapshot, liveSnapshot);
  }, [homeSnapshot, liveSnapshot]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reconcile]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!mountedRef.current || document.visibilityState === "hidden") return;
      const now = Date.now();
      bufferRef.current = {
        ...bufferRef.current,
        paceTimestamps: bufferRef.current.paceTimestamps.filter(
          (timestamp) => timestamp >= now - HOME_LIVE_PACE_WINDOW_MS,
        ),
      };
      setClockNow(now);
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      syncingRef.current = false;
      clearFlushTimer();
      clearRetryTimer();
    };
  }, [clearFlushTimer, clearRetryTimer]);

  const visibleBuffer = renderedBuffer.regionKey === regionKey
    ? renderedBuffer.buffer
    : createHomeLiveBuffer(clockNow);
  const displayedHomeSnapshot = frozenSnapshots !== null ? frozenSnapshots.homeSnapshot : homeSnapshot;
  const displayedLiveSnapshot = frozenSnapshots !== null ? frozenSnapshots.liveSnapshot : liveSnapshot;
  const home = overlayStatsHome(displayedHomeSnapshot, visibleBuffer);
  const live = overlayLiveSummary(displayedLiveSnapshot, visibleBuffer);
  const pacePerMinute = homeLivePacePerMinute(visibleBuffer, clockNow);
  let state: HomeLiveState;
  if (isSyncing || renderedBuffer.regionKey !== regionKey || connectionStatus === "connecting" || (connectionStatus === "connected" && !subscriptionReady)) state = "SYNCING";
  else if (connectionStatus !== "connected") state = "OFFLINE";
  else state = (live?.observationCount ?? home?.live.observationCount ?? 0) > 0 ? "ACTIVE" : "QUIET";

  return { home, live, state, pacePerMinute, pulseRevision, isSyncing };
}
