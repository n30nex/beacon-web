import type { CursorPage } from "../../types/api";
import type { WsPacketObservation } from "../../types/ws";
import { LIVE_INITIAL_SEED_LIMIT, liveVisualCaps } from "./live-visuals";
import { toLivePacketEvent, type LivePacketEvent } from "./live-model";

interface MutableRef<T> {
  current: T;
}

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

export interface LiveBackfillOptions {
  afterObservationId: number;
  acceptLiveEvent: (event: LivePacketEvent, options?: { animate?: boolean }) => boolean;
  backfillInFlightRef: MutableRef<boolean>;
  fetchBackfill: (
    iatas: string[] | undefined,
    params: { afterObservationId: number; limit?: number },
  ) => Promise<CursorPage<WsPacketObservation["data"]>>;
  flushLiveState: () => void;
  iatas: string[] | undefined;
  seed?: boolean;
  limit?: number;
  sequenceRef: MutableRef<number>;
  setBackfillCount: StateSetter<number>;
  setBackfillStatus: StateSetter<string>;
  setPacketWaitStartedAt: StateSetter<number>;
  visualPressureRef: MutableRef<number>;
}

export async function fetchAndAcceptLiveBackfill({
  acceptLiveEvent,
  afterObservationId,
  backfillInFlightRef,
  fetchBackfill,
  flushLiveState,
  iatas,
  limit: explicitLimit,
  seed = false,
  sequenceRef,
  setBackfillCount,
  setBackfillStatus,
  setPacketWaitStartedAt,
  visualPressureRef,
}: LiveBackfillOptions): Promise<void> {
  if (backfillInFlightRef.current || afterObservationId < 0) return;
  backfillInFlightRef.current = true;
  setBackfillStatus(seed ? "priming" : "sync");
  try {
    const limit = explicitLimit ?? (seed ? LIVE_INITIAL_SEED_LIMIT : 100);
    const page = await fetchBackfill(iatas, { afterObservationId, limit });
    const normalized = page.items.map((item) => toLivePacketEvent(item, ++sequenceRef.current));
    const caps = liveVisualCaps(undefined, visualPressureRef.current);
    const animateCap = seed ? Math.min(12, caps.activeAnimations + 4) : Math.min(8, caps.activeAnimations);
    const animateIds = new Set(normalized.slice(-animateCap).map((event) => event.id));
    let accepted = 0;
    for (const event of normalized) {
      if (acceptLiveEvent(event, { animate: animateIds.has(event.id) })) {
        accepted += 1;
      }
    }
    if (accepted > 0) {
      setBackfillCount((count) => count + accepted);
      setPacketWaitStartedAt(Date.now());
      flushLiveState();
    }
    setBackfillStatus(seed ? "ok" : page.hasMore ? "more" : "ok");
  } catch {
    setBackfillStatus("degraded");
  } finally {
    backfillInFlightRef.current = false;
  }
}

export function liveBackfillSeedKey(regionKey: string, latestObservationId: number): string {
  return `${regionKey}:${latestObservationId}`;
}
