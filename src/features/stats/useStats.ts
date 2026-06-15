import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import {
  getStatsOverview,
  getStatsSummary,
  getStatsRegions,
  getStatsPayloads,
  getStatsHashAnalytics,
  getStatsTopology,
  getStatsChannels,
  getStatsRFHealth,
  getStatsObserverHealth,
  getStatsObserverCompare,
  getStatsObservations,
  getPayloadBreakdown,
  getTopNodes,
  getTopObservers,
  getRadioPresets,
  getStatsScopes,
  getStatsNodeTypes,
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

function useStatsIatas(): { iatas: string[] | undefined; regionKey: string } {
  const { iatas, regionKey } = useRegion();
  return { iatas, regionKey };
}

export function useStatsOverview() {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-overview", regionKey],
    queryFn: () => getStatsOverview(iatas),
    ...common,
    // self-correct the WS-accumulated live counters against the server
    refetchInterval: 60_000,
  });
}

export function useStatsSummary(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-summary", regionKey, range],
    queryFn: () => getStatsSummary(iatas, { range }),
    ...common,
    refetchInterval: 60_000,
  });
}

export function useStatsRegions(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-regions", regionKey, range],
    queryFn: () => getStatsRegions(iatas, { range }),
    ...common,
  });
}

export function useStatsPayloads(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-payloads", regionKey, range],
    queryFn: () => getStatsPayloads(iatas, { range }),
    ...common,
  });
}

export function useStatsHashAnalytics(range: StatsRange, limit = 25) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-hash", regionKey, range, limit],
    queryFn: () => getStatsHashAnalytics(iatas, { range, limit }),
    ...common,
  });
}

export function useStatsTopology(range: StatsRange, limit = 25) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-topology", regionKey, range, limit],
    queryFn: () => getStatsTopology(iatas, { range, limit }),
    ...common,
  });
}

export function useStatsChannels(range: StatsRange, limit = 25) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-channels", regionKey, range, limit],
    queryFn: () => getStatsChannels(iatas, { range, limit }),
    ...common,
  });
}

export function useStatsRFHealth(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-rf-health", regionKey, range],
    queryFn: () => getStatsRFHealth(iatas, { range }),
    ...common,
  });
}

export function useStatsObserverHealth(range: StatsRange, limit = 50) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-observer-health", regionKey, range, limit],
    queryFn: () => getStatsObserverHealth(iatas, { range, limit }),
    ...common,
  });
}

export function useStatsObserverCompare(range: StatsRange, observerIds: string[]) {
  const { iatas, regionKey } = useStatsIatas();
  const stableIds = [...observerIds].sort();
  return useQuery({
    queryKey: ["stats-observer-compare", regionKey, range, stableIds],
    queryFn: () => getStatsObserverCompare(iatas, stableIds, { range }),
    enabled: stableIds.length >= 2,
    ...common,
  });
}

export function useStatsObservations(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-observations", regionKey, range],
    queryFn: () => getStatsObservations(iatas, sinceFor(range)),
    ...common,
  });
}

export function usePayloadBreakdown(range: StatsRange) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-payload", regionKey, range],
    queryFn: () => getPayloadBreakdown(iatas, sinceFor(range)),
    ...common,
  });
}

export function useNodeTypes() {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-node-types", regionKey],
    queryFn: () => getStatsNodeTypes(iatas),
    ...common,
  });
}

export function useTopNodes(limit = 10) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-top-nodes", regionKey, limit],
    queryFn: () => getTopNodes(iatas, limit),
    ...common,
  });
}

export function useTopObservers(range: StatsRange, limit = 10) {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-top-observers", regionKey, range, limit],
    queryFn: () => getTopObservers(iatas, sinceFor(range), limit),
    ...common,
  });
}

export function useRadioPresets() {
  const { iatas, regionKey } = useStatsIatas();
  return useQuery({
    queryKey: ["stats-radio-presets", regionKey],
    queryFn: () => getRadioPresets(iatas),
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
