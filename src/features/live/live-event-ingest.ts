import {
  LIVE_FEED_CAP,
  mergeLiveEventsByObservation,
  type LivePacketEvent,
} from "./live-model";
import { LIVE_STATE_FLUSH_MS } from "./live-visuals";

interface MutableRef<T> {
  current: T;
}

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

export interface LivePendingStateRefs {
  liveStateFlushTimerRef: MutableRef<number>;
  pendingEventsRef: MutableRef<LivePacketEvent[]>;
  pendingQueuedEventsRef: MutableRef<LivePacketEvent[]>;
  pendingTotalPacketsRef: MutableRef<number>;
  pendingVisualDroppedRef: MutableRef<number>;
}

export interface LiveObservationRefs {
  lastObservationIdRef: MutableRef<number>;
  seenObservationIdsRef: MutableRef<Set<number>>;
  seenObservationOrderRef: MutableRef<number[]>;
}

export interface LiveEventIngestRefs extends LivePendingStateRefs, LiveObservationRefs {
  pausedRef: MutableRef<boolean>;
}

export function flushPendingLiveState(options: {
  refs: LivePendingStateRefs;
  setEvents: StateSetter<LivePacketEvent[]>;
  setQueuedEvents: StateSetter<LivePacketEvent[]>;
  setTotalPackets: StateSetter<number>;
  setVisualDroppedCount: StateSetter<number>;
}) {
  const { refs } = options;
  if (refs.liveStateFlushTimerRef.current !== 0) {
    window.clearTimeout(refs.liveStateFlushTimerRef.current);
    refs.liveStateFlushTimerRef.current = 0;
  }

  const pendingTotal = refs.pendingTotalPacketsRef.current;
  if (pendingTotal > 0) {
    refs.pendingTotalPacketsRef.current = 0;
    options.setTotalPackets((count) => count + pendingTotal);
  }

  const pendingEvents = refs.pendingEventsRef.current;
  if (pendingEvents.length > 0) {
    refs.pendingEventsRef.current = [];
    const newestFirst = pendingEvents.slice().reverse();
    options.setEvents((items) => mergeLiveEventsByObservation(items, newestFirst, LIVE_FEED_CAP));
  }

  const pendingQueuedEvents = refs.pendingQueuedEventsRef.current;
  if (pendingQueuedEvents.length > 0) {
    refs.pendingQueuedEventsRef.current = [];
    const newestFirst = pendingQueuedEvents.slice().reverse();
    options.setQueuedEvents((items) => mergeLiveEventsByObservation(items, newestFirst, LIVE_FEED_CAP));
  }

  const pendingVisualDropped = refs.pendingVisualDroppedRef.current;
  if (pendingVisualDropped > 0) {
    refs.pendingVisualDroppedRef.current = 0;
    options.setVisualDroppedCount((count) => count + pendingVisualDropped);
  }
}

export function schedulePendingLiveStateFlush(options: {
  flushLiveState: () => void;
  liveStateFlushTimerRef: MutableRef<number>;
}) {
  if (options.liveStateFlushTimerRef.current !== 0) return;
  options.liveStateFlushTimerRef.current = window.setTimeout(options.flushLiveState, LIVE_STATE_FLUSH_MS);
}

export function clearPendingLiveStateFlush(liveStateFlushTimerRef: MutableRef<number>) {
  if (liveStateFlushTimerRef.current === 0) return;
  window.clearTimeout(liveStateFlushTimerRef.current);
  liveStateFlushTimerRef.current = 0;
}

export function rememberLiveObservation(refs: LiveObservationRefs, event: LivePacketEvent): boolean {
  const id = event.observationId;
  if (typeof id !== "number" || id <= 0) return true;
  refs.lastObservationIdRef.current = Math.max(refs.lastObservationIdRef.current, id);
  const seen = refs.seenObservationIdsRef.current;
  if (seen.has(id)) return false;
  seen.add(id);
  refs.seenObservationOrderRef.current.push(id);
  if (refs.seenObservationOrderRef.current.length > 1_200) {
    for (const old of refs.seenObservationOrderRef.current.splice(0, 300)) {
      seen.delete(old);
    }
  }
  return true;
}

export function acceptLiveEventForIngest(options: {
  animate?: boolean;
  event: LivePacketEvent;
  refs: LiveEventIngestRefs;
  scheduleAnimation: (event: LivePacketEvent) => void;
  scheduleLiveStateFlush: () => void;
  shouldAnimateEvent: (event: LivePacketEvent) => boolean;
}): boolean {
  const { event, refs } = options;
  if (!rememberLiveObservation(refs, event)) return false;
  refs.pendingTotalPacketsRef.current += 1;
  if (refs.pausedRef.current) {
    refs.pendingQueuedEventsRef.current.push(event);
    if (refs.pendingQueuedEventsRef.current.length > LIVE_FEED_CAP) {
      refs.pendingQueuedEventsRef.current = refs.pendingQueuedEventsRef.current.slice(-LIVE_FEED_CAP);
    }
    options.scheduleLiveStateFlush();
    return true;
  }

  const animate = options.animate ?? true;
  if (animate && options.shouldAnimateEvent(event)) {
    options.scheduleAnimation(event);
  } else if (animate) {
    refs.pendingVisualDroppedRef.current += 1;
  }
  refs.pendingEventsRef.current.push(event);
  if (refs.pendingEventsRef.current.length > LIVE_FEED_CAP) {
    refs.pendingEventsRef.current = refs.pendingEventsRef.current.slice(-LIVE_FEED_CAP);
  }
  options.scheduleLiveStateFlush();
  return true;
}

export function resetLiveEventIngestState(options: {
  lastObservationIdRef: MutableRef<number>;
  seededLiveCursorRef: MutableRef<string>;
  seenObservationIdsRef: MutableRef<Set<number>>;
  seenObservationOrderRef: MutableRef<number[]>;
  setBackfillCount: StateSetter<number>;
  setBackfillStatus: StateSetter<string>;
  setEvents: StateSetter<LivePacketEvent[]>;
  setLaggedCount: StateSetter<number>;
  setPacketWaitStartedAt: StateSetter<number>;
  setQueuedEvents: StateSetter<LivePacketEvent[]>;
  setSelectedEvent: StateSetter<LivePacketEvent | null>;
}) {
  options.lastObservationIdRef.current = 0;
  options.seededLiveCursorRef.current = "";
  options.seenObservationIdsRef.current.clear();
  options.seenObservationOrderRef.current = [];
  options.setEvents([]);
  options.setQueuedEvents([]);
  options.setSelectedEvent(null);
  options.setLaggedCount(0);
  options.setBackfillCount(0);
  options.setBackfillStatus("ok");
  options.setPacketWaitStartedAt(Date.now());
}
