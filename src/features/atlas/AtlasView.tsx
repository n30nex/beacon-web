import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { CursorPage } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import type { WsNodeUpdate } from "../../types/ws";
import type { WsManager } from "../../api/ws-manager";
import { getAtlasRegion, getHealth } from "../../api/client";
import { useMapLibre } from "../map/useMapLibre";
import { useMapNodes } from "../map/useMapNodes";
import { useMapNodesData } from "../map/useMapNodesData";
import { nodesToFeatureCollection } from "../map/node-geojson";
import { DEFAULT_STYLE_ID, MAP_STYLE_STORAGE_KEY, resolveMapStyle } from "../map/types";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { upsertNodePages } from "../nodes/node-updates";
import { LoadingPill } from "../../components/LoadingPill";
import { EmptyState } from "../../components/EmptyState";
import { formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import {
  ATLAS_REGION_OPTIONS,
  asAtlasRange,
  atlasFitPoints,
  atlasWindowForRange,
  orderedStoryBeats,
  type AtlasRange,
} from "./atlas-model";

const ATLAS_NODE_LIMIT = 5_000;
const ATLAS_NODE_LOAD_DELAY_MS = 1_200;

interface AtlasViewProps {
  wsManager: WsManager;
  onViewNode: (nodeId: string) => void;
}

function PillButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/15 text-text-bright"
          : "border-border bg-bg-raised/90 text-text-muted hover:border-text-dim hover:text-text-normal"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="min-w-0 border-l border-border-subtle pl-3 first:border-l-0 first:pl-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function HealthStrip({ health }: { health: Awaited<ReturnType<typeof getHealth>> | undefined }) {
  const db = health?.dependencies.database?.status ?? "unknown";
  const cache = health?.dependencies.cache?.status ?? "unknown";
  const brokers = health?.brokers ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
      <span className={health?.status === "ok" ? "text-green" : "text-warn"}>{health?.status ?? "checking"}</span>
      <span>DB {db}</span>
      <span>Cache {cache}</span>
      {brokers.map((b) => (
        <span key={b.name} className={b.connected ? "text-green" : "text-danger"}>
          {b.name} {b.connected ? "live" : "down"}
        </span>
      ))}
    </div>
  );
}

function RankingList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; value: number; meta: string; onClick?: () => void }[];
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{title}</div>
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <div className="font-mono text-[11px] text-text-dim">No data</div>
        ) : (
          rows.slice(0, 5).map((row) => (
            <button
              key={row.id}
              type="button"
              className="grid w-full grid-cols-[1fr_auto] gap-2 rounded border border-border-subtle bg-bg-raised/70 px-2.5 py-2 text-left hover:border-text-dim"
              onClick={row.onClick}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs text-text-normal">{row.name}</span>
                <span className="block truncate font-mono text-[10px] text-text-dim">{row.meta}</span>
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-text-bright">{formatCount(row.value)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function MixList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; label: string; value: number; meta?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="font-mono text-[11px] text-text-dim">No data</div>
        ) : (
          rows.slice(0, 5).map((row) => (
            <div key={row.id} className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-text-normal">{row.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-text-bright">{formatCount(row.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-bg-base">
                <div className="h-full rounded bg-primary" style={{ width: `${Math.max(5, (row.value / max) * 100)}%` }} />
              </div>
              {row.meta && <div className="mt-0.5 truncate font-mono text-[10px] text-text-dim">{row.meta}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AtlasView({ wsManager, onViewNode }: AtlasViewProps) {
  const [params, setParams] = useSearchParams();
  const regionSlug = params.get("atlasRegion") || "western-canada";
  const range = asAtlasRange(params.get("atlasRange"));
  const [now] = useState(() => Date.now());
  const atlasWindow = useMemo(() => atlasWindowForRange(range, now), [range, now]);
  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["atlas-region", regionSlug, range, atlasWindow.since, atlasWindow.until],
    queryFn: () => getAtlasRegion(regionSlug, atlasWindow),
    staleTime: 30_000,
  });
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: getHealth,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const storyBeats = useMemo(() => orderedStoryBeats(summary.data), [summary.data]);
  const fitPoints = useMemo(() => atlasFitPoints(summary.data), [summary.data]);
  const atlasIatas = summary.data?.region.slug === "all" ? undefined : summary.data?.region.iatas;
  const atlasRegionKey = summary.data ? `atlas:${summary.data.region.slug}:${atlasIatas?.join(",") ?? "all"}` : `atlas:${regionSlug}:loading`;
  const nodesKey = useMemo(() => ["map-nodes", atlasRegionKey], [atlasRegionKey]);
  const { themeId, themes } = useTheme();
  const themeKey = themes.length ? themeId : "";

  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);
  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, fitPoints, handleStyleError);
  const isDark = resolveMapStyle(styleId).dark;
  const nodeOverlayKey =
    summary.isSuccess && isReady ? `${summary.data.region.slug}:${atlasIatas?.join(",") ?? "all"}:${range}` : "";
  const [readyNodeOverlayKey, setReadyNodeOverlayKey] = useState("");
  const nodeOverlayReady = nodeOverlayKey !== "" && readyNodeOverlayKey === nodeOverlayKey;
  useEffect(() => {
    if (!nodeOverlayKey) return;
    const id = window.setTimeout(() => setReadyNodeOverlayKey(nodeOverlayKey), ATLAS_NODE_LOAD_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [nodeOverlayKey]);
  const {
    nodes,
    loadedCount,
    isPaging,
    isError: nodesError,
  } = useMapNodesData(atlasIatas, atlasRegionKey, {
    auto: true,
    enabled: nodeOverlayReady && summary.isSuccess,
    limit: ATLAS_NODE_LIMIT,
  });
  const geojson = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, true, setSelectedNodeId, selectedNodeId, atlasRegionKey);

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(nodesKey, (old) => upsertNodePages(old, data));
      if (selectedNodeId === data.nodeId) queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
    },
    [nodesKey, queryClient, selectedNodeId],
  );
  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

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

  const topNodeRows = useMemo(
    () =>
      (summary.data?.topNodes ?? []).map((node) => ({
        id: node.nodeId,
        name: sanitizeDisplayLabel(node.nodeName, node.nodeId.slice(0, 8)),
        value: node.observationCount,
        meta: `${node.nodeTypeName} / ${node.iata}`,
        onClick: () => onViewNode(node.nodeId),
      })),
    [onViewNode, summary.data?.topNodes],
  );
  const topObserverRows = useMemo(
    () =>
      (summary.data?.topObservers ?? []).map((observer) => ({
        id: observer.observerId,
        name: sanitizeDisplayLabel(observer.displayName, observer.observerId.slice(0, 8)),
        value: observer.observationCount,
        meta: `${observer.observerType ?? "observer"} / ${observer.iata}`,
      })),
    [summary.data?.topObservers],
  );
  const payloadRows = useMemo(
    () =>
      (summary.data?.payloadMix ?? []).map((payload) => ({
        id: String(payload.payloadType),
        label: payload.payloadTypeName,
        value: payload.count,
      })),
    [summary.data?.payloadMix],
  );
  const nodeTypeRows = useMemo(
    () =>
      (summary.data?.nodeTypes ?? []).map((nodeType) => ({
        id: String(nodeType.nodeType),
        label: nodeType.nodeTypeName,
        value: nodeType.count,
      })),
    [summary.data?.nodeTypes],
  );
  const radioRows = useMemo(
    () =>
      (summary.data?.radioPresets ?? []).map((preset, index) => ({
        id: `${preset.preset}-${preset.iata}-${index}`,
        label: preset.preset || "unknown",
        value: preset.count,
        meta: `${preset.iata} / ${preset.sourceType}`,
      })),
    [summary.data?.radioPresets],
  );
  const scopeRows = useMemo(
    () =>
      (summary.data?.scopes ?? []).map((scope) => ({
        id: scope.name,
        label: scope.name,
        value: scope.observerCount,
        meta: `${formatCount(scope.nodeCount)} nodes / ${formatCount(scope.iataCount)} IATAs`,
      })),
    [summary.data?.scopes],
  );

  const kpis = summary.data?.kpis;

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-bg-base">
      <div ref={containerRef} data-dark={isDark} className="flex-1" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.46)_100%)]" />

      <div className="absolute left-3 top-3 z-10 flex w-[min(560px,calc(100vw-24px))] flex-col gap-2">
        <div className="rounded border border-border bg-bg-surface/92 p-3 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">Atlas</div>
              <div className="text-lg font-semibold text-text-bright">{summary.data?.region.name ?? "Regional Atlas"}</div>
            </div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
              {ATLAS_REGION_OPTIONS.map((option) => (
                <PillButton
                  key={option.slug}
                  active={regionSlug === option.slug}
                  onClick={() => patch({ atlasRegion: option.slug })}
                >
                  {option.label}
                </PillButton>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(["6h", "24h", "7d", "30d"] as AtlasRange[]).map((r) => (
                <PillButton key={r} active={range === r} onClick={() => patch({ atlasRange: r })}>
                  {r}
                </PillButton>
              ))}
            </div>
            <HealthStrip health={health.data} />
          </div>
        </div>

        <div className="hidden max-h-[42vh] overflow-y-auto rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur lg:block">
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">Story</div>
          <div className="space-y-2">
            {storyBeats.map((beat) => (
              <div key={beat.id} className="border-l-2 border-primary/60 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-text-bright">{beat.title}</div>
                  {beat.value != null && <div className="font-mono text-[11px] text-primary">{formatCount(beat.value)}</div>}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">{sanitizeDisplayLabel(beat.detail, "")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 hidden max-h-[calc(100vh-160px)] w-[min(520px,calc(100vw-24px))] flex-col gap-2 overflow-y-auto xl:flex">
        <div className="grid grid-cols-4 gap-3 rounded border border-border bg-bg-surface/90 p-3 shadow-2xl backdrop-blur">
          <Kpi label="Packets" value={formatCount(kpis?.totalPackets)} tone="text-primary" />
          <Kpi label="Observations" value={formatCount(kpis?.totalObservations)} tone="text-green" />
          <Kpi label="Observers" value={formatCount(kpis?.activeObservers)} tone="text-secondary" />
          <Kpi label="IATAs" value={formatCount(kpis?.activeIatas)} tone="text-warn" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <RankingList title="Top nodes" rows={topNodeRows} />
          </div>
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <RankingList title="Top observers" rows={topObserverRows} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <MixList title="Payload mix" rows={payloadRows} />
          </div>
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <MixList title="Node types" rows={nodeTypeRows} />
          </div>
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <MixList title="Radio presets" rows={radioRows} />
          </div>
          <div className="rounded border border-border bg-bg-surface/88 p-3 shadow-2xl backdrop-blur">
            <MixList title="Scopes" rows={scopeRows} />
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-10 w-[min(360px,calc(100vw-24px))] rounded border border-border bg-bg-surface/94 p-3 shadow-2xl backdrop-blur">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-text-bright">Regional map overlay</div>
          <div className="mt-1 font-mono text-[10px] text-text-dim">
            {nodeOverlayReady ? `${formatCount(loadedCount)} nodes loaded` : "Node overlay deferred"}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] text-text-muted">
            <span>{summary.data?.region.name ?? "Region"}</span>
            <span>{formatCount(summary.data?.region.iatas.length)} IATAs</span>
            <span>{range.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <LoadingPill
        loading={(nodeOverlayReady && isPaging) || summary.isLoading}
        error={nodesError || summary.isError}
        count={loadedCount}
        noun="nodes"
      />
      {error && (
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Atlas map failed to load" subtitle="Check the map connection and reload" />
        </div>
      )}
    </div>
  );
}
