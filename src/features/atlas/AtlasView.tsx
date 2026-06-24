import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "../map/map.css";
import type { WsNodeUpdate } from "../../types/ws";
import type { WsManager } from "../../api/ws-manager";
import { getAtlasBriefing } from "../../api/client";
import { useMapLibre } from "../map/useMapLibre";
import { useVerifiedRouteNeighborhoodOverlay } from "../map/useRouteOverlays";
import { useCoalescedNodeUpdates } from "../map/useNodeUpdates";
import { DEFAULT_STYLE_ID, MAP_STYLE_STORAGE_KEY, resolveMapStyle } from "../map/types";
import { mapVisualProfileStyle, readMapAppearanceSettings, resolveMapVisualProfile } from "../map/appearance";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { LoadingPill } from "../../components/LoadingPill";
import { EmptyState } from "../../components/EmptyState";
import { RouteStatePanel } from "../../components/RouteStatePanel";
import { formatCount, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import type {
  AtlasBriefingRegion,
  AtlasHotspot,
  AtlasNotableRoute,
  AtlasPriorityItem,
  PayloadBreakdownItemShape,
  TopNodeShape,
  TopObserverShape,
} from "../../types/api";
import {
  ATLAS_REGION_OPTIONS,
  asAtlasRange,
  atlasBriefingFitPoints,
  atlasWindowForRange,
  type AtlasRange,
} from "./atlas-model";

const ATLAS_HOTSPOT_SOURCE_ID = "atlas-briefing-hotspots";
const ATLAS_HOTSPOT_HALO_LAYER_ID = "atlas-briefing-hotspot-halo";
const ATLAS_HOTSPOT_LAYER_ID = "atlas-briefing-hotspot";
const ATLAS_HOTSPOT_LABEL_LAYER_ID = "atlas-briefing-hotspot-label";

interface AtlasViewProps {
  wsManager: WsManager;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  nodePanelOpen?: boolean;
}

function PillButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`shrink-0 rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        active
          ? "border-primary bg-primary/15 text-text-bright"
          : "border-border bg-bg-raised/80 text-text-muted hover:border-primary/50 hover:text-text-normal"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="crt-panel rounded-sm border border-border bg-bg-raised/72 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BriefingMetric({
  label,
  value,
  detail,
  tone = "text-text-bright",
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: string;
}) {
  return (
    <div className="crt-panel rounded-sm border border-border-subtle bg-bg-base/55 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-1 truncate font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 min-h-4 truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">{detail}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes =
    severity === "critical"
      ? "border-danger/60 bg-danger/12 text-danger"
      : severity === "warn"
        ? "border-warn/60 bg-warn/12 text-warn"
        : severity === "good"
          ? "border-green/60 bg-green/12 text-green"
          : "border-primary/50 bg-primary/10 text-primary";
  return <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${classes}`}>{severity}</span>;
}

function PriorityCard({ item, onOpen }: { item: AtlasPriorityItem; onOpen: (url: string) => void }) {
  return (
    <article className="rounded-sm border border-border-subtle bg-bg-base/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-bright">{item.title}</div>
          <div className="mt-1 line-clamp-2 text-xs text-text-muted">{sanitizeDisplayLabel(item.detail, "")}</div>
        </div>
        <SeverityBadge severity={item.severity} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">
          {item.kind.replace(/_/g, " ")}
          {item.iata ? ` / ${item.iata}` : ""}
        </div>
        <button
          type="button"
          className="rounded-sm border border-primary/45 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/16"
          onClick={() => onOpen(item.url)}
        >
          Open
        </button>
      </div>
    </article>
  );
}

function RegionCard({ region, onOpen }: { region: AtlasBriefingRegion; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      className="grid min-w-[230px] flex-1 rounded-sm border border-border-subtle bg-bg-base/55 p-3 text-left hover:border-primary/45 hover:bg-primary/7"
      onClick={() => onOpen(region.url)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-bright">{region.name}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
            {formatCount(region.iataCount)} IATAs / top {region.topIata || "none"}
          </div>
        </div>
        <div className={region.healthScore >= 80 ? "font-mono text-sm font-bold text-green" : "font-mono text-sm font-bold text-warn"}>
          {region.healthScore}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono">
        <MiniStat label="Obs" value={formatCount(region.observationCount)} />
        <MiniStat label="Nodes" value={formatCount(region.activeNodes)} />
        <MiniStat label="Routes" value={formatCount(region.routeCount)} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className="text-text-dim">{formatCount(region.activeObservers)} observers</span>
        <span className={region.observationDeltaPct >= 0 ? "text-green" : "text-danger"}>{formatDelta(region.observationDeltaPct)}</span>
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-text-normal">{value}</div>
    </div>
  );
}

function formatDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

function BarList({
  rows,
  getId,
  getLabel,
  getValue,
  getMeta,
}: {
  rows: readonly PayloadBreakdownItemShape[] | readonly { routeType: number; routeTypeName: string; count: number }[];
  getId: (row: PayloadBreakdownItemShape | { routeType: number; routeTypeName: string; count: number }) => string;
  getLabel: (row: PayloadBreakdownItemShape | { routeType: number; routeTypeName: string; count: number }) => string;
  getValue: (row: PayloadBreakdownItemShape | { routeType: number; routeTypeName: string; count: number }) => number;
  getMeta?: (row: PayloadBreakdownItemShape | { routeType: number; routeTypeName: string; count: number }) => string;
}) {
  const max = Math.max(1, ...rows.map(getValue));
  if (rows.length === 0) return <div className="font-mono text-[11px] text-text-dim">No data</div>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row) => {
        const value = getValue(row);
        return (
          <div key={getId(row)}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-text-normal">{getLabel(row)}</span>
              <span className="font-mono text-[11px] tabular-nums text-text-bright">{formatCount(value)}</span>
            </div>
            <div className="crt-bar-track h-1.5 overflow-hidden rounded-sm">
              <div className="crt-bar-fill h-full rounded-sm" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
            </div>
            {getMeta && <div className="mt-0.5 truncate font-mono text-[10px] text-text-dim">{getMeta(row)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function EntityList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; value: number; meta: string; onClick?: () => void }[];
}) {
  return (
    <Section title={title}>
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <div className="font-mono text-[11px] text-text-dim">No data</div>
        ) : (
          rows.slice(0, 7).map((row) => (
            <button
              key={row.id}
              type="button"
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-sm border border-border-subtle bg-bg-base/50 px-2.5 py-2 text-left hover:border-primary/45 hover:bg-primary/7"
              onClick={row.onClick}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs text-text-normal">{row.name}</span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">{row.meta}</span>
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-text-bright">{formatCount(row.value)}</span>
            </button>
          ))
        )}
      </div>
    </Section>
  );
}

function HotspotList({ hotspots, onOpen }: { hotspots: AtlasHotspot[]; onOpen: (url: string) => void }) {
  return (
    <div className="space-y-1.5">
      {hotspots.length === 0 ? (
        <div className="font-mono text-[11px] text-text-dim">No hotspots in this window</div>
      ) : (
        hotspots.slice(0, 6).map((hotspot) => (
          <button
            key={hotspot.iata}
            type="button"
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-border-subtle bg-bg-base/50 px-2.5 py-2 text-left hover:border-primary/45 hover:bg-primary/7"
            onClick={() => onOpen(hotspot.url)}
          >
            <span className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">{hotspot.iata}</span>
            <span className="min-w-0 truncate text-xs text-text-muted">{sanitizeDisplayLabel(hotspot.displayName, "regional hotspot")}</span>
            <span className="font-mono text-xs font-semibold text-text-bright">{formatCount(hotspot.observationCount)}</span>
          </button>
        ))
      )}
    </div>
  );
}

function RouteList({ routes, onOpen }: { routes: AtlasNotableRoute[]; onOpen: (url: string) => void }) {
  return (
    <div className="space-y-1.5">
      {routes.length === 0 ? (
        <div className="font-mono text-[11px] text-text-dim">No verified routes in this window</div>
      ) : (
        routes.slice(0, 6).map((route) => (
          <button
            key={route.routeId}
            type="button"
            className="w-full rounded-sm border border-border-subtle bg-bg-base/50 px-2.5 py-2 text-left hover:border-primary/45 hover:bg-primary/7"
            onClick={() => onOpen(route.url)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-text-normal">{route.nodeNames.slice(0, 4).join(" > ") || `Route ${route.routeId}`}</span>
              <span className="font-mono text-[10px] text-primary">{route.iata}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
              <span>{route.hopCount} hops / {formatCount(route.observationCount)} obs</span>
              <span>{timeAgoMs(route.lastSeen)} ago</span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function mapCssVar(map: MapLibreMap, name: string, fallback: string): string {
  const scope = map.getContainer().closest("[data-map-profile]") ?? map.getContainer();
  return getComputedStyle(scope).getPropertyValue(name).trim() || fallback;
}

function hotspotSource(map: MapLibreMap): GeoJSONSource | undefined {
  try {
    return map.getSource(ATLAS_HOTSPOT_SOURCE_ID) as GeoJSONSource | undefined;
  } catch {
    return undefined;
  }
}

function ensureHotspotLayers(map: MapLibreMap) {
  if (!map.getSource(ATLAS_HOTSPOT_SOURCE_ID)) {
    map.addSource(ATLAS_HOTSPOT_SOURCE_ID, { type: "geojson", data: emptyHotspotCollection() });
  }
  const primary = mapCssVar(map, "--map-route-primary", "#ffb000");
  const secondary = mapCssVar(map, "--map-route-secondary", "#42ff7c");
  const halo = mapCssVar(map, "--map-node-backplate", "rgba(0,0,0,0.86)");
  const label = mapCssVar(map, "--map-node-label", "#fff4cf");
  const labelHalo = mapCssVar(map, "--map-node-label-halo", "rgba(0,0,0,0.9)");
  if (!map.getLayer(ATLAS_HOTSPOT_HALO_LAYER_ID)) {
    map.addLayer({
      id: ATLAS_HOTSPOT_HALO_LAYER_ID,
      type: "circle",
      source: ATLAS_HOTSPOT_SOURCE_ID,
      paint: {
        "circle-color": primary,
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 13, 100, 22, 1000, 36],
        "circle-opacity": 0.14,
        "circle-blur": 0.65,
      },
    });
  }
  if (!map.getLayer(ATLAS_HOTSPOT_LAYER_ID)) {
    map.addLayer({
      id: ATLAS_HOTSPOT_LAYER_ID,
      type: "circle",
      source: ATLAS_HOTSPOT_SOURCE_ID,
      paint: {
        "circle-color": halo,
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 5, 100, 8, 1000, 12],
        "circle-stroke-color": secondary,
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.86,
      },
    });
  }
  if (!map.getLayer(ATLAS_HOTSPOT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: ATLAS_HOTSPOT_LABEL_LAYER_ID,
      type: "symbol",
      source: ATLAS_HOTSPOT_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.25],
        "text-anchor": "top",
      },
      paint: {
        "text-color": label,
        "text-halo-color": labelHalo,
        "text-halo-width": 1.5,
      },
    });
  }
  map.setPaintProperty(ATLAS_HOTSPOT_HALO_LAYER_ID, "circle-color", primary);
  map.setPaintProperty(ATLAS_HOTSPOT_LAYER_ID, "circle-stroke-color", secondary);
  map.setPaintProperty(ATLAS_HOTSPOT_LAYER_ID, "circle-color", halo);
  map.setPaintProperty(ATLAS_HOTSPOT_LABEL_LAYER_ID, "text-color", label);
  map.setPaintProperty(ATLAS_HOTSPOT_LABEL_LAYER_ID, "text-halo-color", labelHalo);
}

function emptyHotspotCollection(): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: [] };
}

function hotspotCollection(hotspots: AtlasHotspot[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: hotspots
      .filter((hotspot) => hotspot.lat != null && hotspot.lng != null)
      .map((hotspot) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [hotspot.lng!, hotspot.lat!] },
        properties: {
          label: hotspot.iata,
          count: hotspot.observationCount,
        },
      })),
  };
}

function useAtlasHotspots(mapRef: RefObject<MapLibreMap | null>, isReady: boolean, hotspots: AtlasHotspot[], profileKey: string) {
  const data = useMemo(() => hotspotCollection(hotspots), [hotspots]);
  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map) return;
    ensureHotspotLayers(map);
    hotspotSource(map)?.setData(data);
  }, [data, isReady, mapRef, profileKey]);
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (map) hotspotSource(map)?.setData(emptyHotspotCollection());
    };
  }, [mapRef]);
}

export function AtlasView({ wsManager, selectedNodeId, onSelectNode, nodePanelOpen = false }: AtlasViewProps) {
  const [params, setParams] = useSearchParams();
  const regionSlug = params.get("atlasRegion") || "all";
  const range = asAtlasRange(params.get("atlasRange"));
  const [now] = useState(() => Date.now());
  const atlasWindow = useMemo(() => atlasWindowForRange(range, now), [range, now]);
  const [styleId, setStyleId] = useState(() => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id);
  const [appearanceSettings] = useState(readMapAppearanceSettings);
  const queryClient = useQueryClient();
  const { themeId, themes } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const visualProfile = useMemo(() => resolveMapVisualProfile(styleId, appearanceSettings), [appearanceSettings, styleId]);
  const visualProfileStyle = useMemo(() => mapVisualProfileStyle(visualProfile) as CSSProperties, [visualProfile]);
  const profileKey = `${themeKey}:${visualProfile.key}`;

  const briefing = useQuery({
    queryKey: ["atlas-briefing", regionSlug, range, atlasWindow.since, atlasWindow.until],
    queryFn: () => getAtlasBriefing({ region: regionSlug, since: atlasWindow.since, until: atlasWindow.until }),
    staleTime: 30_000,
  });

  const fitPoints = useMemo(() => atlasBriefingFitPoints(briefing.data), [briefing.data]);
  const atlasIatas = briefing.data?.region.slug === "all" ? undefined : briefing.data?.region.iatas;
  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);
  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, fitPoints, handleStyleError, { visualProfile });
  const isDark = resolveMapStyle(styleId).dark;
  useAtlasHotspots(mapRef, isReady, briefing.data?.hotspots ?? [], profileKey);
  useVerifiedRouteNeighborhoodOverlay(mapRef, isReady, selectedNodeId, atlasIatas, profileKey);

  const nodesKey = useMemo(() => ["atlas-selected-node", selectedNodeId ?? "none"], [selectedNodeId]);
  const onNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      if (selectedNodeId === data.nodeId) queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
    },
    [queryClient, selectedNodeId],
  );
  useWsNodeUpdateHandler(wsManager, useCoalescedNodeUpdates(nodesKey, onNodeUpdate));

  const patch = useCallback(
    (updates: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const openUrl = useCallback(
    (url: string) => {
      const target = new URL(url, window.location.origin);
      setParams(target.searchParams);
    },
    [setParams],
  );

  const topNodeRows = useMemo(() => topNodesToRows(briefing.data?.topNodes ?? [], onSelectNode), [briefing.data?.topNodes, onSelectNode]);
  const topObserverRows = useMemo(() => topObserversToRows(briefing.data?.topObservers ?? []), [briefing.data?.topObservers]);
  const health = briefing.data?.health;
  const kpis = briefing.data;
  const rfIssues = (health?.degradedObservers ?? 0) + (health?.noTelemetry ?? 0);

  return (
    <div
      className="map-profile-scope min-h-0 flex-1 overflow-y-auto bg-bg-base p-3 md:p-4"
      data-map-profile={visualProfile.id}
      data-map-contrast={visualProfile.effectiveContrast}
      data-map-tint={visualProfile.effectiveTint}
      data-node-panel-open={nodePanelOpen ? "true" : "false"}
      style={visualProfileStyle}
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
        <header className="crt-panel rounded-sm border border-border bg-bg-raised/78 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">Atlas / Mission Briefing</div>
              <h1 className="mt-1 truncate text-xl font-semibold text-text-bright">{briefing.data?.region.name ?? "Operator Briefing"}</h1>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
                {ATLAS_REGION_OPTIONS.map((option) => (
                  <PillButton key={option.slug} active={regionSlug === option.slug} onClick={() => patch({ atlasRegion: option.slug })}>
                    {option.label}
                  </PillButton>
                ))}
              </div>
              <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
                {(["6h", "24h", "7d", "30d"] as AtlasRange[]).map((item) => (
                  <PillButton key={item} active={range === item} onClick={() => patch({ atlasRange: item })}>
                    {item}
                  </PillButton>
                ))}
              </div>
            </div>
          </div>
        </header>

        {briefing.isLoading ? (
          <div className="crt-panel min-h-[360px] rounded-sm border border-border bg-bg-raised/72">
            <RouteStatePanel
              title="Preparing Atlas briefing"
              subtitle="Gathering regional health, hotspots, verified routes, and investigation priorities for the selected window."
            />
          </div>
        ) : briefing.isError ? (
          <div className="crt-panel min-h-[320px] rounded-sm border border-border bg-bg-raised/72">
            <RouteStatePanel
              title="Atlas briefing unavailable"
              subtitle="The prepared briefing endpoint did not return a payload. Retry after the API, cache, or database recovers."
              tone="danger"
              action={
                <button
                  type="button"
                  className="rounded-sm border border-danger/45 bg-danger/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/15"
                  onClick={() => void briefing.refetch()}
                >
                  Retry Atlas briefing
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <BriefingMetric
                label="Network"
                value={(health?.status ?? "querying").toUpperCase()}
                detail={health ? `Score ${health.healthScore}` : "Waiting for briefing"}
                tone={health?.status === "ok" ? "text-green" : health?.status === "critical" ? "text-danger" : "text-warn"}
              />
              <BriefingMetric label="Traffic" value={formatCount(kpis?.regions.find((r) => r.slug === regionSlug)?.observationCount ?? kpis?.regions[0]?.observationCount)} detail={`${range.toUpperCase()} observations`} tone="text-primary" />
              <BriefingMetric label="Stale Observers" value={formatCount(health?.staleObservers)} detail="Needs operator review" tone={(health?.staleObservers ?? 0) > 0 ? "text-warn" : "text-green"} />
              <BriefingMetric label="RF Flags" value={formatCount(rfIssues)} detail="Noise / airtime / battery / queue" tone={rfIssues > 0 ? "text-warn" : "text-green"} />
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
              <aside className="order-1 xl:order-2">
                <Section title="Investigate Queue">
                  <div className="space-y-2">
                    {(briefing.data?.priorities ?? []).length === 0 ? (
                      <div className="font-mono text-[11px] text-text-dim">No priority items for this window</div>
                    ) : (
                      briefing.data!.priorities.map((item) => <PriorityCard key={item.id} item={item} onOpen={openUrl} />)
                    )}
                  </div>
                </Section>
              </aside>

              <main className="order-2 grid min-w-0 gap-3 xl:order-1">
                <Section title="Region Comparison">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(briefing.data?.regions ?? []).map((region) => (
                      <RegionCard key={region.slug} region={region} onOpen={openUrl} />
                    ))}
                  </div>
                </Section>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <Section
                    title="Regional Hotspot Map"
                    action={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{formatCount(briefing.data?.hotspots.length)} hotspots</span>}
                  >
                    <div className="relative h-[240px] overflow-hidden rounded-sm border border-border-subtle bg-bg-base md:h-[320px]">
                      <div ref={containerRef} data-dark={isDark} className="h-full w-full" />
                      <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-border bg-bg-base/82 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        Hotspots / verified route neighborhood
                      </div>
                      {error && (
                        <div className="absolute inset-0 bg-bg-base/92">
                          <EmptyState title="Map unavailable" subtitle="The briefing remains usable from the cards." />
                        </div>
                      )}
                    </div>
                  </Section>

                  <div className="grid gap-3">
                    <Section title="Active IATAs">
                      <HotspotList hotspots={briefing.data?.hotspots ?? []} onOpen={openUrl} />
                    </Section>
                    <Section title="Verified Routes">
                      <RouteList routes={briefing.data?.notableRoutes ?? []} onOpen={openUrl} />
                    </Section>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <EntityList title="Top Nodes" rows={topNodeRows} />
                  <EntityList title="Top Observers" rows={topObserverRows} />
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <Section title="Payload Mix">
                    <BarList
                      rows={briefing.data?.payloadMix ?? []}
                      getId={(row) => String((row as PayloadBreakdownItemShape).payloadType)}
                      getLabel={(row) => (row as PayloadBreakdownItemShape).payloadTypeName}
                      getValue={(row) => row.count}
                    />
                  </Section>
                  <Section title="Route Mix">
                    <BarList
                      rows={briefing.data?.routeMix ?? []}
                      getId={(row) => String((row as { routeType: number }).routeType)}
                      getLabel={(row) => (row as { routeTypeName: string }).routeTypeName}
                      getValue={(row) => row.count}
                    />
                  </Section>
                  <Section title="Scopes">
                    <BarList
                      rows={(briefing.data?.scopes ?? []).map((scope) => ({
                        payloadType: 0,
                        payloadTypeName: scope.name,
                        count: scope.observerCount,
                      }))}
                      getId={(row) => (row as PayloadBreakdownItemShape).payloadTypeName}
                      getLabel={(row) => (row as PayloadBreakdownItemShape).payloadTypeName}
                      getValue={(row) => row.count}
                      getMeta={(row) => `${formatCount(row.count)} observers`}
                    />
                  </Section>
                </div>
              </main>
            </div>
          </>
        )}
      </div>

      <LoadingPill loading={briefing.isLoading} error={briefing.isError} count={0} noun="briefing" />
    </div>
  );
}

function topNodesToRows(nodes: TopNodeShape[], onSelectNode: (nodeId: string) => void) {
  return nodes.map((node) => ({
    id: node.nodeId,
    name: sanitizeDisplayLabel(node.nodeName, node.nodeId.slice(0, 8)),
    value: node.observationCount,
    meta: `${node.nodeTypeName} / ${node.iata}`,
    onClick: () => onSelectNode(node.nodeId),
  }));
}

function topObserversToRows(observers: TopObserverShape[]) {
  return observers.map((observer) => ({
    id: observer.observerId,
    name: sanitizeDisplayLabel(observer.displayName, observer.observerId.slice(0, 8)),
    value: observer.observationCount,
    meta: `${observer.observerType ?? "observer"} / ${observer.iata}`,
  }));
}
