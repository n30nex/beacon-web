import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RegionProvider, useRegion, useRegionSelection } from "./hooks/useRegion";
import {
  ALL_REGIONS,
  isAllRegions,
  parseSelection,
  selectionToParams,
  resolveIatas,
  deserializeSelection,
  type RegionSelection,
} from "./hooks/region-selection";
import { ThemeProvider } from "./hooks/useTheme";
import { useIsMobile } from "./hooks/useMediaQuery";
import { AppShell } from "./components/AppShell";
import { RuntimeStatusPanel } from "./components/RuntimeStatusPanel";
import { SplashScreen } from "./components/SplashScreen";
import { TerminalLoadingState } from "./components/TerminalLoader";
import { GlobalSearchPalette } from "./components/GlobalSearchPalette";
import { getPacketDetail } from "./api/client";
import { WsManager } from "./api/ws-manager";
import { WS_URL } from "./lib/constants";
import {
  applyNavigationParams,
  canonicalizeNavigationParams,
  moduleLabel,
  navigationForTarget,
  navigationFromParams,
  type NavigationState,
  type PageTab,
} from "./lib/navigation";
import type { GlobalSearchResult } from "./types/api";
import { WS_EVENT_TYPES } from "./types/ws";

// Map-bearing pages are lazy so maplibre-gl (~800KB) leaves the entry graph entirely and streams
// in its own cacheable chunk instead of blocking first paint. AppInner idle-prefetches those chunks
// only when the user starts on a map-heavy page.
const HomeView = lazy(() => import("./features/home/HomeView").then((m) => ({ default: m.HomeView })));
const LiveView = lazy(() => import("./features/live/LiveView").then((m) => ({ default: m.LiveView })));
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));
const PacketList = lazy(() => import("./features/packets/PacketList").then((m) => ({ default: m.PacketList })));
const ChannelList = lazy(() => import("./features/channels/ChannelList").then((m) => ({ default: m.ChannelList })));
const NodeTable = lazy(() => import("./features/nodes/NodeTable").then((m) => ({ default: m.NodeTable })));
const ObserverTable = lazy(() => import("./features/observers/ObserverTable").then((m) => ({ default: m.ObserverTable })));
const RouteTable = lazy(() => import("./features/routes/RouteTable").then((m) => ({ default: m.RouteTable })));
const NetgraphView = lazy(() => import("./features/netgraph/NetgraphView").then((m) => ({ default: m.NetgraphView })));
const TraceList = lazy(() => import("./features/traces/TraceList").then((m) => ({ default: m.TraceList })));
const PacketAnalyzerDrawer = lazy(() => import("./features/packets/PacketAnalyzerDrawer").then((m) => ({ default: m.PacketAnalyzerDrawer })));
const PacketAnalyzerOverlay = lazy(() => import("./features/packets/PacketAnalyzerOverlay").then((m) => ({ default: m.PacketAnalyzerOverlay })));
const NodeDetailPanel = lazy(() => import("./features/nodes/NodeDetailPanel").then((m) => ({ default: m.NodeDetailPanel })));
const NodeDetailOverlay = lazy(() => import("./features/nodes/NodeDetailOverlay").then((m) => ({ default: m.NodeDetailOverlay })));
const InvestigationsView = lazy(() => import("./features/investigations/InvestigationsView").then((m) => ({ default: m.InvestigationsView })));

// Analytics pulls in ECharts (~150-200KB gz), so lazy-load it too.
const StatsOverview = lazy(() => import("./features/stats/StatsOverview").then((m) => ({ default: m.StatsOverview })));

// Warm the maplibre-backed chunks during idle for map-heavy entry points. Safe to call repeatedly —
// the dynamic import is cached after the first hit.
function prefetchMapChunks() {
  void import("./features/live/LiveView");
  void import("./features/map/MapView");
}

const MAP_PREFETCH_TABS = new Set<PageTab>(["Live", "Map"]);

// global singletons

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const wsManager = new WsManager(WS_URL);

// Compute the initial region selection on first load: URL params win (shareable links), then the
// persisted selection, then the pre-multi-select single-IATA key (migrated), else all regions.
function computeInitialSelection(params: URLSearchParams): RegionSelection {
  const fromUrl = parseSelection(params);
  if (!isAllRegions(fromUrl)) return fromUrl;
  const stored = deserializeSelection(localStorage.getItem("beacon-region-selection"));
  if (!isAllRegions(stored)) return stored;
  const legacy = localStorage.getItem("beacon-region");
  if (legacy && legacy !== "*") return { regions: [], iatas: [legacy.toUpperCase()] };
  return ALL_REGIONS;
}

// null-render component -- easiest way to sync region changes into the WS manager

function RegionWatcher({ wsManager: mgr }: { wsManager: WsManager }) {
  const { iatas, regionKey } = useRegion();

  useEffect(() => {
    mgr.updateSubscription({ iatas, events: [...WS_EVENT_TYPES] });
    // regionKey is the stable identity of the resolved iatas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgr, regionKey]);

  return null;
}

// Mirror the active selection into the URL (?regions= / ?iata=) so the address bar is always shareable
// — on a dropdown change and on load (including a selection restored from localStorage, which users
// wouldn't otherwise know was shareable). All-regions clears both params; any legacy ?region is folded
// in. The guard skips redundant writes (and any setSearchParams feedback loop); replace keeps it out of
// history.
function RegionUrlSync() {
  const { selection } = useRegionSelection();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const next = selectionToParams(selection, searchParams);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [selection, searchParams, setSearchParams]);

  return null;
}

// Drop the shared node selection when the region changes, so the detail panel doesn't keep showing a
// node that's no longer in the re-queried map/table. Lives inside RegionProvider so it can read useRegion.
function SelectionResetOnRegion({ onRegionChange }: { onRegionChange: () => void }) {
  const { regionKey } = useRegion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // skip the initial mount; only react to a real change
      return;
    }
    onRegionChange();
  }, [regionKey, onRegionChange]);

  return null;
}

function workspaceKey(navigation: NavigationState): string {
  return navigation.tab;
}

function clearDetailParamsForNavigation(params: URLSearchParams, navigation: NavigationState) {
  if (navigation.tab !== "Packets" && navigation.tab !== "Channels") {
    params.delete("hash");
    params.delete("channelId");
  }
  if (navigation.tab !== "Nodes" && navigation.tab !== "Live" && navigation.tab !== "Map" && navigation.tab !== "Netgraph") {
    params.delete("nodeId");
  }
  if (navigation.tab !== "Observers" && navigation.tab !== "Analytics") {
    params.delete("observerId");
  }
  if (navigation.tab !== "Routes" && navigation.tab !== "Map" && navigation.tab !== "Netgraph") {
    params.delete("routeId");
    params.delete("routeReplay");
  }
  if (navigation.tab !== "Map") {
    params.delete("mapFocus");
  }
  if (navigation.tab !== "Traces") {
    params.delete("traceTag");
  }
  if (navigation.tab !== "Analytics") {
    params.delete("statsTab");
    params.delete("compare");
    params.delete("compareIds");
  }
  if (navigation.tab !== "Investigations") {
    params.delete("create");
    params.delete("source");
  }
}

function SystemView({ wsManager }: { wsManager: WsManager }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-bg-base p-3 md:p-4">
      <header className="rounded-sm border border-border bg-bg-surface p-3">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">Runtime Confidence</div>
        <h1 className="m-0 font-mono text-lg font-semibold uppercase tracking-wider text-text-bright">System</h1>
      </header>
      <RuntimeStatusPanel wsManager={wsManager} variant="page" />
    </div>
  );
}

// tab state and region init

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  // The URL is the single source of truth for the active destination.
  // Legacy ?tab=Atlas/Investigate/Ops links are normalized into the direct IA below.
  const activeNavigation = navigationFromParams(searchParams);
  const activeTab = activeNavigation.tab;
  const shouldPrefetchMapChunksOnMountRef = useRef(MAP_PREFETCH_TABS.has(activeTab));
  // Resolve the starting selection once from URL → storage → legacy key (see computeInitialSelection).
  const [initialSelection] = useState(() => computeInitialSelection(searchParams));

  const [analyzerHash, setAnalyzerHash] = useState<string | null>(() => searchParams.get("hash"));
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => searchParams.get("nodeId"));
  // lifted (like selectedNodeId) so a node's "View observer" link can select it before the tab mounts
  const [selectedObserverId, setSelectedObserverId] = useState<string | null>(() => searchParams.get("observerId"));
  const [searchOpen, setSearchOpen] = useState(false);
  // node detail shown as a modal over the packet analyzer (e.g. clicking a resolved path hop)
  const [overlayNodeId, setOverlayNodeId] = useState<string | null>(null);
  // packet analyzer shown as a modal over the node panel (clicking a node's observation row)
  const [overlayPacketHash, setOverlayPacketHash] = useState<string | null>(null);

  // short staleTime: observations keep accruing, so reopening the analyzer should show them
  // instead of a snapshot frozen at first open
  const { data: analyzerDetail, isLoading: analyzerLoading } = useQuery({
    queryKey: ["packet-detail", analyzerHash],
    queryFn: () => getPacketDetail(analyzerHash!),
    enabled: !!analyzerHash,
    staleTime: 30_000,
  });

  const { data: overlayPacketDetail, isLoading: overlayPacketLoading } = useQuery({
    queryKey: ["packet-detail", overlayPacketHash],
    queryFn: () => getPacketDetail(overlayPacketHash!),
    enabled: !!overlayPacketHash,
    staleTime: 30_000,
  });

  useEffect(() => {
    const canonical = canonicalizeNavigationParams(searchParams);
    if (canonical.toString() !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleAnalyze = useCallback((hash: string | null) => {
    setAnalyzerHash(hash);
    setSelectedObservationId(null);
  }, [setAnalyzerHash, setSelectedObservationId]);

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("nodeId", id);
      else { next.delete("nodeId"); next.delete("mapFocus"); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSelectObserver = useCallback((id: string | null) => {
    setSelectedObserverId(id);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("observerId", id);
      else next.delete("observerId");
      return next;
    }, { replace: true });
  }, [setSearchParams, setSelectedObserverId]);

  const navigateToState = useCallback((navigation: NavigationState, replace = false) => {
    setOverlayNodeId(null);
    setOverlayPacketHash(null);
    // On mobile a detail panel fills the screen, so leaving its tab must close it; desktop side
    // panels persist across tabs. Cross-nav (onViewObserver) re-sets its selection after this.
    if (isMobile) {
      setAnalyzerHash(null);
      setSelectedObservationId(null);
      setSelectedNodeId(null);
      setSelectedObserverId(null);
    }
    setSearchParams((prev) => {
      const next = applyNavigationParams(prev, navigation);
      clearDetailParamsForNavigation(next, navigation);
      return next;
    }, { replace });
  }, [
    isMobile,
    setAnalyzerHash,
    setOverlayNodeId,
    setOverlayPacketHash,
    setSearchParams,
    setSelectedNodeId,
    setSelectedObservationId,
    setSelectedObserverId,
  ]);

  const handleTabChange = useCallback((tab: string) => {
    navigateToState(navigationForTarget(tab));
  }, [navigateToState]);

  const navigateToSearchResult = useCallback(
    (result: GlobalSearchResult) => {
      setOverlayNodeId(null);
      setOverlayPacketHash(null);
      setAnalyzerHash(null);
      setSelectedObservationId(null);
      setSelectedNodeId(null);
      setSelectedObserverId(null);
      const url = new URL(result.url, window.location.origin);
      let next = new URLSearchParams(searchParams);
      for (const key of Array.from(next.keys())) {
        if (["hash", "nodeId", "observerId", "channelId", "traceTag", "routeId", "routeReplay", "statsTab", "compare", "compareIds"].includes(key)) {
          next.delete(key);
        }
      }
      url.searchParams.forEach((value, key) => next.set(key, value));

      switch (result.type) {
      case "packet":
        setAnalyzerHash(String(result.metadata?.packetHash ?? result.id));
        next = applyNavigationParams(next, { tab: "Packets" });
        next.set("hash", String(result.metadata?.packetHash ?? result.id));
        break;
      case "node":
        setSelectedNodeId(result.id);
        next = applyNavigationParams(next, { tab: "Nodes" });
        next.set("nodeId", result.id);
        break;
      case "observer":
        setSelectedObserverId(result.id);
        next = applyNavigationParams(next, { tab: "Observers" });
        next.set("observerId", result.id);
        break;
      case "route":
        next.set("tab", "Map");
        next.delete("module");
        next.set("routeId", result.id);
        next.set("routeReplay", "1");
        break;
      case "channel":
        next = applyNavigationParams(next, { tab: "Channels" });
        next.set("channelId", result.id);
        break;
      case "trace":
        next = applyNavigationParams(next, { tab: "Traces" });
        next.set("traceTag", result.id);
        break;
      default:
        break;
      }
      setSearchParams(next);
    },
    [
      searchParams,
      setAnalyzerHash,
      setOverlayNodeId,
      setOverlayPacketHash,
      setSearchParams,
      setSelectedNodeId,
      setSelectedObservationId,
      setSelectedObserverId,
    ],
  );

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setOverlayNodeId(null);
    setOverlayPacketHash(null);
    setSelectedObserverId(null);
  }, [setOverlayNodeId, setOverlayPacketHash, setSelectedNodeId, setSelectedObserverId]);

  // Jump from an observer's detail panel to its telemetry on Analytics, preselected.
  const handleViewObserverStats = useCallback(
    (id: string) => {
      setOverlayNodeId(null);
      setOverlayPacketHash(null);
      setSearchParams((prev) => {
        const next = applyNavigationParams(prev, { tab: "Analytics" });
        next.set("statsTab", "observers");
        next.set("observerId", id);
        return next;
      });
    },
    [setOverlayNodeId, setOverlayPacketHash, setSearchParams],
  );

  useEffect(() => {
    // Region slugs can't be expanded yet (region details load async) — connect with the directly
    // selected IATAs; RegionWatcher narrows the subscription once useRegion resolves the slugs.
    wsManager.connect({ iatas: resolveIatas(initialSelection, new Map()), events: [...WS_EVENT_TYPES] });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Prefetch maplibre-backed view chunks during idle for map-heavy entry points.
  useEffect(() => {
    if (!shouldPrefetchMapChunksOnMountRef.current) return;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }).requestIdleCallback;
    if (ric) {
      const id = ric(prefetchMapChunks);
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(prefetchMapChunks, 200);
    return () => window.clearTimeout(t);
  }, []);

  const tabContent: Record<PageTab, React.ReactNode> = {
    Home: <HomeView wsManager={wsManager} onNavigate={handleTabChange} />,
    Live: <LiveView wsManager={wsManager} onAnalyze={setOverlayPacketHash} selectedNodeId={selectedNodeId} onSelectNode={(id) => handleSelectNode(id)} nodePanelOpen={Boolean(selectedNodeId)} />,
    Packets: <PacketList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Nodes: <NodeTable wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={handleSelectNode} />,
    Observers: <ObserverTable wsManager={wsManager} selectedObserverId={selectedObserverId} onSelectObserver={handleSelectObserver} onAnalyzePacket={setOverlayPacketHash} onViewStats={handleViewObserverStats} />,
    Investigations: <InvestigationsView />,
    Routes: <RouteTable />,
    Netgraph: <NetgraphView selectedNodeId={selectedNodeId} onSelectNode={(id) => handleSelectNode(id)} wsManager={wsManager} />,
    // analyze opens the packet overlay (modal) rather than the side drawer, which suits the
    // master/detail layout and renders on any tab — same path NodeDetailPanel's onAnalyzePacket uses
    Traces: <TraceList onAnalyze={setOverlayPacketHash} onViewNode={setOverlayNodeId} />,
    Channels: <ChannelList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Analytics: <StatsOverview wsManager={wsManager} />,
    System: <SystemView wsManager={wsManager} />,
    Map: <MapView wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={(id) => handleSelectNode(id)} />,
  };

  const contentKey = workspaceKey(activeNavigation);
  const contentLabel = moduleLabel(activeNavigation);
  const packetAnalyzerInMainWorkspace = activeTab === "Packets" || activeTab === "Channels";
  const nodePanelInMainWorkspace = activeTab === "Live" || activeTab === "Map" || activeTab === "Nodes";

  return (
    <RegionProvider defaultSelection={initialSelection}>
      <RegionWatcher wsManager={wsManager} />
      <RegionUrlSync />
      <SelectionResetOnRegion onRegionChange={clearSelection} />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager} onOpenSearch={() => setSearchOpen(true)}>
        <div className="relative flex flex-1 min-h-0 min-w-0">
          <div key={contentKey} className="flex flex-1 min-h-0 min-w-0 fade-in">
            <Suspense fallback={<TerminalLoadingState label={`LOADING ${contentLabel}`} detail="MODULE TRANSFER IN PROGRESS" />}>
              {tabContent[activeTab]}
            </Suspense>
          </div>
          {analyzerHash && packetAnalyzerInMainWorkspace && (
            <Suspense fallback={null}>
              <PacketAnalyzerDrawer
                detail={analyzerDetail}
                loading={analyzerLoading}
                selectedObservationId={selectedObservationId}
                onSelectObservation={setSelectedObservationId}
                onClose={() => handleAnalyze(null)}
                onViewNode={setOverlayNodeId}
              />
            </Suspense>
          )}
          {nodePanelInMainWorkspace && selectedNodeId && (
            <Suspense fallback={null}>
              <NodeDetailPanel
                nodeId={selectedNodeId}
                onClose={() => handleSelectNode(null)}
                onViewObserver={(observerId) => {
                  handleTabChange("Observers");
                  handleSelectObserver(observerId);
                }}
                onViewNode={(id) => handleSelectNode(id)}
                onAnalyzePacket={setOverlayPacketHash}
              />
            </Suspense>
          )}
          {overlayNodeId && (
            <Suspense fallback={null}>
              <NodeDetailOverlay
                nodeId={overlayNodeId}
                onClose={() => setOverlayNodeId(null)}
                onViewObserver={(observerId) => {
                  handleTabChange("Observers");
                  setSelectedObserverId(observerId);
                }}
                onViewNode={setOverlayNodeId}
              />
            </Suspense>
          )}
          {overlayPacketHash && (
            <Suspense fallback={null}>
              <PacketAnalyzerOverlay
                detail={overlayPacketDetail}
                loading={overlayPacketLoading}
                onClose={() => setOverlayPacketHash(null)}
                onViewObserver={(observerId) => {
                  handleTabChange("Observers");
                  setSelectedObserverId(observerId);
                }}
              />
            </Suspense>
          )}
          <GlobalSearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={navigateToSearchResult} />
        </div>
      </AppShell>
    </RegionProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SplashScreen />
          <AppInner />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
