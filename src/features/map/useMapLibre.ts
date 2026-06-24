import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl";
import {
  DEM_TILES,
  DEM_ATTRIBUTION,
  TERRAIN_EXAGGERATION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  MAP_TOPOGRAPHY_BEARING,
  MAP_TOPOGRAPHY_PITCH,
  MAX_PITCH,
  IATA_ZOOM,
  IATA_PITCH,
  resolveMapStyle,
} from "./types";
import type { MapVisualProfile } from "./appearance";

// serialized fit target, so the fit effect can skip redundant re-fits
const fitKey = (points: [number, number][] | null) =>
  points && points.length ? points.map((p) => `${p[0]},${p[1]}`).join(";") : null;

// Keeps the imperative MapLibre lifecycle out of MapView; exposes mapRef + isReady for overlays.

const TERRAIN_SOURCE_ID = "terrain-dem";
const HILLSHADE_SOURCE_ID = "hillshade-dem";
const HILLSHADE_LAYER_ID = "hillshade";

// Terrain only adds depth once the camera is tilted or zoomed in enough to read relief; a flat world
// overview (the default landing view) gains nothing from the draped-terrain render path or the
// hillshade layer but pays their pan/zoom cost. Engage at/above this pitch or zoom, disengage below.
const TERRAIN_ENGAGE_PITCH = 10;
const TERRAIN_ENGAGE_ZOOM = IATA_ZOOM;

const demSource = (): RasterDEMSourceSpecification => ({
  type: "raster-dem",
  tiles: DEM_TILES,
  encoding: "terrarium",
  tileSize: 256, // terrarium tiles are 256px, not the raster-dem default of 512
  maxzoom: 15,
  attribution: DEM_ATTRIBUTION,
});

// Declare DEM sources lazily. MapLibre warns when one raster-dem source backs both hillshade and 3D
// terrain, so each render path gets its own source and only loads when that path is enabled.
function ensureDemSource(map: MapLibreMap, sourceId: string) {
  if (!map.getSource(sourceId)) map.addSource(sourceId, demSource());
}

// Engage/disengage the 3D draped terrain + hillshade relief from the live camera. Idempotent and
// cheap: it only mutates when crossing the engage threshold (guarded by getTerrain/getLayer), so it
// is safe to call on every moveend and after each style reload. When engaged the result is identical
// to before; when disengaged the flat view skips the terrain render path entirely.
interface UseMapLibreOptions {
  topographyEnabled?: boolean;
  topographyAlwaysVisible?: boolean;
  topographyForce3d?: boolean;
  resetKey?: string | number;
  visualProfile?: MapVisualProfile;
}

function applyTerrainState(
  map: MapLibreMap,
  isDark: boolean,
  enabled: boolean,
  alwaysShowHillshade: boolean,
  force3d: boolean,
  visualProfile: MapVisualProfile | undefined,
) {
  if (!map.isStyleLoaded()) return;
  if (!enabled) {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    map.getContainer().dataset.topography = "off";
    return;
  }
  const engaged = force3d || map.getPitch() > TERRAIN_ENGAGE_PITCH || map.getZoom() >= TERRAIN_ENGAGE_ZOOM;
  const showHillshade = alwaysShowHillshade || engaged;
  map.getContainer().dataset.topography = engaged ? "terrain" : showHillshade ? "hillshade" : "off";
  if (showHillshade) {
    ensureDemSource(map, HILLSHADE_SOURCE_ID);
    if (!map.getLayer(HILLSHADE_LAYER_ID)) {
      // insert beneath labels/roads so they stay legible over the relief
      const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: HILLSHADE_LAYER_ID,
          type: "hillshade",
          source: HILLSHADE_SOURCE_ID,
          paint: {
            "hillshade-exaggeration": visualProfile?.hillshadeExaggeration ?? 0.5,
            "hillshade-shadow-color": visualProfile?.hillshadeShadowColor ?? (isDark ? "#000000" : "#1a1a1a"),
            "hillshade-highlight-color": visualProfile?.hillshadeHighlightColor ?? (isDark ? "#333333" : "#ffffff"),
            "hillshade-illumination-direction": 315,
          },
        },
        firstSymbolId,
      );
    }
    map.setPaintProperty(HILLSHADE_LAYER_ID, "hillshade-exaggeration", visualProfile?.hillshadeExaggeration ?? 0.5);
    map.setPaintProperty(
      HILLSHADE_LAYER_ID,
      "hillshade-shadow-color",
      visualProfile?.hillshadeShadowColor ?? (isDark ? "#000000" : "#1a1a1a"),
    );
    map.setPaintProperty(
      HILLSHADE_LAYER_ID,
      "hillshade-highlight-color",
      visualProfile?.hillshadeHighlightColor ?? (isDark ? "#333333" : "#ffffff"),
    );
  } else if (map.getLayer(HILLSHADE_LAYER_ID)) {
    map.removeLayer(HILLSHADE_LAYER_ID);
  }

  if (engaged) {
    ensureDemSource(map, TERRAIN_SOURCE_ID);
    const exaggeration = force3d ? visualProfile?.terrainExaggeration ?? TERRAIN_EXAGGERATION : TERRAIN_EXAGGERATION;
    const terrain = map.getTerrain();
    if (!terrain || terrain.exaggeration !== exaggeration) {
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });
    }
  } else {
    if (map.getTerrain()) map.setTerrain(null);
  }
}

export function useMapLibre(
  styleId: string,
  // lng/lat pairs to fitBounds over; null/empty falls back to the configured default view
  fitPoints: [number, number][] | null,
  onStyleError?: (lastGoodStyleId: string) => void,
  options?: UseMapLibreOptions,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleIdRef = useRef(styleId);
  const lastStyleIdRef = useRef(styleId);
  const lastGoodStyleIdRef = useRef(styleId); // last style that loaded; the revert target on a failed swap
  const hasLoadedRef = useRef(false); // a style has loaded at least once (distinguishes initial-load failure)
  const swapPendingRef = useRef(false); // a setStyle() basemap swap is in flight (awaiting style.load)
  const onStyleErrorRef = useRef(onStyleError);
  const lastFitKeyRef = useRef<string | null>(null); // last applied fit target; skips redundant re-fits
  const topographyEnabledRef = useRef(options?.topographyEnabled ?? true);
  const topographyAlwaysVisibleRef = useRef(options?.topographyAlwaysVisible ?? false);
  const topographyForce3dRef = useRef(options?.topographyForce3d ?? false);
  const visualProfileRef = useRef(options?.visualProfile);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // keep styleId / callback readable inside the async map handlers without writing a ref during render
  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);
  useEffect(() => {
    onStyleErrorRef.current = onStyleError;
  }, [onStyleError]);
  useEffect(() => {
    topographyEnabledRef.current = options?.topographyEnabled ?? true;
    topographyAlwaysVisibleRef.current = options?.topographyAlwaysVisible ?? false;
    topographyForce3dRef.current = options?.topographyForce3d ?? false;
    visualProfileRef.current = options?.visualProfile;
    const map = mapRef.current;
    if (map && hasLoadedRef.current && !swapPendingRef.current && map.isStyleLoaded()) {
      applyTerrainState(
        map,
        resolveMapStyle(styleIdRef.current).dark,
        topographyEnabledRef.current,
        topographyAlwaysVisibleRef.current,
        topographyForce3dRef.current,
        visualProfileRef.current,
      );
      if (topographyEnabledRef.current && topographyForce3dRef.current && map.getPitch() < TERRAIN_ENGAGE_PITCH) {
        map.easeTo({
          pitch: MAP_TOPOGRAPHY_PITCH,
          bearing: Math.abs(map.getBearing()) < 1 ? MAP_TOPOGRAPHY_BEARING : map.getBearing(),
          duration: 550,
        });
      }
    }
  }, [options?.topographyAlwaysVisible, options?.topographyEnabled, options?.topographyForce3d, options?.visualProfile]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || swapPendingRef.current) return;
    let timeoutId: number | undefined;
    const apply = () => {
      if (!map.isStyleLoaded()) {
        timeoutId = window.setTimeout(apply, 100);
        return;
      }
      applyTerrainState(
        map,
        resolveMapStyle(styleIdRef.current).dark,
        topographyEnabledRef.current,
        topographyAlwaysVisibleRef.current,
        topographyForce3dRef.current,
        visualProfileRef.current,
      );
    };
    timeoutId = window.setTimeout(apply, 0);
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isReady, options?.topographyAlwaysVisible, options?.topographyEnabled, options?.topographyForce3d, options?.visualProfile]);

  // Init once. StrictMode-safe: the guard prevents a duplicate map, and cleanup fully tears the
  // map down (map.remove() disposes the GL context + all map.on listeners) and nulls the ref so a
  // remount (StrictMode in dev, or returning to the Map tab) rebuilds cleanly.
  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    setError(null);

    // open at the default view; the fit effect frames the selection once the style is ready
    const map = new maplibregl.Map({
      container,
      style: resolveMapStyle(styleIdRef.current).url,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: topographyEnabledRef.current && topographyForce3dRef.current ? MAP_TOPOGRAPHY_PITCH : DEFAULT_PITCH,
      bearing:
        topographyEnabledRef.current && topographyForce3dRef.current ? MAP_TOPOGRAPHY_BEARING : DEFAULT_BEARING,
      maxPitch: MAX_PITCH,
      attributionControl: false, // replaced below with a compact (always-collapsed) control
    });
    mapRef.current = map;
    lastStyleIdRef.current = styleIdRef.current;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true })); // bottom-right
    // maplibre pops the compact attribution open the first time the basemap credit loads (it tacks
    // on .maplibregl-compact-show). Mark it .maplibregl-compact up front so it skips that and stays
    // a bare (i) on load — clicking it still opens the credit.
    const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    attrib?.classList.add("maplibregl-compact");
    attrib?.classList.remove("maplibregl-compact-show");

    const onStyleReady = () => {
      applyTerrainState(
        map,
        resolveMapStyle(styleIdRef.current).dark,
        topographyEnabledRef.current,
        topographyAlwaysVisibleRef.current,
        topographyForce3dRef.current,
        visualProfileRef.current,
      );
      hasLoadedRef.current = true;
      swapPendingRef.current = false;
      lastGoodStyleIdRef.current = styleIdRef.current;
      setIsReady(true);
      setError(null); // a successful (re)load clears any earlier transient/initial error
    };
    map.on("load", onStyleReady); // first paint (style.load does not reliably fire on initial load)
    map.on("style.load", onStyleReady); // re-add terrain after every setStyle

    // Re-evaluate terrain engagement as the camera settles, so tilting/zooming in turns on relief and
    // returning to a flat overview turns it off. Idempotent, so a plain pan at high zoom is a no-op.
    const onCameraSettle = () => {
      if (!hasLoadedRef.current || swapPendingRef.current || !map.isStyleLoaded()) return;
      applyTerrainState(
        map,
        resolveMapStyle(styleIdRef.current).dark,
        topographyEnabledRef.current,
        topographyAlwaysVisibleRef.current,
        topographyForce3dRef.current,
        visualProfileRef.current,
      );
    };
    map.on("moveend", onCameraSettle);

    // The OpenFreeMap base styles ask for a handful of sprite icons their sprite doesn't ship (e.g.
    // "circle-11"), so maplibre warns on every load. Hand it a transparent 1x1 for anything that
    // isn't ours and the noise goes away — a missing icon already draws nothing, so the map looks
    // identical. Our own markers all start with "node-" and are rasterized by useMapNodes, so we
    // leave those alone. This lives here (not in useMapNodes) so it's listening before the base
    // style's first paint, when those icons are first requested.
    map.on("styleimagemissing", (e) => {
      if (!e.id.startsWith("node-") && !map.hasImage(e.id)) map.addImage(e.id, new ImageData(1, 1));
    });

    map.on("error", (e) => {
      const err = e as { error?: Error; sourceId?: string; tile?: unknown };
      // A single tile/source failure (one basemap or DEM tile timing out / 403 / a momentary network
      // blip) is transient and non-fatal — the rest of the map stays usable — so never blank the map
      // for it. maplibre tags tile/source errors with a tile/sourceId; style-level errors have neither.
      if (err.sourceId != null || err.tile != null) return;
      // The new basemap failed mid-swap. setStyle keeps the old style (and our node layers)
      // rendered, so roll back to the last good style and tell MapView to revert the picker rather
      // than blanking the map under a fatal overlay.
      if (swapPendingRef.current) {
        swapPendingRef.current = false;
        lastStyleIdRef.current = lastGoodStyleIdRef.current;
        setIsReady(true);
        onStyleErrorRef.current?.(lastGoodStyleIdRef.current);
        return;
      }
      // Initial map/style load failed (no basemap ever shown): surface the overlay. It self-heals if a
      // later load succeeds (onStyleReady clears it). Other post-load style errors are left non-fatal.
      if (!hasLoadedRef.current) setError(err.error ?? new Error("Map failed to load"));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
    // styleId is read via styleIdRef so the map is built once; style swaps go through the effect below.
  }, [options?.resetKey]);

  // Swap the basemap only when the style really changes. Skip the initial render (the map's already
  // built with the right style) and redundant swaps, which would cause a wasteful re-fetch and an
  // extra style.load while the first style is still loading. style.load then re-adds terrain.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleId === lastStyleIdRef.current) return;
    lastStyleIdRef.current = styleId;
    swapPendingRef.current = true; // cleared by style.load on success, or by the error handler on failure
    setIsReady(false);
    map.setStyle(resolveMapStyle(styleId).url);
  }, [styleId]);

  // Frame the selection: fitBounds over its IATA points, or the default overview when there's none.
  // A single point gets the IATA_ZOOM terrain tilt; multiple get a flat overview. Waits for the
  // style, and the key check skips redundant re-fits (incl. isReady toggling on basemap swaps).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const key = fitKey(fitPoints);
    if (key === lastFitKeyRef.current) return;
    lastFitKeyRef.current = key;

    if (!fitPoints || fitPoints.length === 0) {
      map.flyTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch:
          topographyEnabledRef.current && topographyForce3dRef.current ? MAP_TOPOGRAPHY_PITCH : DEFAULT_PITCH,
        bearing:
          topographyEnabledRef.current && topographyForce3dRef.current
            ? MAP_TOPOGRAPHY_BEARING
            : DEFAULT_BEARING,
      });
      return;
    }

    const bounds = fitPoints.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(fitPoints[0], fitPoints[0]),
    );
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: IATA_ZOOM,
      pitch:
        topographyEnabledRef.current && topographyForce3dRef.current
          ? MAP_TOPOGRAPHY_PITCH
          : fitPoints.length === 1
            ? IATA_PITCH
            : DEFAULT_PITCH,
      bearing:
        topographyEnabledRef.current && topographyForce3dRef.current ? MAP_TOPOGRAPHY_BEARING : DEFAULT_BEARING,
    });
  }, [fitPoints, isReady]);

  return { containerRef, mapRef, isReady, error };
}
