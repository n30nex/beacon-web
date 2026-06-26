import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState, type SVGProps } from "react";
import { useQuery } from "@tanstack/react-query";
import "./netgraph.css";
import { getNetgraphSnapshot } from "../../api/client";
import type { WsManager } from "../../api/ws-manager";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useRegion } from "../../hooks/useRegion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatCount } from "../../lib/formatters";
import {
  buildNetgraph,
  applyLayoutPositions,
  graphSearchMatches,
  DEFAULT_NETGRAPH_ROUTE_LIMIT,
  type NetgraphRouteLimit,
  type NetgraphVisualMode,
} from "./netgraph-model";
import { layoutRequestFromGraph, resultToPositionMap, settleNetgraphLayout, type NetgraphLayoutResult } from "./netgraph-layout";
import { EmptyTopologyState, TopologySnapshotErrorState } from "./NetgraphRouteStates";
import { NetgraphSettingsIcon, NetgraphSettingsPanel } from "./NetgraphSettingsPanel";
import {
  MOBILE_NETGRAPH_QUERY,
  MOBILE_NETGRAPH_ROUTE_LIMIT,
  NETGRAPH_VISUAL_MODE_CONFIGS,
  defaultRouteLimitForViewport,
} from "./netgraph-settings-config";
import { FallbackList, Inspector, NodeInspector } from "./NetgraphPanels";
import { useNetgraphLiveVisuals } from "./useNetgraphLiveVisuals";
import { useNetgraphSelection } from "./useNetgraphSelection";

const ThreeNetgraphCanvas = lazy(() => import("./ThreeNetgraphCanvas").then((mod) => ({ default: mod.ThreeNetgraphCanvas })));

interface NetgraphViewProps {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  wsManager?: WsManager;
}

function SvgIcon({ size = 16, children, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </SvgIcon>
  );
}

function ActivityIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <SvgIcon {...props}>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </SvgIcon>
  );
}

function DeviceLegend() {
  const devices = [
    { role: "Repeater", className: "bg-emerald-400 rotate-45", shape: "h-3 w-3" },
    { role: "Companion", className: "border-x-[7px] border-b-[13px] border-x-transparent border-b-blue-400", shape: "h-0 w-0" },
    { role: "Room", className: "bg-violet-400", shape: "h-3 w-3" },
    { role: "Observer", className: "rounded-full border-2 border-amber-300 bg-amber-500/80", shape: "h-4 w-4" },
    { role: "Sensor", className: "bg-lime-400", shape: "h-3 w-3 rounded-[3px]" },
    { role: "Other", className: "rounded-full bg-slate-400", shape: "h-3 w-3" },
  ];
  const packets = [
    ["ADV", "#42ff7c"],
    ["TXT", "#ffd166"],
    ["GRP", "#ffb000"],
    ["TRC", "#ff8a3d"],
    ["ACK", "#b97c24"],
    ["CTL", "#a96500"],
    ["OTH", "#ffc766"],
  ];
  return (
    <aside className="netgraph-legend pointer-events-auto absolute left-3 top-16 z-10 hidden max-w-[260px] rounded-sm border border-border bg-bg-surface/90 p-2.5 shadow-2xl backdrop-blur-md md:block" aria-label="Netgraph legend">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] font-bold uppercase text-primary">Topology</div>
        <span className="font-mono text-[9px] uppercase text-text-dim">Live</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {devices.map((item) => (
          <span key={item.role} className="inline-flex min-w-0 items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-base/60 px-1.5 py-1 font-mono text-[9px] font-semibold uppercase text-text-muted">
            <i className={`shrink-0 ${item.shape} ${item.className}`} />
            <span className="truncate">{item.role}</span>
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {packets.map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1 rounded-sm border border-border-subtle bg-bg-base/50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-text-muted">
            <i className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: color, color }} />
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}

export function NetgraphView({ selectedNodeId, onSelectNode, wsManager }: NetgraphViewProps) {
  const { iatas, regionKey } = useRegion();
  const {
    clearNode,
    clearRoute,
    clearSelection,
    effectiveSelectedNodeId,
    focusNodeMode,
    focusRouteMode,
    selectNode,
    selectRoute,
    selectedRouteId,
    viewMode,
    viewNodeOnMap,
    viewRouteOnMap,
  } = useNetgraphSelection({ selectedNodeId, onSelectNode });
  const [routeLimit, setRouteLimit] = useState<NetgraphRouteLimit>(() => defaultRouteLimitForViewport());
  const [routeLimitTouched, setRouteLimitTouched] = useState(false);
  const [visualMode, setVisualMode] = useState<NetgraphVisualMode>("galaxy");
  const [webglError, setWebglError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showDataQuality, setShowDataQuality] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isMobile = useMediaQuery(MOBILE_NETGRAPH_QUERY);
  const visualModeConfig = NETGRAPH_VISUAL_MODE_CONFIGS[visualMode];
  const galaxyProfile = visualModeConfig.galaxy;
  const visualProfile = visualModeConfig.visual;
  const qualityMode = visualModeConfig.quality;
  const canvasShowDataQuality = visualMode === "galaxy" && showDataQuality;

  useEffect(() => {
    if (!routeLimitTouched && isMobile && routeLimit === DEFAULT_NETGRAPH_ROUTE_LIMIT) {
      const id = window.setTimeout(() => setRouteLimit(MOBILE_NETGRAPH_ROUTE_LIMIT), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [isMobile, routeLimit, routeLimitTouched]);

  const changeRouteLimit = useCallback((limit: NetgraphRouteLimit) => {
    setRouteLimitTouched(true);
    setRouteLimit(limit);
  }, []);
  const snapshot = useQuery({
    queryKey: ["netgraph-snapshot", regionKey, routeLimit],
    queryFn: () => getNetgraphSnapshot({ iatas, routeLimit }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const seededGraph = useMemo(() => buildNetgraph(snapshot.data, galaxyProfile), [snapshot.data, galaxyProfile]);
  const [graph, setGraph] = useState(seededGraph);
  const [layoutSettling, setLayoutSettling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (!cancelled) {
        setGraph(seededGraph);
        setLayoutSettling(seededGraph.nodes.length > 0);
      }
    }, 0);
    if (seededGraph.nodes.length === 0) {
      return () => {
        cancelled = true;
        window.clearTimeout(resetTimer);
      };
    }
    const ticks = isMobile || reducedMotion ? 82 : seededGraph.nodes.length > 1200 ? 104 : 130;
    const request = layoutRequestFromGraph(seededGraph, ticks, undefined, galaxyProfile);
    if (typeof Worker === "undefined") {
      const result = settleNetgraphLayout(request);
      const settleTimer = window.setTimeout(() => {
        if (!cancelled) {
          setGraph(applyLayoutPositions(seededGraph, resultToPositionMap(result)));
          setLayoutSettling(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(resetTimer);
        window.clearTimeout(settleTimer);
      };
    }
    const worker = new Worker(new URL("./netgraph-layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<NetgraphLayoutResult>) => {
      if (!cancelled) {
        setGraph(applyLayoutPositions(seededGraph, resultToPositionMap(event.data)));
        setLayoutSettling(false);
      }
    };
    worker.onerror = () => {
      if (!cancelled) {
        setGraph(applyLayoutPositions(seededGraph, resultToPositionMap(settleNetgraphLayout(request))));
        setLayoutSettling(false);
      }
      worker.terminate();
    };
    worker.postMessage(request);
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      worker.terminate();
    };
  }, [galaxyProfile, isMobile, reducedMotion, seededGraph]);

  const searchMatches = useMemo(() => graphSearchMatches(graph, deferredQuery), [deferredQuery, graph]);
  const { glows, liveStats, pulses } = useNetgraphLiveVisuals({ graph, iatas, regionKey, routeLimit, wsManager });

  if (snapshot.isLoading) {
    return <TerminalLoadingState label="PREPARING NETGRAPH" detail="Building verified route topology." />;
  }

  if (snapshot.isError) {
    return (
      <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-border bg-bg-base md:rounded-sm md:border" aria-label="Netgraph">
        <header className="border-b border-border bg-bg-surface/88 px-3 py-3">
          <h1 className="text-base font-semibold text-text-bright">Netgraph</h1>
          <p className="font-mono text-[11px] text-text-normal">Verified-route topology workspace</p>
        </header>
        <TopologySnapshotErrorState onRetry={() => void snapshot.refetch()} />
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-border bg-bg-base md:rounded-sm md:border" aria-label="Netgraph">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border bg-bg-surface/88 px-2 py-1.5 backdrop-blur md:gap-3 md:px-3 md:py-3">
        <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="flex min-w-0 items-baseline justify-between gap-2 md:block">
            <h1 className="text-base font-semibold text-text-bright">Netgraph</h1>
            <p className="shrink-0 font-mono text-[10px] text-text-normal md:hidden">
              {formatCount(graph.nodes.length)} nodes / {formatCount(graph.edges.length)} links / {liveStats.visualCount} live
            </p>
            <p className="hidden font-mono text-[11px] text-text-normal md:block">
              {formatCount(graph.nodes.length)} connected nodes / {formatCount(graph.edges.length)} public pathways
              {graph.stats.truncatedRoutes || graph.stats.truncatedNodes || graph.stats.truncatedEdges ? " / capped" : ""}
            </p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-1.5 md:w-auto md:gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-bg-base/90 px-2 py-1.5 md:w-72 md:flex-none md:px-2.5">
              <SearchIcon size={15} className="shrink-0 text-text-dim" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full min-w-0 bg-transparent font-mono text-[11px] text-text-normal outline-none placeholder:text-text-dim md:text-[12px]"
                placeholder="Search nodes"
              />
            </label>
            <button
              type="button"
              aria-label="Open netgraph settings"
              aria-pressed={settingsOpen}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1.5 text-[10px] font-mono font-semibold uppercase transition-colors ${
                settingsOpen ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-bg-base/90 text-text-muted hover:text-text-bright"
              }`}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <NetgraphSettingsIcon />
              <span className="hidden sm:inline">Settings</span>
              <span className="sr-only">Settings</span>
            </button>
          </div>
        </div>
        <div className="hidden min-w-0 items-center gap-2 font-mono text-[10px] font-semibold uppercase text-text-muted md:flex">
          <span className="text-green">TX {formatCount(liveStats.txCount)}</span>
          <span className="text-primary">RX {formatCount(liveStats.rxCount)}</span>
          {liveStats.payloadText ? <span className="truncate text-text-dim">{liveStats.payloadText}</span> : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {graph.nodes.length === 0 ? (
          <div className="absolute inset-0">
            <EmptyTopologyState />
          </div>
        ) : layoutSettling ? (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <TerminalLoadingState label="SETTLING NETGRAPH" detail="Packing topology for this device." />
          </div>
        ) : webglError ? (
          <FallbackList graph={graph} selectedRouteId={selectedRouteId} onSelectRoute={selectRoute} />
        ) : (
          <Suspense fallback={<TerminalLoadingState label="LOADING 3D ENGINE" detail="Preparing WebGL topology view." className="h-full" />}>
            <ThreeNetgraphCanvas
              graph={graph}
              selectedNodeId={effectiveSelectedNodeId}
              selectedRouteId={selectedRouteId}
              viewMode={viewMode}
              qualityMode={qualityMode}
              showDataQuality={canvasShowDataQuality}
              visualProfile={visualProfile}
              searchMatches={searchMatches}
              pulses={pulses}
              glows={glows}
              reducedMotion={reducedMotion}
              onSelectNode={selectNode}
              onSelectRoute={selectRoute}
              onClearSelection={clearSelection}
              onError={setWebglError}
            />
          </Suspense>
        )}
        <DeviceLegend />
        <NetgraphSettingsPanel
          open={settingsOpen}
          isMobile={isMobile}
          routeLimit={routeLimit}
          showDataQuality={showDataQuality}
          visualMode={visualMode}
          onChangeRouteLimit={changeRouteLimit}
          onChangeVisualMode={setVisualMode}
          onToggleDataQuality={() => setShowDataQuality((value) => !value)}
          onClose={() => setSettingsOpen(false)}
        />
        <div className="netgraph-live-pill pointer-events-auto absolute bottom-2 left-2 z-10 hidden max-w-[calc(100%-1rem)] items-center gap-2 rounded-sm border border-border bg-bg-surface/88 px-2 py-1.5 font-mono text-[10px] shadow-2xl backdrop-blur-md md:bottom-3 md:left-3 md:inline-flex md:px-3 md:py-2 md:text-[11px]">
          <ActivityIcon size={14} className="text-primary" />
          <span className="text-text-muted">{wsManager?.getStatus() ?? "offline"}</span>
          <b className="text-green">{liveStats.visualCount} live pulses</b>
          <span className="hidden text-text-dim sm:inline">TX {formatCount(liveStats.txCount)} / RX {formatCount(liveStats.rxCount)}</span>
        </div>
        <NodeInspector graph={graph} selectedNodeId={selectedRouteId == null ? effectiveSelectedNodeId : null} onFocusNode={focusNodeMode} onViewNodeOnMap={viewNodeOnMap} onClearNode={clearNode} />
        <Inspector graph={graph} selectedRouteId={selectedRouteId} onFocusRoute={focusRouteMode} onViewRouteOnMap={viewRouteOnMap} onClearRoute={clearRoute} />
      </div>
    </section>
  );
}
