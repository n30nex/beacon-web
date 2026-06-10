import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import {
  getStatsOverview,
  getStatsObservations,
  getPayloadBreakdown,
  getTopNodes,
  getTopObservers,
  getRadioPresets,
  getStatsScopes,
} from "../../api/client";
import { RANGE_MS, type StatsRange } from "./types";

// Shared query options: cache for 30s, keep previous data so region/range switches don't flash.
const common = {
  staleTime: 30_000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

// `since` is computed inside queryFn so refetches use a fresh window without churning the query key.
const sinceFor = (range: StatsRange) => Date.now() - RANGE_MS[range];

// The /stats/* endpoints filter by a single IATA. Map the region selection to one: a single selected
// IATA filters; "all regions" or a multi-IATA region passes nothing (the endpoints then span all).
function useStatsIata(): { iata: string | undefined; regionKey: string } {
  const { iatas, regionKey } = useRegion();
  return { iata: iatas?.length === 1 ? iatas[0] : undefined, regionKey };
}

export function useStatsOverview() {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-overview", regionKey],
    queryFn: () => getStatsOverview(iata),
    ...common,
    // self-correct the WS-accumulated live counters against the server
    refetchInterval: 60_000,
  });
}

export function useStatsObservations(range: StatsRange) {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-observations", regionKey, range],
    queryFn: () => getStatsObservations(iata, sinceFor(range)),
    ...common,
  });
}

export function usePayloadBreakdown(range: StatsRange) {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-payload", regionKey, range],
    queryFn: () => getPayloadBreakdown(iata, sinceFor(range)),
    ...common,
  });
}

export function useTopNodes(limit = 10) {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-top-nodes", regionKey, limit],
    queryFn: () => getTopNodes(iata, limit),
    ...common,
  });
}

export function useTopObservers(range: StatsRange, limit = 10) {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-top-observers", regionKey, range, limit],
    queryFn: () => getTopObservers(iata, sinceFor(range), limit),
    ...common,
  });
}

export function useRadioPresets() {
  const { iata, regionKey } = useStatsIata();
  return useQuery({
    queryKey: ["stats-radio-presets", regionKey],
    queryFn: () => getRadioPresets(iata),
    ...common,
  });
}

// scopes are reported globally by the backend (no region filter), so the key is region-independent
export function useScopes() {
  return useQuery({
    queryKey: ["stats-scopes"],
    queryFn: getStatsScopes,
    ...common,
  });
}
