import { useCallback, useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { useMapNodes } from "./useMapNodes";
import { useMapNodesData } from "./useMapNodesData";
import { useCoalescedNodeUpdates } from "./useNodeUpdates";
import { nodesToFeatureCollection, filterByNodeType } from "./node-geojson";
import { MapSettingsPanel } from "./MapSettingsPanel";
import {
  routePathPoints,
  routeReplayHops,
  useRouteReplayOverlay,
  useVerifiedRouteNeighborhoodOverlay,
  type RouteReplayHop,
} from "./useRouteOverlays";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle } from "./types";
import {
  mapVisualProfileStyle,
  persistMapAppearanceSettings,
  readMapAppearanceSettings,
  resolveMapVisualProfile,
  type MapAppearanceSettings,
} from "./appearance";
import { EmptyState } from "../../components/EmptyState";
import { LoadingPill } from "../../components/LoadingPill";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { getIatas, getKnownRoute } from "../../api/client";
import { formatHex } from "../../lib/formatters";
import type { WsManager } from "../../api/ws-manager";
import type { KnownRoute } from "../../types/api";
import type { WsNodeUpdate } from "../../types/ws";

interface MapViewProps {
  wsManager: WsManager;
  // shared with the Nodes tab (lifted to AppInner) so the open NodeDetailPanel stays live
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

const MAP_TOPOGRAPHY_STORAGE_KEY = "beacon-map-topography";

interface ScreenRouteHop extends RouteReplayHop {
  x: number;
  y: number;
}

function RouteReplayMapOverlay({
  mapRef,
  isReady,
  route,
  active,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  isReady: boolean;
  route?: KnownRoute;
  active: boolean;
}) {
  const [screenHops, setScreenHops] = useState<ScreenRouteHop[]>([]);
  const routeKey = route ? `${route.id}:${route.lastSeen}:${route.hops.length}` : "";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !active || !route) {
      setScreenHops([]);
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const projected = routeReplayHops(route)
        .filter((hop) => hop.coordinates)
        .map((hop) => {
          const point = map.project(hop.coordinates!);
          return { ...hop, x: point.x, y: point.y };
        });
      setScreenHops(projected);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    for (const event of ["move", "zoom", "rotate", "pitch", "resize"] as const) {
      map.on(event, schedule);
    }
    map.on("moveend", update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      for (const event of ["move", "zoom", "rotate", "pitch", "resize"] as const) {
        map.off(event, schedule);
      }
      map.off("moveend", update);
    };
  }, [active, isReady, mapRef, route, routeKey]);

  if (!active || screenHops.length === 0) return null;

  const points = screenHops.map((hop) => `${hop.x.toFixed(1)},${hop.y.toFixed(1)}`).join(" ");
  const hasLine = screenHops.length >= 2;

  return (
    <svg className="route-replay-screen-overlay pointer-events-none absolute inset-0 z-[8] h-full w-full" aria-hidden>
      {hasLine && (
        <>
          <polyline
            className="route-replay-screen-glow"
            points={points}
            fill="none"
            stroke="var(--map-route-primary, #ffb000)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="route-replay-screen-line"
            points={points}
            fill="none"
            stroke="var(--map-route-primary, #ffb000)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {screenHops.map((hop) => {
        const color =
          hop.role === "tx"
            ? "var(--map-route-green, #42ff7c)"
            : hop.role === "rx"
              ? "var(--map-route-primary, #ffb000)"
              : "var(--map-route-secondary, #42bfff)";
        return (
          <g key={`${hop.index}:${hop.nodeId}`} transform={`translate(${hop.x.toFixed(1)} ${hop.y.toFixed(1)})`}>
            <circle r="14" fill="var(--map-route-primary, #ffb000)" opacity="0.18" className="route-replay-screen-hop-glow" />
            <circle r="6.5" fill={color} stroke="var(--map-node-backplate, rgba(0,0,0,0.9))" strokeWidth="2" />
            <text
              y="22"
              textAnchor="middle"
              className="route-replay-screen-label"
              fill="var(--map-node-label, #fff4cf)"
              stroke="var(--map-node-label-halo, rgba(0,0,0,0.9))"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {hop.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RouteReplayCard({
  route,
  isLoading,
  isError,
  onClose,
}: {
  route?: KnownRoute;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  const hops = routeReplayHops(route);
  const mappedHopCount = hops.filter((hop) => hop.hasCoordinates).length;
  const canDraw = mappedHopCount >= 2;

  return (
    <div className="crt-float-panel absolute right-3 top-3 z-20 max-h-[min(520px,calc(100vh-1.5rem))] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-sm border border-border bg-bg-raised px-3 py-2 font-mono">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-text-dim">Route Replay</div>
          <div className="truncate text-xs font-semibold text-text-bright">
            {isLoading ? "Loading route" : route ? `${route.iata} / TX to RX / ${route.hopCount} hops` : "Route unavailable"}
          </div>
        </div>
        <button
          type="button"
          className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase text-text-muted transition-colors hover:border-primary/50 hover:text-text-bright"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {isError && <div className="mt-2 text-[10px] uppercase tracking-wider text-danger">Route lookup failed</div>}

      {route && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] uppercase tracking-wide">
            <div className="rounded-sm border border-border-subtle bg-bg-base/45 px-2 py-1">
              <div className="text-text-dim">Obs</div>
              <div className="text-text-bright">{route.observationCount.toLocaleString()}</div>
            </div>
            <div className="rounded-sm border border-border-subtle bg-bg-base/45 px-2 py-1">
              <div className="text-text-dim">Mapped</div>
              <div className={canDraw ? "text-green" : "text-warn"}>{mappedHopCount}/{hops.length}</div>
            </div>
            <div className="rounded-sm border border-border-subtle bg-bg-base/45 px-2 py-1">
              <div className="text-text-dim">Path</div>
              <div className={canDraw ? "text-primary" : "text-warn"}>{canDraw ? "Visible" : "No line"}</div>
            </div>
          </div>

          {!canDraw && (
            <div className="mt-2 rounded-sm border border-warn/35 bg-warn/10 px-2 py-1.5 text-[10px] leading-snug text-warn">
              This route has fewer than two mapped hop coordinates, so Beacon can list the route but cannot draw the TX-to-RX line yet.
            </div>
          )}

          <div className="mt-2 space-y-1">
            {hops.map((hop) => (
              <div key={`${hop.index}:${hop.nodeId}`} className="grid grid-cols-[2.3rem_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-border-subtle bg-bg-base/35 px-2 py-1 text-[10px]">
                <span className={hop.role === "tx" ? "text-green" : hop.role === "rx" ? "text-primary" : "text-secondary"}>{hop.label}</span>
                <div className="min-w-0">
                  <div className="truncate text-text-bright" title={hop.nodeLabel}>{hop.nodeLabel}</div>
                  <div className="truncate text-text-dim">{hop.hash ? formatHex(hop.hash) : formatHex(hop.nodeId)}</div>
                </div>
                <span className={hop.hasCoordinates ? "text-green" : "text-warn"}>{hop.hasCoordinates ? "MAP" : "NO COORD"}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 text-[10px] text-text-dim">Click map to dismiss replay and stay on Map.</div>
        </>
      )}
    </div>
  );
}

export function MapView({ wsManager, selectedNodeId, onSelectNode }: MapViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  // restore the saved style; resolveMapStyle falls back to the default if the stored id is stale
  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
  const [topographyEnabled, setTopographyEnabled] = useState(
    () => localStorage.getItem(MAP_TOPOGRAPHY_STORAGE_KEY) !== "false",
  );

  const handleStyleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  }, []);

  // A basemap that fails to load (offline / 5xx) reverts the selection to the last style that loaded,
  // so the switcher matches the still-rendered map and the failed choice isn't persisted.
  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);
  const handleTopographyChange = useCallback((enabled: boolean) => {
    setTopographyEnabled(enabled);
    localStorage.setItem(MAP_TOPOGRAPHY_STORAGE_KEY, String(enabled));
  }, []);

  const [typeFilter, setTypeFilter] = useState(""); // "" = All
  const [clustered, setClustered] = useState(true);
  const routeIdParam = searchParams.get("routeId");
  const routeId = routeIdParam && /^\d+$/.test(routeIdParam) ? Number(routeIdParam) : null;
  const routeReplayActive = routeId != null && searchParams.get("routeReplay") === "1";

  const { iatas: selectedIatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  // marker/cluster icons are canvas-drawn from the active --palette-* vars, so useMapNodes has to
  // re-register them whenever the palette changes: on a theme switch, and once on load when the async
  // themes populate (from [] -> filled).
  const { themeId, themes, paletteRev } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const [appearanceSettings, setAppearanceSettings] = useState(readMapAppearanceSettings);
  const visualProfile = useMemo(
    () => resolveMapVisualProfile(styleId, appearanceSettings),
    [appearanceSettings, styleId],
  );
  const visualProfileStyle = useMemo(() => mapVisualProfileStyle(visualProfile) as CSSProperties, [visualProfile]);
  const profileKey = `${themeKey}:${paletteRev}:${visualProfile.key}`;
  const handleAppearanceChange = useCallback((patch: Partial<MapAppearanceSettings>) => {
    setAppearanceSettings((current) => {
      const next = { ...current, ...patch };
      persistMapAppearanceSettings(next);
      return next;
    });
  }, []);
  const { data: iatas } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });
  const selectedRoute = useQuery({
    queryKey: ["route", routeId],
    queryFn: () => getKnownRoute(routeId!),
    enabled: routeId != null,
    staleTime: 60_000,
  });

  // Nodes for the selected region, keyed independently from the Nodes-table filters/page cap.
  // The pager auto-chains until the full regional set is present; nodesKey matches the hook's key.
  const nodesKey = useMemo(() => ["map-nodes", regionKey], [regionKey]);
  const { nodes, loadedCount, isPaging, isError: nodesError } = useMapNodesData(selectedIatas, regionKey);

  // patch-or-insert the live update into the paged node cache (the shared helper preserves refs
  // when nothing changed, so a same-values re-advert doesn't trigger a full map repaint); brand-new
  // nodes are appended from the event itself since the cache never refetches on its own. Cache writes
  // are coalesced per frame so an advert flood produces one map rebuild instead of one per message.
  const onNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      // mirror NodeTable: refresh the shared detail panel when the open node changes live
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, selectedNodeId],
  );
  useWsNodeUpdateHandler(wsManager, useCoalescedNodeUpdates(nodesKey, onNodeUpdate));

  // split memos: rebuild the FeatureCollection only when nodes change; a type-filter change just
  // re-filters the already-built collection instead of re-running the full transform over all nodes
  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  // IATA coords to frame: the selection's airports, or every airport for "All". Regions carry no
  // bounds from the API, so their member IATAs stand in for the extent. See CLAUDE.md (map framing).
  const regionFitPoints = useMemo<[number, number][] | null>(() => {
    const withCoords = (iatas ?? []).filter((i) => i.lat != null && i.lon != null);
    if (withCoords.length === 0) return null;
    const scope = selectedIatas && selectedIatas.length > 0 ? new Set(selectedIatas) : null;
    const chosen = scope ? withCoords.filter((i) => scope.has(i.iata)) : withCoords;
    return chosen.length > 0 ? chosen.map((i) => [i.lon!, i.lat!]) : null;
  }, [iatas, selectedIatas]);
  const routeFitPoints = useMemo(() => routePathPoints(selectedRoute.data), [selectedRoute.data]);
  const fitPoints = routeReplayActive && routeFitPoints.length >= 2 ? routeFitPoints : regionFitPoints;

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, fitPoints, handleStyleError, {
    topographyEnabled,
    topographyAlwaysVisible: true,
    topographyForce3d: true,
    visualProfile,
  });
  const isDark = resolveMapStyle(styleId).dark; // drives marker theming + maplibre control chrome

  useMapNodes(mapRef, isReady, geojson, isDark, profileKey, clustered, onSelectNode, selectedNodeId, `${regionKey}:${typeFilter}`);
  useVerifiedRouteNeighborhoodOverlay(mapRef, isReady, selectedNodeId, selectedIatas, profileKey);

  const closeRouteReplay = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "Map");
      next.delete("routeId");
      next.delete("routeReplay");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useRouteReplayOverlay(mapRef, isReady, selectedRoute.data, routeReplayActive, profileKey, closeRouteReplay);

  return (
    <div
      className="map-profile-scope relative flex flex-1 min-h-0"
      data-map-profile={visualProfile.id}
      data-map-contrast={visualProfile.effectiveContrast}
      data-map-tint={visualProfile.effectiveTint}
      style={visualProfileStyle}
    >
      {/* Fill via flex-1, NOT absolute inset-0: maplibre adds .maplibregl-map { position: relative }
          to this element, which overrides Tailwind's `absolute` and would collapse inset-0 to 0
          height. data-dark drives the maplibre control theming in index.css. */}
      <div ref={containerRef} data-dark={isDark} className="flex-1" />
      <RouteReplayMapOverlay mapRef={mapRef} isReady={isReady} route={selectedRoute.data} active={routeReplayActive} />
      <MapSettingsPanel
        styleId={styleId}
        onStyleChange={handleStyleChange}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        clustered={clustered}
        onClusteredChange={setClustered}
        topographyEnabled={topographyEnabled}
        onTopographyChange={handleTopographyChange}
        appearanceSettings={appearanceSettings}
        onAppearanceChange={handleAppearanceChange}
      />
      {routeReplayActive && (
        <RouteReplayCard
          route={selectedRoute.data}
          isLoading={selectedRoute.isLoading}
          isError={selectedRoute.isError}
          onClose={closeRouteReplay}
        />
      )}
      {/* The count climbs as the full regional node set lands, then the pill disappears. */}
      <LoadingPill loading={isPaging} error={nodesError} count={loadedCount} noun="nodes" />
      {error && (
        // z-20 so the failure overlay covers the settings card (z-10) instead of it floating on top
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
