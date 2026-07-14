import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type SVGProps } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import "./netgraph.css";
import { getNetgraphSnapshot } from "../../api/client";
import type { WsManager } from "../../api/ws-manager";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useRegion } from "../../hooks/useRegion";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatCount } from "../../lib/formatters";
import {
  applyLayoutPositions,
  buildNetgraph,
  DEFAULT_NETGRAPH_ROUTE_LIMIT,
  graphSearchMatches,
  netgraphLayoutSignature,
  type NetgraphLayoutMode,
  type NetgraphPulse,
  type NetgraphQualityPreference,
  type NetgraphRouteLimit,
} from "./netgraph-model";
import { layoutRequestFromGraph, resultToPositionMap, settleNetgraphLayout, type NetgraphLayoutResult } from "./netgraph-layout";
import {
  markNetgraphIntroCompletedThisSession,
  netgraphIntroCompletedThisSession,
  readNetgraphLayoutMode,
  readNetgraphLiveGuideEnabled,
  readNetgraphQualityPreference,
  writeNetgraphLayoutMode,
  writeNetgraphLiveGuideEnabled,
  writeNetgraphQualityPreference,
} from "./netgraph-preferences";
import { EmptyTopologyState, TopologySnapshotErrorState } from "./NetgraphRouteStates";
import { NetgraphSettingsIcon, NetgraphSettingsPanel } from "./NetgraphSettingsPanel";
import {
  MOBILE_NETGRAPH_QUERY,
  MOBILE_NETGRAPH_ROUTE_LIMIT,
  NETGRAPH_LAYOUT_CONFIGS,
  NETGRAPH_QUALITY_CONFIGS,
  defaultRouteLimitForViewport,
} from "./netgraph-settings-config";
import { FallbackList, Inspector, NodeInspector } from "./NetgraphPanels";
import { useNetgraphLiveVisuals } from "./useNetgraphLiveVisuals";
import { useNetgraphSelection } from "./useNetgraphSelection";

const ThreeNetgraphCanvas = lazy(() => import("./ThreeNetgraphCanvas").then((mod) => ({ default: mod.ThreeNetgraphCanvas })));

interface NetgraphViewProps {
  immersive?: boolean;
  onImmersiveChange?: (immersive: boolean) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  wsManager?: WsManager;
}

function SvgIcon({ size = 16, children, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

function SearchIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return <SvgIcon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></SvgIcon>;
}

function ActivityIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return <SvgIcon {...props}><path d="M3 12h4l2-7 4 14 2-7h6" /></SvgIcon>;
}

function ImmersiveIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return <SvgIcon {...props}><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></SvgIcon>;
}

function DeviceLegend({ graph }: { graph: ReturnType<typeof buildNetgraph> }) {
  const devices = [
    ["Repeater", "#48df7b"], ["Companion", "#6aa2ff"], ["Room", "#ba66ff"],
    ["Observer", "#ffb21f"], ["Sensor", "#a6f43b"], ["Other", "#9aa6bb"],
  ];
  return (
    <aside className="netgraph-legend pointer-events-auto absolute left-3 top-[5.25rem] z-10 hidden w-52 rounded-2xl border border-border bg-bg-surface/72 p-3 shadow-2xl backdrop-blur-xl lg:block" aria-label="Netgraph legend">
      <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-widest text-primary"><span>Node roles</span><span>{graph.layoutMode === "geo" ? "Geo" : "Galaxy"}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {devices.map(([label, color]) => <span key={label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-text-muted"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />{label}</span>)}
      </div>
      {graph.layoutMode === "geo" && (
        <div className="mt-2.5 border-t border-border-subtle pt-2 font-mono text-[9px] leading-relaxed text-text-dim">
          {graph.locationStats.coordinates} coordinates · {graph.locationStats.iataCentroid} IATA inferred · {graph.locationStats.unlocated} outer constellation
        </div>
      )}
    </aside>
  );
}

function initialIntroEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia(MOBILE_NETGRAPH_QUERY).matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && !netgraphIntroCompletedThisSession();
}

export function NetgraphView({ immersive = false, onImmersiveChange, selectedNodeId, onSelectNode, wsManager }: NetgraphViewProps) {
  const { iatas, regionKey } = useRegion();
  const {
    clearNode, clearRoute, clearSelection, effectiveSelectedNodeId, focusNodeMode, focusRouteMode,
    selectNode, selectRoute, selectedRouteId, viewMode, viewNodeOnMap, viewRouteOnMap,
  } = useNetgraphSelection({ selectedNodeId, onSelectNode });
  const [routeLimit, setRouteLimit] = useState<NetgraphRouteLimit>(() => defaultRouteLimitForViewport());
  const [routeLimitTouched, setRouteLimitTouched] = useState(false);
  const [layoutMode, setLayoutMode] = useState<NetgraphLayoutMode>(readNetgraphLayoutMode);
  const [qualityPreference, setQualityPreference] = useState<NetgraphQualityPreference>(readNetgraphQualityPreference);
  const [liveGuideEnabled, setLiveGuideEnabled] = useState(readNetgraphLiveGuideEnabled);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [showDataQuality, setShowDataQuality] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nodeDetailsExpanded, setNodeDetailsExpanded] = useState(false);
  const [routeDetailsExpanded, setRouteDetailsExpanded] = useState(false);
  const [routeFlightRequestId, setRouteFlightRequestId] = useState(0);
  const [livePrompt, setLivePrompt] = useState<NetgraphPulse | null>(null);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [initialIntro] = useState(initialIntroEnabled);
  const deferredQuery = useDeferredValue(query);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isMobile = useMediaQuery(MOBILE_NETGRAPH_QUERY);
  const galaxyProfile = NETGRAPH_LAYOUT_CONFIGS[layoutMode].galaxy;
  const qualityConfig = NETGRAPH_QUALITY_CONFIGS[qualityPreference];

  const markInteraction = useCallback(() => {
    setLastInteractionAt(Date.now());
    setLivePrompt(null);
  }, []);

  useEffect(() => writeNetgraphLayoutMode(layoutMode), [layoutMode]);
  useEffect(() => writeNetgraphQualityPreference(qualityPreference), [qualityPreference]);
  useEffect(() => writeNetgraphLiveGuideEnabled(liveGuideEnabled), [liveGuideEnabled]);
  useEffect(() => () => onImmersiveChange?.(false), [onImmersiveChange]);
  useEffect(() => {
    if (initialIntro) markNetgraphIntroCompletedThisSession();
  }, [initialIntro]);

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
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const seededGraph = useMemo(() => buildNetgraph(snapshot.data, galaxyProfile, layoutMode), [snapshot.data, galaxyProfile, layoutMode]);
  const layoutSignature = useMemo(() => netgraphLayoutSignature(seededGraph, galaxyProfile), [galaxyProfile, seededGraph]);
  const [settledLayout, setSettledLayout] = useState<{ graph: ReturnType<typeof buildNetgraph>; signature: string | null }>(() => ({
    graph: seededGraph,
    signature: layoutMode === "galaxy" ? layoutSignature : null,
  }));
  const appliedLayoutSignatureRef = useRef<string | null>(null);
  const graph = layoutMode === "geo" || settledLayout.signature !== layoutSignature ? seededGraph : settledLayout.graph;
  const layoutSettling = layoutMode === "galaxy" && seededGraph.nodes.length > 0 && settledLayout.signature !== layoutSignature;

  useEffect(() => {
    let cancelled = false;
    if (appliedLayoutSignatureRef.current === layoutSignature) return undefined;
    if (layoutMode === "geo" || seededGraph.nodes.length === 0) {
      appliedLayoutSignatureRef.current = layoutSignature;
      return undefined;
    }
    const ticks = isMobile || reducedMotion ? 82 : seededGraph.nodes.length > 1200 ? 104 : 130;
    const request = layoutRequestFromGraph(seededGraph, ticks, undefined, galaxyProfile);
    const applySettledGraph = (result: NetgraphLayoutResult) => {
      if (cancelled) return;
      appliedLayoutSignatureRef.current = layoutSignature;
      setSettledLayout({ graph: applyLayoutPositions(seededGraph, resultToPositionMap(result)), signature: layoutSignature });
    };
    if (typeof Worker === "undefined") {
      const result = settleNetgraphLayout(request);
      const timer = window.setTimeout(() => applySettledGraph(result), 0);
      return () => { cancelled = true; window.clearTimeout(timer); };
    }
    const worker = new Worker(new URL("./netgraph-layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<NetgraphLayoutResult>) => applySettledGraph(event.data);
    worker.onerror = () => { applySettledGraph(settleNetgraphLayout(request)); worker.terminate(); };
    worker.postMessage(request);
    return () => { cancelled = true; worker.terminate(); };
  }, [galaxyProfile, isMobile, layoutMode, layoutSignature, reducedMotion, seededGraph]);

  const searchMatches = useMemo(() => graphSearchMatches(graph, deferredQuery), [deferredQuery, graph]);
  const searchResults = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return [];
    return graph.nodes
      .filter((node) => node.searchText.includes(needle))
      .sort((left, right) => Number(right.label.toLowerCase().startsWith(needle)) - Number(left.label.toLowerCase().startsWith(needle)) || right.degree - left.degree || left.label.localeCompare(right.label))
      .slice(0, 8);
  }, [deferredQuery, graph.nodes]);
  const { glows, liveStats, pulses, routeHeat } = useNetgraphLiveVisuals({ graph, iatas, regionKey, routeLimit, wsManager });

  const livePromptEligible = liveGuideEnabled && !effectiveSelectedNodeId && selectedRouteId == null && !settingsOpen && !searchFocused && !query.trim();
  const visibleLivePrompt = livePromptEligible ? livePrompt : null;

  useEffect(() => {
    if (!livePromptEligible) return undefined;
    const timer = window.setInterval(() => {
      if (Date.now() - lastInteractionAt < 8_000 || livePrompt) return;
      const candidate = pulses.filter((pulse) => pulse.segments.length > 1).sort((a, b) => b.startedAt - a.startedAt)[0]
        ?? pulses.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
      if (!candidate) return;
      const lastOfferedAt = Number(sessionStorage.getItem("beacon.netgraph.live-guide-last-at") ?? 0);
      const lastOfferedId = sessionStorage.getItem("beacon.netgraph.live-guide-last-id");
      if (Date.now() - lastOfferedAt < 15_000 || lastOfferedId === candidate.id) return;
      sessionStorage.setItem("beacon.netgraph.live-guide-last-at", String(Date.now()));
      sessionStorage.setItem("beacon.netgraph.live-guide-last-id", candidate.id);
      setLivePrompt(candidate);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lastInteractionAt, livePrompt, livePromptEligible, pulses]);

  useEffect(() => {
    if (!livePrompt) return undefined;
    const timer = window.setTimeout(() => setLivePrompt(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [livePrompt]);

  const chooseSearchResult = useCallback((nodeId: string) => {
    selectNode(nodeId);
    setQuery("");
    setSearchFocused(false);
    setNodeDetailsExpanded(false);
    markInteraction();
  }, [markInteraction, selectNode]);

  const handleCanvasSelectNode = useCallback((nodeId: string) => {
    selectNode(nodeId);
    setNodeDetailsExpanded(false);
  }, [selectNode]);

  const handleCanvasSelectRoute = useCallback((routeId: number) => {
    selectRoute(routeId);
    setRouteDetailsExpanded(false);
  }, [selectRoute]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveSearchIndex((index) => Math.min(searchResults.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveSearchIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter" && searchResults[activeSearchIndex]) { event.preventDefault(); chooseSearchResult(searchResults[activeSearchIndex]!.id); }
    else if (event.key === "Escape") { setSearchFocused(false); setQuery(""); }
  };

  const followLivePrompt = () => {
    const firstEdge = livePrompt?.segments[0] ? graph.edgeById.get(livePrompt.segments[0].edgeId) : null;
    const routeId = firstEdge?.routeIds[0];
    if (routeId == null) { setLivePrompt(null); return; }
    selectRoute(routeId);
    setRouteFlightRequestId((value) => value + 1);
    setLivePrompt(null);
    markInteraction();
  };

  if (snapshot.isLoading) return <TerminalLoadingState label="PREPARING NETGRAPH" detail="Building verified route topology." />;
  if (snapshot.isError) {
    return <section className="netgraph-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-base" aria-label="Netgraph"><TopologySnapshotErrorState onRetry={() => void snapshot.refetch()} /></section>;
  }

  return (
    <section className="netgraph-workspace relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg-base" aria-label="Netgraph" onPointerDownCapture={markInteraction}>
      <header className="netgraph-toolbar pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-2 md:p-3">
        <div className="pointer-events-auto hidden min-w-0 rounded-2xl border border-border bg-bg-surface/72 px-3 py-2 shadow-2xl backdrop-blur-xl sm:block">
          <div className="flex items-baseline gap-2"><h1 className="text-sm font-semibold text-text-bright">Netgraph</h1><span className="font-mono text-[9px] font-bold uppercase tracking-widest text-primary">{layoutMode === "geo" ? "Geo constellation" : "Galaxy"}</span></div>
          <p className="mt-0.5 font-mono text-[9px] text-text-muted">{formatCount(graph.nodes.length)} nodes · {formatCount(graph.edges.length)} links · {liveStats.visualCount} live</p>
        </div>
        <div className="pointer-events-auto ml-auto flex min-w-0 items-start gap-1.5">
          <div className="relative min-w-0">
            <label className="netgraph-search flex h-10 w-[min(19rem,calc(100vw-7.5rem))] min-w-0 items-center gap-2 rounded-full border border-border bg-bg-surface/78 px-3 shadow-2xl backdrop-blur-xl md:w-72">
              <SearchIcon size={15} className="shrink-0 text-text-dim" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setSearchFocused(true); setActiveSearchIndex(0); }} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)} onKeyDown={onSearchKeyDown} role="combobox" aria-label="Search Netgraph nodes" aria-autocomplete="list" aria-expanded={searchFocused && query.trim().length > 0} aria-controls="netgraph-search-results" aria-activedescendant={searchResults[activeSearchIndex] ? `netgraph-search-${searchResults[activeSearchIndex]!.id}` : undefined} className="w-full min-w-0 bg-transparent font-mono text-[11px] text-text-normal outline-none placeholder:text-text-dim" placeholder="Find a node or IATA" />
            </label>
            {searchFocused && query.trim() && (
              <div id="netgraph-search-results" role="listbox" className="absolute right-0 top-[calc(100%+0.45rem)] max-h-80 w-full overflow-y-auto rounded-2xl border border-border bg-bg-surface/96 p-1.5 shadow-2xl backdrop-blur-xl">
                {searchResults.length > 0 ? searchResults.map((node, index) => (
                  <button id={`netgraph-search-${node.id}`} key={node.id} type="button" role="option" aria-selected={index === activeSearchIndex} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${index === activeSearchIndex ? "bg-primary/12" : "hover:bg-primary/8"}`} onMouseEnter={() => setActiveSearchIndex(index)} onClick={() => chooseSearchResult(node.id)}>
                    <span className="min-w-0"><b className="block truncate text-xs text-text-bright">{node.label}</b><span className="block truncate font-mono text-[9px] uppercase text-text-dim">{node.role} · {node.iatas.join(", ") || "unlocated"}</span></span>
                    <span className="shrink-0 font-mono text-[9px] text-primary">{node.routeCount} routes</span>
                  </button>
                )) : <div className="px-3 py-4 text-center font-mono text-[10px] text-text-dim">No matching nodes</div>}
              </div>
            )}
          </div>
          <button type="button" aria-label="Open netgraph settings" aria-pressed={settingsOpen} className={`netgraph-settings-button grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-bg-surface/78 shadow-2xl backdrop-blur-xl ${settingsOpen ? "border-primary/50 text-primary" : "border-border text-text-muted"}`} onClick={() => setSettingsOpen((open) => !open)}><NetgraphSettingsIcon /></button>
          <button type="button" aria-label={immersive ? "Exit immersive Netgraph" : "Enter immersive Netgraph"} aria-pressed={immersive} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-bg-surface/78 shadow-2xl backdrop-blur-xl ${immersive ? "border-green/50 text-green" : "border-border text-text-muted"}`} onClick={() => onImmersiveChange?.(!immersive)}><ImmersiveIcon size={16} /></button>
        </div>
      </header>

      <div className="absolute inset-0 overflow-hidden">
        {graph.nodes.length === 0 ? <div className="absolute inset-0">{layoutSettling ? <TerminalLoadingState label="PREPARING NETGRAPH" detail="Building stable topology." /> : <EmptyTopologyState />}</div>
          : webglError ? <FallbackList graph={graph} selectedRouteId={selectedRouteId} onSelectRoute={selectRoute} />
            : <Suspense fallback={<TerminalLoadingState label="LOADING 3D ENGINE" detail="Preparing WebGL topology view." className="h-full" />}>
              <ThreeNetgraphCanvas graph={graph} externalInteractionAt={lastInteractionAt} selectedNodeId={effectiveSelectedNodeId} selectedRouteId={selectedRouteId} viewMode={viewMode} qualityMode={qualityConfig.quality} showDataQuality={showDataQuality} visualProfile={qualityConfig.visual} searchMatches={searchMatches} pulses={pulses} glows={glows} routeHeat={routeHeat} introEnabled={initialIntro} routeFlightRequestId={routeFlightRequestId} reducedMotion={reducedMotion} onSelectNode={handleCanvasSelectNode} onSelectRoute={handleCanvasSelectRoute} onClearSelection={clearSelection} onUserInteraction={markInteraction} onError={setWebglError} />
            </Suspense>}
      </div>

      <DeviceLegend graph={graph} />
      <NetgraphSettingsPanel open={settingsOpen} isMobile={isMobile} routeLimit={routeLimit} layoutMode={layoutMode} qualityPreference={qualityPreference} liveGuideEnabled={liveGuideEnabled} showDataQuality={showDataQuality} onChangeRouteLimit={changeRouteLimit} onChangeLayoutMode={(mode) => { setWebglError(null); setLayoutMode(mode); }} onChangeQualityPreference={setQualityPreference} onToggleLiveGuide={() => setLiveGuideEnabled((enabled) => !enabled)} onToggleDataQuality={() => setShowDataQuality((value) => !value)} onClose={() => setSettingsOpen(false)} />

      <div className="netgraph-live-pill pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 rounded-full border border-border bg-bg-surface/72 px-3 py-2 font-mono text-[10px] shadow-2xl backdrop-blur-xl md:inline-flex"><ActivityIcon size={14} className="text-primary" /><span className="text-text-muted">{wsManager?.getStatus() ?? "offline"}</span><b className="text-green">{liveStats.visualCount} live</b></div>

      {visibleLivePrompt && (
        <aside className="pointer-events-auto absolute left-1/2 top-[5.1rem] z-30 flex w-[min(26rem,calc(100%-1rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-green/35 bg-bg-surface/92 p-3 shadow-2xl backdrop-blur-xl" aria-live="polite">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green/12 text-green"><ActivityIcon size={17} /></span>
          <div className="min-w-0 flex-1"><div className="font-mono text-[9px] font-bold uppercase tracking-widest text-green">Live route available</div><div className="truncate text-xs text-text-bright">Follow {visibleLivePrompt.segments.length} active hops</div></div>
          <button type="button" className="rounded-full border border-green/40 bg-green/10 px-3 py-2 font-mono text-[9px] font-bold uppercase text-green" onClick={followLivePrompt}>Follow</button>
          <button type="button" aria-label="Dismiss live route suggestion" className="text-text-dim" onClick={() => setLivePrompt(null)}>×</button>
        </aside>
      )}

      <NodeInspector graph={graph} selectedNodeId={selectedRouteId == null ? effectiveSelectedNodeId : null} expanded={nodeDetailsExpanded} onToggleExpanded={() => setNodeDetailsExpanded((expanded) => !expanded)} onFocusNode={focusNodeMode} onViewNodeOnMap={viewNodeOnMap} onClearNode={() => { clearNode(); setNodeDetailsExpanded(false); }} />
      <Inspector graph={graph} selectedRouteId={selectedRouteId} expanded={routeDetailsExpanded} onToggleExpanded={() => setRouteDetailsExpanded((expanded) => !expanded)} onFocusRoute={focusRouteMode} onViewRouteOnMap={viewRouteOnMap} onClearRoute={() => { clearRoute(); setRouteDetailsExpanded(false); }} />
    </section>
  );
}
