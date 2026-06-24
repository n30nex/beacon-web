import { describe, expect, it, vi } from "vitest";
import type { LivePacketEvent } from "../../../src/features/live/live-model";
import {
  acceptLiveEventForIngest,
  flushPendingLiveState,
  rememberLiveObservation,
} from "../../../src/features/live/live-event-ingest";

function event(overrides: Partial<LivePacketEvent> = {}): LivePacketEvent {
  return {
    id: "event-1",
    sequence: 1,
    packetHash: "abc123",
    payloadType: 1,
    payloadTypeName: "TEXT_MESSAGE",
    routeType: 0,
    routeTypeName: "DIRECT",
    observationCount: 1,
    observationId: 10,
    observerId: "observer-1",
    observerName: "Observer",
    iata: "YYZ",
    heardAt: Date.now(),
    receivedAt: Date.now(),
    rssi: -80,
    snr: 4,
    sourceBroker: "test",
    ...overrides,
  };
}

function ref<T>(current: T) {
  return { current };
}

describe("live-event-ingest", () => {
  it("deduplicates observations while retaining the latest cursor", () => {
    const refs = {
      lastObservationIdRef: ref(0),
      seenObservationIdsRef: ref(new Set<number>()),
      seenObservationOrderRef: ref<number[]>([]),
    };
    const first = event({ observationId: 42 });
    const duplicate = event({ id: "event-duplicate", sequence: 2, observationId: 42 });

    expect(rememberLiveObservation(refs, first)).toBe(true);
    expect(rememberLiveObservation(refs, duplicate)).toBe(false);
    expect(refs.lastObservationIdRef.current).toBe(42);
    expect(refs.seenObservationOrderRef.current).toEqual([42]);
  });

  it("accepts active events into the pending feed and schedules animation", () => {
    const refs = {
      lastObservationIdRef: ref(0),
      liveStateFlushTimerRef: ref(0),
      pausedRef: ref(false),
      pendingEventsRef: ref<LivePacketEvent[]>([]),
      pendingQueuedEventsRef: ref<LivePacketEvent[]>([]),
      pendingTotalPacketsRef: ref(0),
      pendingVisualDroppedRef: ref(0),
      seenObservationIdsRef: ref(new Set<number>()),
      seenObservationOrderRef: ref<number[]>([]),
    };
    const scheduleAnimation = vi.fn();
    const scheduleLiveStateFlush = vi.fn();

    expect(acceptLiveEventForIngest({
      event: event(),
      refs,
      scheduleAnimation,
      scheduleLiveStateFlush,
      shouldAnimateEvent: () => true,
    })).toBe(true);

    expect(refs.pendingTotalPacketsRef.current).toBe(1);
    expect(refs.pendingEventsRef.current).toHaveLength(1);
    expect(scheduleAnimation).toHaveBeenCalledTimes(1);
    expect(scheduleLiveStateFlush).toHaveBeenCalledTimes(1);
  });

  it("queues paused events without scheduling animation", () => {
    const refs = {
      lastObservationIdRef: ref(0),
      liveStateFlushTimerRef: ref(0),
      pausedRef: ref(true),
      pendingEventsRef: ref<LivePacketEvent[]>([]),
      pendingQueuedEventsRef: ref<LivePacketEvent[]>([]),
      pendingTotalPacketsRef: ref(0),
      pendingVisualDroppedRef: ref(0),
      seenObservationIdsRef: ref(new Set<number>()),
      seenObservationOrderRef: ref<number[]>([]),
    };
    const scheduleAnimation = vi.fn();
    const scheduleLiveStateFlush = vi.fn();

    expect(acceptLiveEventForIngest({
      event: event(),
      refs,
      scheduleAnimation,
      scheduleLiveStateFlush,
      shouldAnimateEvent: () => true,
    })).toBe(true);

    expect(refs.pendingEventsRef.current).toHaveLength(0);
    expect(refs.pendingQueuedEventsRef.current).toHaveLength(1);
    expect(scheduleAnimation).not.toHaveBeenCalled();
    expect(scheduleLiveStateFlush).toHaveBeenCalledTimes(1);
  });

  it("flushes pending totals, feed events, queued events, and drop counts", () => {
    const refs = {
      liveStateFlushTimerRef: ref(0),
      pendingEventsRef: ref<LivePacketEvent[]>([event({ id: "visible", observationId: 1 })]),
      pendingQueuedEventsRef: ref<LivePacketEvent[]>([event({ id: "queued", observationId: 2 })]),
      pendingTotalPacketsRef: ref(2),
      pendingVisualDroppedRef: ref(3),
    };
    let events: LivePacketEvent[] = [];
    let queuedEvents: LivePacketEvent[] = [];
    let totalPackets = 0;
    let visualDroppedCount = 0;

    flushPendingLiveState({
      refs,
      setEvents: (value) => {
        events = typeof value === "function" ? value(events) : value;
      },
      setQueuedEvents: (value) => {
        queuedEvents = typeof value === "function" ? value(queuedEvents) : value;
      },
      setTotalPackets: (value) => {
        totalPackets = typeof value === "function" ? value(totalPackets) : value;
      },
      setVisualDroppedCount: (value) => {
        visualDroppedCount = typeof value === "function" ? value(visualDroppedCount) : value;
      },
    });

    expect(totalPackets).toBe(2);
    expect(events.map((item) => item.id)).toEqual(["visible"]);
    expect(queuedEvents.map((item) => item.id)).toEqual(["queued"]);
    expect(visualDroppedCount).toBe(3);
    expect(refs.pendingEventsRef.current).toHaveLength(0);
    expect(refs.pendingQueuedEventsRef.current).toHaveLength(0);
  });
});
