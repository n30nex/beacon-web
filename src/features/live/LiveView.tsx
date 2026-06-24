import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import "../map/map.css";
import { useMapLibre } from "../map/useMapLibre";
import { useMapNodes } from "../map/useMapNodes";
import { useMapNodesData } from "../map/useMapNodesData";
import { useVerifiedRouteNeighborhoodOverlay } from "../map/useRouteOverlays";
import { nodesToFeatureCollection, filterByNodeType } from "../map/node-geojson";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle } from "../map/types";
import {
  mapVisualProfileStyle,
  persistMapAppearanceSettings,
  readMapAppearanceSettings,
  resolveMapVisualProfile,
  type MapAppearanceSettings,
} from "../map/appearance";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsLaggedHandler, useWsNodeUpdateHandler, useWsPacketHandler } from "../../hooks/useWsHandlers";
import { getIatas, getLiveBackfill, getLiveSummary } from "../../api/client";
import { useCoalescedNodeUpdates } from "../map/useNodeUpdates";
import type { WsManager } from "../../api/ws-manager";
import type { WsLagged, WsPacketObservation } from "../../types/ws";
import {
  LIVE_FEED_CAP,
  countRecent,
  mergeLiveEventsByObservation,
  toLivePacketEvent,
  type LivePacketEvent,
} from "./live-model";
import {
  VISUAL_DRAIN_INTERVAL_MS,
  type LiveAnimation,
  type LiveAnimationRequest,
  type LiveHeatPoint,
  type LivePulse,
  type LiveRainDrop,
  type LiveTrail,
  type LiveVisualQuality,
  type PropagationGroup,
} from "./live-visuals";
import { fetchAndAcceptLiveBackfill, liveBackfillSeedKey } from "./live-backfill";
import {
  acceptLiveEventForIngest,
  clearPendingLiveStateFlush,
  flushPendingLiveState,
  resetLiveEventIngestState,
  schedulePendingLiveStateFlush,
} from "./live-event-ingest";
import {
  drainLiveAnimationQueue,
  enqueueLiveAnimation,
  flushLivePropagationGroup,
  scheduleLiveAnimation,
  shouldAnimateLiveEvent,
} from "./live-visual-queue";
import { buildIataCoordMap, buildNodeCoordMaps, playLivePacketAnimation } from "./live-map-animation";
import { LiveControlDock } from "./LiveControls";
import { LiveInspectorRail, LiveMobileConsoleSheet, LiveMobileSettingsSheet } from "./LiveInspectorPanels";
import { useLiveAnimationCanvas } from "./useLiveAnimationCanvas";
import { LiveMapSurface } from "./LiveMapSurface";
import { useLiveAudio } from "./useLiveAudio";
import { useLivePanelLayout } from "./useLivePanelLayout";
import { useWsSubscriptionReady } from "./useWsSubscriptionReady";

interface LiveViewProps {
  wsManager: WsManager;
  onAnalyze: (hash: string) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  nodePanelOpen?: boolean;
}

export function LiveView({ wsManager, onAnalyze, selectedNodeId, onSelectNode, nodePanelOpen }: LiveViewProps) {
  const { iatas: selectedIatas, regionKey } = useRegion();
  const socketSubscribed = useWsSubscriptionReady(wsManager);
  const { themeId, themes, paletteRev } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationsRef = useRef<LiveAnimation[]>([]);
  const trailsRef = useRef<LiveTrail[]>([]);
  const pulsesRef = useRef<LivePulse[]>([]);
  const rainRef = useRef<LiveRainDrop[]>([]);
  const heatRef = useRef<LiveHeatPoint[]>([]);
  const requestCanvasFrameRef = useRef<(() => void) | null>(null);
  const liveStateFlushTimerRef = useRef(0);
  const pendingEventsRef = useRef<LivePacketEvent[]>([]);
  const pendingQueuedEventsRef = useRef<LivePacketEvent[]>([]);
  const pendingTotalPacketsRef = useRef(0);
  const pendingVisualDroppedRef = useRef(0);
  const visualQueueRef = useRef<LiveAnimationRequest[]>([]);
  const visualPressureRef = useRef(0);
  const lastVisualByPacketRef = useRef(new Map<string, number>());
  const publishedVisualQueueSizeRef = useRef(0);
  const publishedVisualQualityRef = useRef<LiveVisualQuality>("high");
  const propagationGroupsRef = useRef(new Map<string, PropagationGroup>());
  const sequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const lastObservationIdRef = useRef(0);
  const backfillInFlightRef = useRef(false);
  const seededLiveCursorRef = useRef("");
  const seenObservationIdsRef = useRef(new Set<number>());
  const seenObservationOrderRef = useRef<number[]>([]);

  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [appearanceSettings, setAppearanceSettings] = useState(readMapAppearanceSettings);
  const visualProfile = useMemo(
    () => resolveMapVisualProfile(styleId, appearanceSettings),
    [appearanceSettings, styleId],
  );
  const visualProfileStyle = useMemo(() => mapVisualProfileStyle(visualProfile) as CSSProperties, [visualProfile]);
  const profileKey = `${themeKey}:${paletteRev}:${visualProfile.key}`;
  const [typeFilter, setTypeFilter] = useState("");
  const [clustered, setClustered] = useState(false);
  const [events, setEvents] = useState<LivePacketEvent[]>([]);
  const [queuedEvents, setQueuedEvents] = useState<LivePacketEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [trails, setTrails] = useState(true);
  const [realisticPropagation, setRealisticPropagation] = useState(true);
  const [heatVisible, setHeatVisible] = useState(false);
  const [colorByHash, setColorByHash] = useState(true);
  const [matrixMode, setMatrixMode] = useState(false);
  const [matrixRain, setMatrixRain] = useState(false);
  const { audioBpm, audioEnabled, audioVolume, playPacketAudio, setAudioBpm, setAudioEnabled, setAudioVolume } = useLiveAudio();
  const [totalPackets, setTotalPackets] = useState(0);
  const [laggedCount, setLaggedCount] = useState(0);
  const [visualQueueSize, setVisualQueueSize] = useState(0);
  const [visualDroppedCount, setVisualDroppedCount] = useState(0);
  const [activeAnimations, setActiveAnimations] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<LivePacketEvent | null>(null);
  const [backfillStatus, setBackfillStatus] = useState("ok");
  const [backfillCount, setBackfillCount] = useState(0);
  const [visualQuality, setVisualQuality] = useState<LiveVisualQuality>("high");
  const [now, setNow] = useState(() => Date.now());
  const [packetWaitStartedAt, setPacketWaitStartedAt] = useState(() => Date.now());
  const {
    commandDockStyle,
    compactLiveLayout,
    desktopRailOpen,
    feedVisible,
    inspectorRailStyle,
    mobileConsoleOpen,
    setMobileConsoleOpen,
    setSettingsOpen,
    settingsOpen,
    toggleConsole,
    toggleSettings,
  } = useLivePanelLayout();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const flushLiveState = useCallback(() => {
    flushPendingLiveState({
      refs: {
        liveStateFlushTimerRef,
        pendingEventsRef,
        pendingQueuedEventsRef,
        pendingTotalPacketsRef,
        pendingVisualDroppedRef,
      },
      setEvents,
      setQueuedEvents,
      setTotalPackets,
      setVisualDroppedCount,
    });
  }, []);

  const scheduleLiveStateFlush = useCallback(() => {
    schedulePendingLiveStateFlush({ flushLiveState, liveStateFlushTimerRef });
  }, [flushLiveState]);

  useEffect(() => {
    return () => {
      clearPendingLiveStateFlush(liveStateFlushTimerRef);
    };
  }, []);

  useEffect(() => {
    const propagationGroups = propagationGroupsRef.current;
    return () => {
      for (const group of propagationGroups.values()) {
        clearTimeout(group.timer);
      }
      propagationGroups.clear();
    };
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, 2_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      resetLiveEventIngestState({
        lastObservationIdRef,
        seededLiveCursorRef,
        seenObservationIdsRef,
        seenObservationOrderRef,
        setBackfillCount,
        setBackfillStatus,
        setEvents,
        setLaggedCount,
        setPacketWaitStartedAt,
        setQueuedEvents,
        setSelectedEvent,
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [regionKey]);

  const handleStyleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  }, []);

  const handleAppearanceChange = useCallback((patch: Partial<MapAppearanceSettings>) => {
    setAppearanceSettings((current) => {
      const next = { ...current, ...patch };
      persistMapAppearanceSettings(next);
      return next;
    });
  }, []);

  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);

  const reloadLiveMap = useCallback(() => {
    setMapReloadToken((token) => token + 1);
  }, []);

  const { data: iataCodes } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });
  const { data: liveSummary } = useQuery({
    queryKey: ["live-summary", regionKey],
    queryFn: () => getLiveSummary(selectedIatas),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
  const nodesKey = useMemo(() => ["map-nodes", regionKey], [regionKey]);
  const { nodes, loadedCount, isPaging, isError: nodesError, updatedAt: nodesUpdatedAt } = useMapNodesData(selectedIatas, regionKey, { auto: socketSubscribed });
  const { byKey: nodeCoords, byPathPrefix } = useMemo(() => buildNodeCoordMaps(nodes), [nodes]);
  const iataCoords = useMemo(() => buildIataCoordMap(iataCodes), [iataCodes]);

  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, null, handleStyleError, {
    resetKey: mapReloadToken,
    visualProfile,
  });
  const isDark = resolveMapStyle(styleId).dark;

  useMapNodes(mapRef, isReady, geojson, isDark, profileKey, clustered, onSelectNode, selectedNodeId, `${regionKey}:${typeFilter}`);
  useVerifiedRouteNeighborhoodOverlay(mapRef, isReady, selectedNodeId, selectedIatas, profileKey);

  const playAnimation = useCallback(
    (event: LivePacketEvent, waveIndex = 0, waveCount = 1) => {
      return playLivePacketAnimation({
        animationsRef,
        byPathPrefix,
        colorByHash,
        event,
        heatRef,
        iataCoords,
        map: mapRef.current,
        matrixMode,
        matrixRain,
        nodeCoords,
        playPacketAudio,
        pulsesRef,
        rainRef,
        requestCanvasFrame: requestCanvasFrameRef.current,
        visualPressureRef,
        visualQueueRef,
        waveCount,
        waveIndex,
      });
    },
    [byPathPrefix, colorByHash, iataCoords, mapRef, matrixMode, matrixRain, nodeCoords, playPacketAudio],
  );

  const queueAnimation = useCallback(
    (request: LiveAnimationRequest) => {
      enqueueLiveAnimation({
        pendingVisualDroppedRef,
        request,
        scheduleLiveStateFlush,
        visualPressureRef,
        visualQueueRef,
      });
    },
    [scheduleLiveStateFlush],
  );

  useEffect(() => {
    const id = setInterval(() => {
      drainLiveAnimationQueue({
        animationsRef,
        pendingVisualDroppedRef,
        playAnimation,
        publishedVisualQualityRef,
        publishedVisualQueueSizeRef,
        scheduleLiveStateFlush,
        setVisualQuality,
        setVisualQueueSize,
        visualPressureRef,
        visualQueueRef,
      });
    }, VISUAL_DRAIN_INTERVAL_MS);

    return () => clearInterval(id);
  }, [playAnimation, scheduleLiveStateFlush]);

  const flushPropagationGroup = useCallback(
    (packetHash: string) => {
      flushLivePropagationGroup({
        packetHash,
        pendingVisualDroppedRef,
        propagationGroupsRef,
        queueAnimation,
        scheduleLiveStateFlush,
        visualPressureRef,
      });
    },
    [queueAnimation, scheduleLiveStateFlush],
  );

  const scheduleAnimation = useCallback(
    (event: LivePacketEvent) => {
      scheduleLiveAnimation({
        event,
        flushPropagationGroup,
        pendingVisualDroppedRef,
        propagationGroupsRef,
        queueAnimation,
        realisticPropagation,
        scheduleLiveStateFlush,
        visualPressureRef,
      });
    },
    [flushPropagationGroup, queueAnimation, realisticPropagation, scheduleLiveStateFlush],
  );

  useEffect(() => {
    if (realisticPropagation) return;
    for (const hash of Array.from(propagationGroupsRef.current.keys())) {
      flushPropagationGroup(hash);
    }
  }, [flushPropagationGroup, realisticPropagation]);

  useLiveAnimationCanvas(
    mapRef,
    canvasRef,
    requestCanvasFrameRef,
    isReady,
    animationsRef,
    trailsRef,
    pulsesRef,
    rainRef,
    heatRef,
    trails,
    matrixRain,
    heatVisible,
    matrixMode,
    visualPressureRef,
    setActiveAnimations,
    profileKey,
  );

  const shouldAnimateEvent = useCallback((event: LivePacketEvent) => {
    return shouldAnimateLiveEvent(lastVisualByPacketRef.current, event);
  }, []);

  const acceptLiveEvent = useCallback(
    (event: LivePacketEvent, options: { animate?: boolean } = {}) => {
      return acceptLiveEventForIngest({
        animate: options.animate,
        event,
        refs: {
          lastObservationIdRef,
          liveStateFlushTimerRef,
          pausedRef,
          pendingEventsRef,
          pendingQueuedEventsRef,
          pendingTotalPacketsRef,
          pendingVisualDroppedRef,
          seenObservationIdsRef,
          seenObservationOrderRef,
        },
        scheduleAnimation,
        scheduleLiveStateFlush,
        shouldAnimateEvent,
      });
    },
    [scheduleAnimation, scheduleLiveStateFlush, shouldAnimateEvent],
  );

  const fetchLiveBackfill = useCallback(
    async (afterObservationId: number, options: { seed?: boolean; limit?: number } = {}) => {
      await fetchAndAcceptLiveBackfill({
        acceptLiveEvent,
        afterObservationId,
        backfillInFlightRef,
        fetchBackfill: getLiveBackfill,
        flushLiveState,
        iatas: selectedIatas,
        limit: options.limit,
        seed: options.seed,
        sequenceRef,
        setBackfillCount,
        setBackfillStatus,
        setPacketWaitStartedAt,
        visualPressureRef,
      });
    },
    [acceptLiveEvent, flushLiveState, selectedIatas],
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const event = toLivePacketEvent(data, ++sequenceRef.current);
      acceptLiveEvent(event);
    },
    [acceptLiveEvent],
  );

  useEffect(() => {
    const latestObservationId = liveSummary?.latestObservationId ?? 0;
    if (!isReady || latestObservationId <= 0 || events.length > 0) return;
    const seedKey = liveBackfillSeedKey(regionKey, latestObservationId);
    if (seededLiveCursorRef.current === seedKey) return;
    seededLiveCursorRef.current = seedKey;
    void fetchLiveBackfill(0, { seed: true });
  }, [events.length, fetchLiveBackfill, isReady, liveSummary?.latestObservationId, regionKey]);

  const handleLagged = useCallback(
    (data: WsLagged) => {
      setLaggedCount((count) => count + data.droppedCount);
      const cursor = lastObservationIdRef.current;
      if (cursor > 0) void fetchLiveBackfill(cursor);
    },
    [fetchLiveBackfill],
  );

  useWsPacketHandler(wsManager, handlePacketObservation);
  useWsLaggedHandler(wsManager, handleLagged);
  useWsNodeUpdateHandler(wsManager, useCoalescedNodeUpdates(nodesKey));

  const resumeLive = useCallback(() => {
    flushLiveState();
    setPaused(false);
    setQueuedEvents((queued) => {
      for (const event of queued.slice().reverse()) scheduleAnimation(event);
      setEvents((current) => mergeLiveEventsByObservation(current, queued, LIVE_FEED_CAP));
      return [];
    });
  }, [flushLiveState, scheduleAnimation]);

  const togglePaused = useCallback(() => {
    if (pausedRef.current) resumeLive();
    else setPaused(true);
  }, [resumeLive]);
  const toggleColorByHash = useCallback(() => setColorByHash((v) => !v), []);
  const toggleHeat = useCallback(() => setHeatVisible((v) => !v), []);
  const togglePropagation = useCallback(() => setRealisticPropagation((v) => !v), []);
  const toggleTrails = useCallback(() => setTrails((v) => !v), []);

  const feedClock = Math.floor(now / 5_000);
  const ratePerMin = useMemo(() => countRecent(events, now, 60_000), [events, now]);

  return (
    <LiveMapSurface
      activeAnimations={activeAnimations}
      audioEnabled={audioEnabled}
      canvasRef={canvasRef}
      colorByHash={colorByHash}
      containerRef={containerRef}
      heatVisible={heatVisible}
      isDark={isDark}
      isPaging={isPaging}
      loadedCount={loadedCount}
      mapError={Boolean(error)}
      matrixMode={matrixMode}
      matrixRain={matrixRain}
      nodesError={nodesError}
      nodesUpdatedAt={nodesUpdatedAt}
      onReloadMap={reloadLiveMap}
      paused={paused}
      ratePerMin={ratePerMin}
      realisticPropagation={realisticPropagation}
      regionKey={regionKey}
      totalPackets={totalPackets}
      visualProfile={visualProfile}
      visualProfileStyle={visualProfileStyle}
    >
      {!nodePanelOpen && !compactLiveLayout && (desktopRailOpen || settingsOpen) && (
        <LiveInspectorRail
          activeAnimations={activeAnimations}
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          backfillCount={backfillCount}
          backfillStatus={backfillStatus}
          clockTick={feedClock}
          clustered={clustered}
          compact={compactLiveLayout}
          events={events}
          feedVisible={feedVisible}
          laggedCount={laggedCount}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          now={now}
          onAnalyze={onAnalyze}
          onAudioBpmChange={setAudioBpm}
          onAppearanceChange={handleAppearanceChange}
          onAudioVolumeChange={setAudioVolume}
          onClusteredChange={setClustered}
          onSelect={setSelectedEvent}
          onStyleChange={handleStyleChange}
          onToggleAudio={() => setAudioEnabled((value) => !value)}
          onToggleMatrix={() => setMatrixMode((v) => !v)}
          onToggleRain={() => setMatrixRain((v) => !v)}
          onTypeChange={setTypeFilter}
          quality={visualQuality}
          ratePerMin={ratePerMin}
          selectedEvent={selectedEvent ?? undefined}
          settingsOpen={settingsOpen}
          styleId={styleId}
          style={inspectorRailStyle}
          summary={liveSummary}
          totalPackets={totalPackets}
          typeFilter={typeFilter}
          visualDroppedCount={visualDroppedCount}
          waitStartedAt={packetWaitStartedAt}
        />
      )}
      <LiveControlDock
        activeAnimations={activeAnimations}
        colorByHash={colorByHash}
        compact={compactLiveLayout}
        consoleOpen={compactLiveLayout ? mobileConsoleOpen : desktopRailOpen}
        heatVisible={heatVisible}
        laggedCount={laggedCount}
        onToggleColorByHash={toggleColorByHash}
        onToggleConsole={toggleConsole}
        onToggleHeat={toggleHeat}
        onTogglePaused={togglePaused}
        onTogglePropagation={togglePropagation}
        onToggleSettings={toggleSettings}
        onToggleTrails={toggleTrails}
        paused={paused}
        quality={visualQuality}
        queuedCount={queuedEvents.length}
        ratePerMin={ratePerMin}
        realisticPropagation={realisticPropagation}
        settingsOpen={settingsOpen}
        style={commandDockStyle}
        totalPackets={totalPackets}
        trails={trails}
        visualDroppedCount={visualDroppedCount}
        visualQueueSize={visualQueueSize}
      />

      {compactLiveLayout && settingsOpen && (
        <LiveMobileSettingsSheet
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={handleAppearanceChange}
          onAudioBpmChange={setAudioBpm}
          onAudioVolumeChange={setAudioVolume}
          onClose={() => setSettingsOpen(false)}
          onClusteredChange={setClustered}
          onStyleChange={handleStyleChange}
          onToggleAudio={() => setAudioEnabled((value) => !value)}
          onToggleMatrix={() => setMatrixMode((v) => !v)}
          onToggleRain={() => setMatrixRain((v) => !v)}
          onTypeChange={setTypeFilter}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      )}

      {compactLiveLayout && mobileConsoleOpen && (
        <LiveMobileConsoleSheet
          activeAnimations={activeAnimations}
          backfillStatus={backfillStatus}
          clockTick={feedClock}
          events={events}
          laggedCount={laggedCount}
          now={now}
          onAnalyze={onAnalyze}
          onClose={() => setMobileConsoleOpen(false)}
          onSelect={setSelectedEvent}
          ratePerMin={ratePerMin}
          selectedEvent={selectedEvent ?? undefined}
          summary={liveSummary}
          totalPackets={totalPackets}
          waitStartedAt={packetWaitStartedAt}
        />
      )}

    </LiveMapSurface>
  );
}
