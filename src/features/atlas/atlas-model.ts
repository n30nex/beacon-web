import type { AtlasBriefing, AtlasStoryBeat, RegionAtlasSummary } from "../../types/api";

export type AtlasRange = "6h" | "24h" | "7d" | "30d";

export const ATLAS_RANGES: Record<AtlasRange, number> = {
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const ATLAS_REGION_OPTIONS = [
  { slug: "western-canada", label: "Western" },
  { slug: "eastern-canada", label: "Eastern" },
  { slug: "all", label: "All" },
] as const;

export function asAtlasRange(value: string | null): AtlasRange {
  return value === "6h" || value === "7d" || value === "30d" ? value : "24h";
}

export function atlasWindowForRange(range: AtlasRange, now = Date.now()): { since: number; until: number } {
  return { since: now - ATLAS_RANGES[range], until: now };
}

export function atlasFitPoints(summary: RegionAtlasSummary | undefined): [number, number][] | null {
  const points = (summary?.iatas ?? [])
    .filter((i) => i.lat != null && i.lng != null)
    .map((i) => [i.lng!, i.lat!] as [number, number]);
  return points.length > 0 ? points : null;
}

export function atlasBriefingFitPoints(briefing: AtlasBriefing | undefined): [number, number][] | null {
  const points = (briefing?.hotspots ?? [])
    .filter((i) => i.lat != null && i.lng != null)
    .map((i) => [i.lng!, i.lat!] as [number, number]);
  return points.length > 0 ? points : null;
}

export function orderedStoryBeats(summary: RegionAtlasSummary | undefined): AtlasStoryBeat[] {
  const beats = summary?.storyBeats ?? [];
  const rank: Record<string, number> = { traffic: 0, hotspot: 1, observer: 2, node: 3, payload: 4 };
  return [...beats].sort((a, b) => (rank[a.kind] ?? 99) - (rank[b.kind] ?? 99));
}
