import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  GeoJSONSource,
  ExpressionSpecification,
  SymbolLayerSpecification,
  CircleLayerSpecification,
  MapLayerMouseEvent,
} from "maplibre-gl";
import Spiderfy from "@nazka/map-gl-js-spiderfy";
import type { FeatureCollection, Point } from "geojson";
import { rasterizeNodeIcon, MAP_ICON_IDS, nodeObserverIconId, SELECTION_RING_ICON_ID } from "./node-icons";
import type { NodeFeatureProps } from "./node-geojson";
import {
  NODES_SOURCE_ID,
  NODES_CLUSTER_LAYER_ID,
  NODES_ACTIVITY_LAYER_ID,
  NODES_POINT_LAYER_ID,
  NODES_SELECTED_LAYER_ID,
  NODES_SELECTED_LEAF_LAYER_ID,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  NODES_SOURCE_MAXZOOM,
  SPIDERFY_MIN_ZOOM,
  NODE_LABEL_MIN_ZOOM,
  NODE_TYPE_NAMES,
  NODE_ICON_UNKNOWN,
  nodeIconId,
  clusterIconImageExpression,
} from "./types";

type NodeFC = FeatureCollection<Point, NodeFeatureProps>;

function mapCssVar(map: MapLibreMap, name: string, fallback: string): string {
  const scope = map.getContainer().closest("[data-map-profile]") ?? map.getContainer();
  return getComputedStyle(scope).getPropertyValue(name).trim() || fallback;
}

const EMPTY_FC: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

// Place the selection ring on the selected node's spiderfied leaf, or clear it. Spiderfy fans each
// leaf out from the shared cluster center via a screen-space icon-offset, so we draw the ring on
// that same center + offset: it rides the same symbol pipeline as the leaf and stays aligned on any
// pitch/terrain (a circle layer would sit on the terrain and drift). The id-filtered
// NODES_SELECTED_LAYER_ID can't reach a leaf — it's aggregated inside a cluster with no top-level id.
function syncLeafSelectionRing(map: MapLibreMap, selectedId: string | null): void {
  const src = map.getSource(NODES_SELECTED_LEAF_LAYER_ID) as GeoJSONSource | undefined;
  if (!src || !map.getLayer(NODES_SELECTED_LEAF_LAYER_ID)) return;
  let center: [number, number] | null = null;
  let offset: [number, number] = [0, 0];
  if (selectedId) {
    for (const layer of map.getStyle().layers ?? []) {
      if (!layer.id.includes("-spiderfy-leaf")) continue;
      const feat = map
        .querySourceFeatures(layer.id)
        .find((f) => f.properties?.["id"] === selectedId);
      if (feat && feat.geometry.type === "Point") {
        center = feat.geometry.coordinates as [number, number];
        const o = map.getLayoutProperty(layer.id, "icon-offset");
        if (Array.isArray(o) && o.length === 2) offset = [Number(o[0]), Number(o[1])];
        break;
      }
    }
  }
  map.setLayoutProperty(NODES_SELECTED_LEAF_LAYER_ID, "icon-offset", offset);
  src.setData(
    center
      ? {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} }],
        }
      : EMPTY_FC,
  );
}

// Icon per device type; observers get the -observer pip variant, unknown types the fallback ring.
const ICON_IMAGE: ExpressionSpecification = [
  "match",
  ["get", "nodeTypeName"],
  ...NODE_TYPE_NAMES.flatMap((t) => [
    t,
    ["case", ["to-boolean", ["get", "isObserver"]], nodeObserverIconId(t), nodeIconId(t)],
  ]),
  NODE_ICON_UNKNOWN,
] as unknown as ExpressionSpecification;

const SPIDER_LEAVES_LAYOUT: SymbolLayerSpecification["layout"] = {
  "icon-image": ICON_IMAGE,
  "icon-size": 1,
  "icon-allow-overlap": true,
};

const NODE_ICON_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "active"], false],
  1,
  0.46,
] as unknown as ExpressionSpecification;

function activityColorExpression(tx: string, rx: string, relay: string): ExpressionSpecification {
  return [
    "case",
    ["==", ["feature-state", "activityRole"], "tx"],
    tx,
    ["==", ["feature-state", "activityRole"], "rx"],
    rx,
    ["==", ["feature-state", "activityRole"], "relay"],
    relay,
    tx,
  ] as unknown as ExpressionSpecification;
}

// Renders nodes as a clustered GeoJSON layer (per-type icons, spiderfy for co-located nodes, name
// labels at high zoom). Like useMapLibre, the imperative work re-adds itself after every style switch.
export function useMapNodes(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  geojson: NodeFC,
  isDark: boolean,
  themeKey: string,
  clustered: boolean,
  onSelectNode: (id: string) => void,
  selectedNodeId: string | null,
  // identity of the dataset (region + type filter); an open spiderfy fan closes when it changes,
  // since its leaves were drawn from the previous dataset
  resetKey = "",
) {
  const geojsonRef = useRef(geojson);
  const spiderRef = useRef<Spiderfy | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const appliedClusteredRef = useRef(clustered);
  // coalesce live-data setData calls to one per frame (auto-paging settles many pages in a burst)
  const setDataRafRef = useRef(0);
  const pendingGeojsonRef = useRef<NodeFC | null>(null);

  // handlers below capture map at attach time; read live state through these refs
  useEffect(() => {
    geojsonRef.current = geojson;
    onSelectNodeRef.current = onSelectNode;
    selectedNodeIdRef.current = selectedNodeId;
  }, [geojson, onSelectNode, selectedNodeId]);

  // Track device-pixel-ratio so icons re-rasterize at full resolution across a DPR change (e.g.
  // dragging the window to another monitor). A matchMedia(dppx) query fires once then goes stale,
  // so re-arm it on every change.
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      setDpr(window.devicePixelRatio);
      mql.removeEventListener("change", onChange);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onChange);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Build the source + layers and keep their paint in step with the basemap and theme. Idempotent,
  // so it re-runs safely on first ready, after each style switch, and on theme changes. Marker
  // images are handled by the icons effect below.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const textColor = mapCssVar(map, "--map-node-label", isDark ? "#ffe9a8" : "#120900");
    const halo = mapCssVar(map, "--map-node-label-halo", isDark ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.86)");
    const txColor = mapCssVar(map, "--map-route-primary", "#ffb000");
    const rxColor = mapCssVar(map, "--map-route-green", "#42ff7c");
    const relayColor = mapCssVar(map, "--map-route-secondary", "#7cffec");
    const activityColor = activityColorExpression(txColor, rxColor, relayColor);

    // maplibre fixes `cluster` at source creation, so toggling clustering means recreating the
    // source. The spiderfy effect below also keys on `clustered` and re-applies itself around this.
    if (appliedClusteredRef.current !== clustered && map.getSource(NODES_SOURCE_ID)) {
      for (const id of [NODES_SELECTED_LEAF_LAYER_ID, NODES_SELECTED_LAYER_ID, NODES_ACTIVITY_LAYER_ID, NODES_CLUSTER_LAYER_ID, NODES_POINT_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      map.removeSource(NODES_SOURCE_ID);
    }
    appliedClusteredRef.current = clustered;

    let sourceCreated = false;
    if (!map.getSource(NODES_SOURCE_ID)) {
      sourceCreated = true;
      map.addSource(NODES_SOURCE_ID, {
        type: "geojson",
        data: geojsonRef.current,
        promoteId: "id",
        // maxzoom > clusterMaxZoom keeps co-located nodes spiderfy-able at every zoom (past
        // clusterMaxZoom they'd otherwise render as stacked, un-spiderfy-able points).
        maxzoom: NODES_SOURCE_MAXZOOM,
        cluster: clustered,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
      });
    }

    // Cluster as a SYMBOL layer (hexagon icon + count) — spiderfy requires a symbol layer. The icon
    // is a density level picked by point_count; the count is drawn as centered text (the icon has
    // none baked in). text-size isn't scaled by icon-size, so both are interpolated together.
    if (!map.getLayer(NODES_CLUSTER_LAYER_ID)) {
      map.addLayer({
        id: NODES_CLUSTER_LAYER_ID,
        type: "symbol",
        source: NODES_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "icon-image": clusterIconImageExpression() as unknown as ExpressionSpecification,
          "icon-size": ["interpolate", ["linear"], ["get", "point_count"], 2, 0.9, 25, 1.1, 100, 1.4],
          "icon-allow-overlap": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["get", "point_count"], 2, 13, 25, 16, 100, 20],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": mapCssVar(map, "--map-cluster-text", "#fff7cc"),
          "text-halo-color": mapCssVar(map, "--map-primary", "#ffb000"),
          "text-halo-width": 1.2,
        },
      } as SymbolLayerSpecification);
    }

    if (!map.getLayer(NODES_ACTIVITY_LAYER_ID)) {
      map.addLayer(
        {
          id: NODES_ACTIVITY_LAYER_ID,
          type: "circle",
          source: NODES_SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "active"], false],
              ["case", ["==", ["feature-state", "activityRole"], "relay"], 11, 15],
              3,
            ],
            "circle-color": activityColor,
            "circle-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.22, 0],
            "circle-blur": 0.55,
            "circle-stroke-color": activityColor,
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "active"], false], 2.2, 0],
            "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.88, 0],
            "circle-opacity-transition": { duration: 1_400, delay: 0 },
            "circle-stroke-opacity-transition": { duration: 1_400, delay: 0 },
            "circle-radius-transition": { duration: 900, delay: 0 },
          },
        } as CircleLayerSpecification,
        NODES_CLUSTER_LAYER_ID,
      );
    }

    if (!map.getLayer(NODES_POINT_LAYER_ID)) {
      map.addLayer({
        id: NODES_POINT_LAYER_ID,
        type: "symbol",
        source: NODES_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ICON_IMAGE,
          "icon-size": 1,
          "icon-allow-overlap": true,
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "icon-opacity": NODE_ICON_OPACITY,
          "icon-opacity-transition": { duration: 1_200, delay: 0 },
          "text-color": textColor,
          "text-halo-color": halo,
          "text-halo-width": 1.3,
          // labels fade in only at high zoom
          "text-opacity": ["step", ["zoom"], 0, NODE_LABEL_MIN_ZOOM, 1],
        },
      } as SymbolLayerSpecification);
    }

    // Ring under the selected node's icon. Only matches an unclustered point (clusters carry no id);
    // color tracks --palette-primary.
    const primary = mapCssVar(map, "--map-primary", "#ffb000");
    if (!map.getLayer(NODES_SELECTED_LAYER_ID)) {
      map.addLayer(
        {
          id: NODES_SELECTED_LAYER_ID,
          type: "circle",
          source: NODES_SOURCE_ID,
          filter: ["==", ["get", "id"], selectedNodeIdRef.current ?? ""],
          paint: {
            "circle-radius": 13,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": primary,
            "circle-stroke-opacity": 0.95,
          },
        },
        NODES_CLUSTER_LAYER_ID, // insert beneath the cluster + point symbol layers
      );
    }
    map.setPaintProperty(NODES_SELECTED_LAYER_ID, "circle-stroke-color", primary);

    // Same ring for a node shown as a spiderfied leaf, but as a SYMBOL so it tracks the leaf's
    // offset (see syncLeafSelectionRing). The ring image is supplied by the icons effect.
    if (!map.getSource(NODES_SELECTED_LEAF_LAYER_ID)) {
      map.addSource(NODES_SELECTED_LEAF_LAYER_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(NODES_SELECTED_LEAF_LAYER_ID)) {
      map.addLayer(
        {
          id: NODES_SELECTED_LEAF_LAYER_ID,
          type: "symbol",
          source: NODES_SELECTED_LEAF_LAYER_ID,
          layout: {
            "icon-image": SELECTION_RING_ICON_ID,
            "icon-size": 1,
            "icon-offset": [0, 0],
            "icon-allow-overlap": true,
          },
        },
        NODES_CLUSTER_LAYER_ID, // beneath the markers; the dynamic leaf layers still render on top
      );
    }
    syncLeafSelectionRing(map, selectedNodeIdRef.current);

    // node-label colors track the basemap dark/light flag (cluster count is white on the hexagon)
    map.setPaintProperty(NODES_POINT_LAYER_ID, "text-color", textColor);
    map.setPaintProperty(NODES_POINT_LAYER_ID, "text-halo-color", halo);
    map.setPaintProperty(NODES_POINT_LAYER_ID, "icon-opacity", NODE_ICON_OPACITY);
    if (map.getLayer(NODES_ACTIVITY_LAYER_ID)) {
      map.setPaintProperty(NODES_ACTIVITY_LAYER_ID, "circle-color", activityColor);
      map.setPaintProperty(NODES_ACTIVITY_LAYER_ID, "circle-stroke-color", activityColor);
    }
    map.setPaintProperty(NODES_CLUSTER_LAYER_ID, "text-color", mapCssVar(map, "--map-cluster-text", "#fff7cc"));
    map.setPaintProperty(NODES_CLUSTER_LAYER_ID, "text-halo-color", primary);

    // Seed only a freshly created source (first build, or a clustering-toggle recreate). On a pure
    // theme/basemap change the source already holds the current data, so re-seeding it would force a
    // needless full relayout of every node; live data flows through the rAF-batched geojson effect.
    if (sourceCreated) {
      (map.getSource(NODES_SOURCE_ID) as GeoJSONSource).setData(geojsonRef.current);
    }
  }, [mapRef, isReady, isDark, clustered, themeKey]);

  // Supply and re-color the marker images. SVG glyphs rasterize async, so they're provided both
  // proactively here and lazily on styleimagemissing. Re-runs on a theme/basemap/DPR change to
  // re-rasterize; a basemap switch also drops the images via setStyle, which this then restores.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    let cancelled = false;
    const provide = (id: string) =>
      rasterizeNodeIcon(id, isDark, map.getContainer().closest("[data-map-profile]") ?? map.getContainer())
        .then((icon) => {
          if (cancelled || !icon || mapRef.current !== map) return;
          if (map.hasImage(id)) map.removeImage(id);
          map.addImage(id, icon.data, { pixelRatio: icon.pixelRatio });
        })
        .catch(() => {
          /* an icon failed to rasterize; the layer simply draws nothing for that id */
        });
    const onMissing = (e: { id: string }) => provide(e.id);
    map.on("styleimagemissing", onMissing);
    // A symbol won't draw until its icon is in, and adding one late doesn't redraw tiles that
    // already laid out — that's the "markers only show after I pan/zoom" bug. So once every icon
    // is ready, nudge the source to lay the markers out again (setData reloads the whole source).
    // styleimagemissing still covers anything asked for before we get here.
    Promise.all(MAP_ICON_IDS.map(provide)).then(() => {
      if (cancelled || mapRef.current !== map) return;
      const src = map.getSource(NODES_SOURCE_ID) as GeoJSONSource | undefined;
      if (src) src.setData(geojsonRef.current);
    });
    return () => {
      cancelled = true;
      map.off("styleimagemissing", onMissing);
    };
  }, [mapRef, isReady, isDark, themeKey, dpr]);

  // Reflect the shared selection as a ring (mirrors the table's row highlight). Its own effect so
  // changing the selection doesn't rebuild the source/layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !map.getLayer(NODES_SELECTED_LAYER_ID)) return;
    map.setFilter(NODES_SELECTED_LAYER_ID, ["==", ["get", "id"], selectedNodeId ?? ""]);
    syncLeafSelectionRing(map, selectedNodeId);
  }, [mapRef, isReady, selectedNodeId]);

  // Push new node data into the source as it arrives; the source re-clusters automatically. Batched
  // to one setData per frame so a burst of auto-chained pages (or coalesced WS updates landing in the
  // same tick) triggers a single re-cluster + relayout instead of one per page — latest data wins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    pendingGeojsonRef.current = geojson;
    if (setDataRafRef.current === 0) {
      setDataRafRef.current = requestAnimationFrame(() => {
        setDataRafRef.current = 0;
        const liveMap = mapRef.current;
        const data = pendingGeojsonRef.current;
        const src = liveMap?.getSource(NODES_SOURCE_ID) as GeoJSONSource | undefined;
        if (src && data) src.setData(data);
      });
    }
  }, [mapRef, isReady, geojson]);

  // cancel any pending batched setData on unmount
  useEffect(
    () => () => {
      if (setDataRafRef.current) {
        cancelAnimationFrame(setDataRafRef.current);
        setDataRafRef.current = 0;
      }
    },
    [],
  );

  // Build spiderfy + node/cluster interactions, and tear them down on cleanup. Re-runs on every
  // style switch and clustering toggle, so body and cleanup must stay symmetric: setStyle does NOT
  // drop delegated layer listeners (stable ids in maplibre's Evented registry), so every map.on
  // must be matched by a map.off here or handlers pile up across switches.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const spider = new Spiderfy(map, {
      forceSpiderifyMinZoom: SPIDERFY_MIN_ZOOM,
      closeOnLeafClick: false,
      onLeafClick: (f) => {
        const id = f.properties?.["id"];
        if (typeof id === "string") onSelectNodeRef.current(id);
      },
      // Connector legs from the cluster to each fanned-out node. Width MUST be an integer: the lib
      // rasterizes each leg as a width×length image, and a fractional width (1.5) renders as a
      // broken dotted sprite — 2 gives a clean line.
      spiderLegsColor: mapCssVar(map, "--map-spider-leg", "#6e4818"),
      spiderLegsWidth: 2,
      spiderLeavesLayout: SPIDER_LEAVES_LAYOUT,
    });
    spider.applyTo(NODES_CLUSTER_LAYER_ID);
    spiderRef.current = spider;
    // @nazka/map-gl-js-spiderfy registers its cluster-click handler inside a one-shot map.once("idle").
    // With 3D terrain that idle often doesn't fire before this effect re-runs, so the handler never
    // attaches (clusters look unclickable) or attaches late as an orphan after cleanup. Run that
    // deferred setup now and drop the pending idle, so it attaches synchronously and teardown removes it.
    const attachClusterClick = (spider as unknown as { mapevents?: { idle?: () => void } }).mapevents
      ?.idle;
    if (attachClusterClick) {
      map.off("idle", attachClusterClick);
      attachClusterClick();
    }

    const onPointClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.["id"];
      if (typeof id === "string") onSelectNodeRef.current(id);
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", NODES_POINT_LAYER_ID, onPointClick);
    for (const layer of [NODES_POINT_LAYER_ID, NODES_CLUSTER_LAYER_ID]) {
      map.on("mouseenter", layer, setPointer);
      map.on("mouseleave", layer, clearPointer);
    }

    // Keep the leaf selection ring in step with spiderfy: re-derive after any click (defer a frame so
    // the lib processes it first) and after a zoom re-fans the leaves.
    const resyncLeafRing = () => {
      if (mapRef.current !== map) return;
      syncLeafSelectionRing(map, selectedNodeIdRef.current);
    };
    const onClickResync = () => requestAnimationFrame(resyncLeafRing);
    map.on("click", onClickResync);
    // the ring tracks the leaf natively (same geometry + offset), so re-derive only after a zoom
    map.on("moveend", resyncLeafRing);

    return () => {
      map.off("click", NODES_POINT_LAYER_ID, onPointClick);
      map.off("click", onClickResync);
      map.off("moveend", resyncLeafRing);
      for (const layer of [NODES_POINT_LAYER_ID, NODES_CLUSTER_LAYER_ID]) {
        map.off("mouseenter", layer, setPointer);
        map.off("mouseleave", layer, clearPointer);
      }
      spiderRef.current = null;
      try {
        spider.unspiderfyAll();
      } catch {
        /* map may already be removed */
      }
    };
    // themeKey is a dep so spiderfy rebuilds and its legs + leaf icons pick up the new palette
  }, [mapRef, isReady, clustered, themeKey]);

  // close any open fan when the dataset identity changes — its leaves no longer exist
  useEffect(() => {
    try {
      spiderRef.current?.unspiderfyAll();
    } catch {
      /* map may already be removed */
    }
  }, [resetKey]);
}
