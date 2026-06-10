import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getObserver, getObserverTelemetry } from "../../api/client";
import type { ObserverTelemetry, StatsRange } from "./types";

// Go time.ParseDuration strings the telemetry endpoint expects, per selected range.
const RANGE_PARAM: Record<StatsRange, string> = {
  "24h": "24h",
  "7d": "168h",
  "30d": "720h",
};

// Bucketing interval per range: raw 1h points at 24h, coarser buckets for the longer windows so the
// charts don't drown in points.
const INTERVAL_PARAM: Record<StatsRange, string> = {
  "24h": "1h",
  "7d": "6h",
  "30d": "24h",
};

// The backend's raw (interval=1h) path emits `t` in epoch SECONDS while the bucketed path emits ms.
// Normalize everything to ms here so chart code is unit-agnostic. (Tracked: beacon-docs ticket.)
export function normalizeTelemetry(data: ObserverTelemetry, interval: string): ObserverTelemetry {
  if (interval !== "1h") return data;
  return { ...data, points: data.points.map((p) => ({ ...p, t: p.t * 1000 })) };
}

export function useObserver(observerId: string | null) {
  return useQuery({
    queryKey: ["observer", observerId],
    queryFn: () => getObserver(observerId!),
    enabled: !!observerId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useObserverTelemetry(observerId: string | null, range: StatsRange) {
  const interval = INTERVAL_PARAM[range];
  return useQuery({
    queryKey: ["observer-telemetry", observerId, range, interval],
    queryFn: async () => normalizeTelemetry(await getObserverTelemetry(observerId!, RANGE_PARAM[range], interval), interval),
    enabled: !!observerId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
