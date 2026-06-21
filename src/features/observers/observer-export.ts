import type { CursorPage } from "../../types/api";
import type { StatsRange } from "../stats/types";
import type { AdvertObservation, Observer, ObserverTopologySummary } from "./types";

export interface ObserverHealthStats {
  noise_floor?: number;
  rx_air_secs?: number;
  tx_air_secs?: number;
  queue_len?: number;
  recv_errors?: number;
  errors?: number;
  internal_heap?: number;
}

export interface ObserverJsonExport {
  schema: "beacon.observer.v1";
  exportedAt: string;
  source: {
    app: "Beacon";
    surface: "ObserverDetail";
  };
  regionScope: {
    iatas?: string[];
    regionKey: string;
  };
  range: StatsRange;
  derivedStatus: Observer["status"];
  healthStats?: ObserverHealthStats;
  observer: Observer;
  topology?: ObserverTopologySummary;
  advertsHeard?: {
    items: AdvertObservation[];
    nextCursor: number | null;
    hasMore: boolean;
  };
}

export function buildObserverJsonExport(
  args: {
    observer: Observer;
    derivedStatus: Observer["status"];
    range: StatsRange;
    regionKey: string;
    iatas?: string[];
    healthStats?: ObserverHealthStats | null;
    topology?: ObserverTopologySummary;
    adverts?: CursorPage<AdvertObservation>;
  },
  exportedAt = new Date().toISOString(),
): ObserverJsonExport {
  return {
    schema: "beacon.observer.v1",
    exportedAt,
    source: {
      app: "Beacon",
      surface: "ObserverDetail",
    },
    regionScope: {
      iatas: args.iatas,
      regionKey: args.regionKey,
    },
    range: args.range,
    derivedStatus: args.derivedStatus,
    healthStats: args.healthStats ?? undefined,
    observer: args.observer,
    topology: args.topology,
    advertsHeard: args.adverts
      ? {
          items: args.adverts.items,
          nextCursor: args.adverts.nextCursor,
          hasMore: args.adverts.hasMore,
        }
      : undefined,
  };
}

export function observerJsonFilename(observerId: string): string {
  const safeId = observerId.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "unknown";
  return `beacon-observer-${safeId}.json`;
}
