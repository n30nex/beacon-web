import { describe, expect, it, vi } from "vitest";
import type { CursorPage } from "../../../src/types/api";
import type { WsPacketObservation } from "../../../src/types/ws";
import type { LivePacketEvent } from "../../../src/features/live/live-model";
import { LIVE_INITIAL_SEED_LIMIT } from "../../../src/features/live/live-visuals";
import { fetchAndAcceptLiveBackfill, liveBackfillSeedKey } from "../../../src/features/live/live-backfill";

function packetData(id: number, packetHash = `packet-${id}`): WsPacketObservation["data"] {
  return {
    packetHash,
    packet: {
      payloadType: 1,
      payloadTypeName: "TEXT_MESSAGE",
      routeType: 0,
      routeTypeName: "DIRECT",
      rawHex: "AABBCC",
      isFirstObservation: id === 1,
      observationCount: 1,
    },
    observation: {
      id,
      observerId: `observer-${id}`,
      observerName: `Observer ${id}`,
      iata: "YYZ",
      heardAt: 1_700_000_000_000 + id,
      rssi: -80,
      snr: 4,
      sourceBroker: "test",
    },
  };
}

function page(items: WsPacketObservation["data"][], hasMore = false): CursorPage<WsPacketObservation["data"]> {
  return { items, nextCursor: null, hasMore };
}

function ref<T>(current: T) {
  return { current };
}

describe("live-backfill", () => {
  it("builds stable seed keys from region and cursor", () => {
    expect(liveBackfillSeedKey("canada", 123)).toBe("canada:123");
  });

  it("skips fetches when another backfill is already running", async () => {
    const fetchBackfill = vi.fn();

    await fetchAndAcceptLiveBackfill({
      acceptLiveEvent: vi.fn(),
      afterObservationId: 42,
      backfillInFlightRef: ref(true),
      fetchBackfill,
      flushLiveState: vi.fn(),
      iatas: ["YYZ"],
      sequenceRef: ref(0),
      setBackfillCount: vi.fn(),
      setBackfillStatus: vi.fn(),
      setPacketWaitStartedAt: vi.fn(),
      visualPressureRef: ref(0),
    });

    expect(fetchBackfill).not.toHaveBeenCalled();
  });

  it("fetches seed pages with the seed limit and accepts normalized events", async () => {
    const backfillInFlightRef = ref(false);
    const sequenceRef = ref(10);
    const accepted: Array<{ event: LivePacketEvent; animate?: boolean }> = [];
    const fetchBackfill = vi.fn().mockResolvedValue(page([packetData(1), packetData(2)]));
    const setBackfillStatus = vi.fn();
    const setBackfillCount = vi.fn((update: (count: number) => number) => update(3));
    const setPacketWaitStartedAt = vi.fn();
    const flushLiveState = vi.fn();

    await fetchAndAcceptLiveBackfill({
      acceptLiveEvent: (event, options) => {
        accepted.push({ event, animate: options?.animate });
        return true;
      },
      afterObservationId: 0,
      backfillInFlightRef,
      fetchBackfill,
      flushLiveState,
      iatas: ["YYZ"],
      seed: true,
      sequenceRef,
      setBackfillCount,
      setBackfillStatus,
      setPacketWaitStartedAt,
      visualPressureRef: ref(0),
    });

    expect(fetchBackfill).toHaveBeenCalledWith(["YYZ"], { afterObservationId: 0, limit: LIVE_INITIAL_SEED_LIMIT });
    expect(accepted.map(({ event }) => event.sequence)).toEqual([11, 12]);
    expect(accepted.map(({ animate }) => animate)).toEqual([true, true]);
    expect(setBackfillCount).toHaveBeenCalledTimes(1);
    expect(setPacketWaitStartedAt).toHaveBeenCalledTimes(1);
    expect(flushLiveState).toHaveBeenCalledTimes(1);
    expect(setBackfillStatus).toHaveBeenLastCalledWith("ok");
    expect(backfillInFlightRef.current).toBe(false);
  });

  it("marks non-seed pages with more rows as more", async () => {
    const setBackfillStatus = vi.fn();

    await fetchAndAcceptLiveBackfill({
      acceptLiveEvent: () => false,
      afterObservationId: 9,
      backfillInFlightRef: ref(false),
      fetchBackfill: vi.fn().mockResolvedValue(page([packetData(3)], true)),
      flushLiveState: vi.fn(),
      iatas: undefined,
      sequenceRef: ref(0),
      setBackfillCount: vi.fn(),
      setBackfillStatus,
      setPacketWaitStartedAt: vi.fn(),
      visualPressureRef: ref(0),
    });

    expect(setBackfillStatus).toHaveBeenLastCalledWith("more");
  });

  it("marks failed backfills as degraded and clears the in-flight flag", async () => {
    const backfillInFlightRef = ref(false);
    const setBackfillStatus = vi.fn();

    await fetchAndAcceptLiveBackfill({
      acceptLiveEvent: vi.fn(),
      afterObservationId: 7,
      backfillInFlightRef,
      fetchBackfill: vi.fn().mockRejectedValue(new Error("nope")),
      flushLiveState: vi.fn(),
      iatas: ["YYZ"],
      sequenceRef: ref(0),
      setBackfillCount: vi.fn(),
      setBackfillStatus,
      setPacketWaitStartedAt: vi.fn(),
      visualPressureRef: ref(0),
    });

    expect(setBackfillStatus).toHaveBeenLastCalledWith("degraded");
    expect(backfillInFlightRef.current).toBe(false);
  });
});
