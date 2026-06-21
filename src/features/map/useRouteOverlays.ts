import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { getNodeRouteNeighborhood } from "../../api/client";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import type { KnownRoute, NodeRouteNeighborhood, RouteHop } from "../../types/api";

const EMPTY_LINES: FeatureCollection<LineString> = { type: "FeatureCollection", features: [] };
const EMPTY_POINTS: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

const NEIGHBORHOOD_SOURCE_ID = "verified-route-neighborhood";
const NEIGHBORHOOD_GLOW_LAYER_ID = "verified-route-neighborhood-glow";
const NEIGHBORHOOD_LINE_LAYER_ID = "verified-route-neighborhood-line";
const ROUTE_SOURCE_ID = "selected-route-replay";
const ROUTE_GLOW_LAYER_ID = "selected-route-replay-glow";
const ROUTE_LINE_LAYER_ID = "selected-route-replay-line";
const ROUTE_PULSE_SOURCE_ID = "selected-route-replay-pulse";
const ROUTE_PULSE_LAYER_ID = "selected-route-replay-pulse";
const ROUTE_HOPS_SOURCE_ID = "selected-route-replay-hops";
const ROUTE_HOP_HALO_LAYER_ID = "selected-route-replay-hop-halo";
const ROUTE_HOP_LAYER_ID = "selected-route-replay-hop";
const ROUTE_HOP_LABEL_LAYER_ID = "selected-route-replay-hop-label";

export interface RouteReplayHop {
  index: number;
  label: string;
  role: "tx" | "hop" | "rx";
  nodeId: string;
  nodeLabel: string;
  hash: string;
  hasCoordinates: boolean;
  coordinates?: [number, number];
}

function mapCssVar(map: MapLibreMap, name: string, fallback: string): string {
  const scope = map.getContainer().closest("[data-map-profile]") ?? map.getContainer();
  return getComputedStyle(scope).getPropertyValue(name).trim() || fallback;
}

function lineSource(map: MapLibreMap, id: string): GeoJSONSource | undefined {
  return map.getSource(id) as GeoJSONSource | undefined;
}

function ensureNeighborhoodLayers(map: MapLibreMap) {
  if (!map.getSource(NEIGHBORHOOD_SOURCE_ID)) {
    map.addSource(NEIGHBORHOOD_SOURCE_ID, { type: "geojson", data: EMPTY_LINES });
  }
  const primary = mapCssVar(map, "--map-route-primary", "#ffb000");
  const secondary = mapCssVar(map, "--map-route-secondary", "#42ff7c");
  const glowOpacity = Number(mapCssVar(map, "--map-route-glow-opacity", "0.28"));
  const lineOpacity = Number(mapCssVar(map, "--map-route-line-opacity", "0.9"));
  if (!map.getLayer(NEIGHBORHOOD_GLOW_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOOD_GLOW_LAYER_ID,
      type: "line",
      source: NEIGHBORHOOD_SOURCE_ID,
      paint: {
        "line-color": primary,
        "line-opacity": glowOpacity,
        "line-width": ["interpolate", ["linear"], ["get", "hopDistance"], 1, 9, 5, 3],
        "line-blur": 7,
      },
    });
  }
  if (!map.getLayer(NEIGHBORHOOD_LINE_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOOD_LINE_LAYER_ID,
      type: "line",
      source: NEIGHBORHOOD_SOURCE_ID,
      paint: {
        "line-color": ["case", ["<=", ["get", "hopDistance"], 2], primary, secondary],
        "line-opacity": ["interpolate", ["linear"], ["get", "hopDistance"], 1, lineOpacity, 5, 0.36],
        "line-width": ["interpolate", ["linear"], ["get", "hopDistance"], 1, 2.8, 5, 1.2],
        "line-dasharray": [1.8, 1.1],
      },
    });
  }
  map.setPaintProperty(NEIGHBORHOOD_GLOW_LAYER_ID, "line-color", primary);
  map.setPaintProperty(NEIGHBORHOOD_GLOW_LAYER_ID, "line-opacity", glowOpacity);
  map.setPaintProperty(NEIGHBORHOOD_LINE_LAYER_ID, "line-color", ["case", ["<=", ["get", "hopDistance"], 2], primary, secondary]);
  map.setPaintProperty(NEIGHBORHOOD_LINE_LAYER_ID, "line-opacity", ["interpolate", ["linear"], ["get", "hopDistance"], 1, lineOpacity, 5, 0.36]);
}

function ensureRouteReplayLayers(map: MapLibreMap) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_LINES });
  }
  if (!map.getSource(ROUTE_PULSE_SOURCE_ID)) {
    map.addSource(ROUTE_PULSE_SOURCE_ID, { type: "geojson", data: EMPTY_POINTS });
  }
  if (!map.getSource(ROUTE_HOPS_SOURCE_ID)) {
    map.addSource(ROUTE_HOPS_SOURCE_ID, { type: "geojson", data: EMPTY_POINTS });
  }
  const primary = mapCssVar(map, "--map-route-primary", "#ffb000");
  const secondary = mapCssVar(map, "--map-route-secondary", "#42bfff");
  const green = mapCssVar(map, "--map-route-green", "#42ff7c");
  const glowOpacity = Number(mapCssVar(map, "--map-route-glow-opacity", "0.34"));
  const lineOpacity = Number(mapCssVar(map, "--map-route-line-opacity", "0.92"));
  const glowWidth = Number(mapCssVar(map, "--map-route-glow-width", "10"));
  const lineWidth = Number(mapCssVar(map, "--map-route-line-width", "2.4"));
  const backplate = mapCssVar(map, "--map-node-backplate", "rgba(0,0,0,0.9)");
  const label = mapCssVar(map, "--map-node-label", "#fff4cf");
  const labelHalo = mapCssVar(map, "--map-node-label-halo", "rgba(0,0,0,0.9)");
  if (!map.getLayer(ROUTE_GLOW_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_GLOW_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      paint: {
        "line-color": primary,
        "line-opacity": Math.min(0.82, glowOpacity * 1.35),
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, glowWidth * 0.9, 10, glowWidth * 1.35],
        "line-blur": 6,
      },
    });
  }
  if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      paint: {
        "line-color": primary,
        "line-opacity": lineOpacity,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, lineWidth, 10, lineWidth * 1.55],
        "line-dasharray": [1.8, 0.7],
      },
    });
  }
  if (!map.getLayer(ROUTE_HOP_HALO_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_HOP_HALO_LAYER_ID,
      type: "circle",
      source: ROUTE_HOPS_SOURCE_ID,
      paint: {
        "circle-color": primary,
        "circle-radius": ["case", ["==", ["get", "role"], "hop"], 12, 14],
        "circle-opacity": 0.2,
        "circle-blur": 0.45,
      },
    });
  }
  if (!map.getLayer(ROUTE_HOP_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_HOP_LAYER_ID,
      type: "circle",
      source: ROUTE_HOPS_SOURCE_ID,
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "role"], "tx"],
          green,
          ["==", ["get", "role"], "rx"],
          primary,
          secondary,
        ],
        "circle-radius": ["case", ["==", ["get", "role"], "hop"], 5.5, 6.8],
        "circle-opacity": 0.98,
        "circle-stroke-color": backplate,
        "circle-stroke-width": 2.2,
        "circle-stroke-opacity": 0.92,
      },
    });
  }
  if (!map.getLayer(ROUTE_PULSE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_PULSE_LAYER_ID,
      type: "circle",
      source: ROUTE_PULSE_SOURCE_ID,
      paint: {
        "circle-color": green,
        "circle-radius": 5,
        "circle-opacity": 0.95,
        "circle-stroke-color": primary,
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.88,
        "circle-blur": 0.25,
      },
    });
  }
  if (!map.getLayer(ROUTE_HOP_LABEL_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_HOP_LABEL_LAYER_ID,
      type: "symbol",
      source: ROUTE_HOPS_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-offset": [0, 1.35],
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": label,
        "text-halo-color": labelHalo,
        "text-halo-width": 1.6,
        "text-halo-blur": 0.2,
      },
    });
  }
  map.setPaintProperty(ROUTE_GLOW_LAYER_ID, "line-color", primary);
  map.setPaintProperty(ROUTE_GLOW_LAYER_ID, "line-opacity", Math.min(0.82, glowOpacity * 1.35));
  map.setPaintProperty(ROUTE_GLOW_LAYER_ID, "line-width", ["interpolate", ["linear"], ["zoom"], 5, glowWidth * 0.9, 10, glowWidth * 1.35]);
  map.setPaintProperty(ROUTE_LINE_LAYER_ID, "line-color", primary);
  map.setPaintProperty(ROUTE_LINE_LAYER_ID, "line-opacity", lineOpacity);
  map.setPaintProperty(ROUTE_LINE_LAYER_ID, "line-width", ["interpolate", ["linear"], ["zoom"], 5, lineWidth, 10, lineWidth * 1.55]);
  map.setPaintProperty(ROUTE_HOP_HALO_LAYER_ID, "circle-color", primary);
  map.setPaintProperty(ROUTE_HOP_LAYER_ID, "circle-color", [
    "case",
    ["==", ["get", "role"], "tx"],
    green,
    ["==", ["get", "role"], "rx"],
    primary,
    secondary,
  ]);
  map.setPaintProperty(ROUTE_HOP_LAYER_ID, "circle-stroke-color", backplate);
  map.setPaintProperty(ROUTE_HOP_LABEL_LAYER_ID, "text-color", label);
  map.setPaintProperty(ROUTE_HOP_LABEL_LAYER_ID, "text-halo-color", labelHalo);
  map.setPaintProperty(ROUTE_PULSE_LAYER_ID, "circle-color", green);
  map.setPaintProperty(ROUTE_PULSE_LAYER_ID, "circle-stroke-color", primary);
}

function neighborhoodToLines(data: NodeRouteNeighborhood | undefined): FeatureCollection<LineString> {
  if (!data) return EMPTY_LINES;
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const features: Feature<LineString>[] = [];
  for (const edge of data.edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
      properties: {
        hopDistance: edge.hopDistance,
        iata: edge.iata,
        observationCount: edge.observationCount,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function routePathPoints(route: KnownRoute | undefined): [number, number][] {
  return routeReplayHops(route)
    .map((hop) => hop.coordinates)
    .filter((point): point is [number, number] => point != null);
}

function routeHopRole(index: number, total: number): RouteReplayHop["role"] {
  if (index === 0) return "tx";
  if (index === total - 1) return "rx";
  return "hop";
}

function routeHopLabel(index: number, total: number): string {
  if (total <= 1) return "TX/RX";
  if (index === 0) return "TX";
  if (index === total - 1) return "RX";
  return `H${index}`;
}

function routeHopName(hop: RouteHop): string {
  const fallback = hop.hashBytes ? hop.hashBytes.toUpperCase() : hop.nodeId.slice(0, 8).toUpperCase();
  return sanitizeDisplayLabel(hop.node?.name, fallback);
}

export function routeReplayHops(route: KnownRoute | undefined): RouteReplayHop[] {
  const hops = route?.hops ?? [];
  return hops.map((hop, index) => {
    const lat = hop.node?.latitude;
    const lng = hop.node?.longitude;
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      index,
      label: routeHopLabel(index, hops.length),
      role: routeHopRole(index, hops.length),
      nodeId: hop.nodeId,
      nodeLabel: routeHopName(hop),
      hash: hop.hashBytes?.toUpperCase() ?? "",
      hasCoordinates,
      coordinates: hasCoordinates ? ([lng!, lat!] as [number, number]) : undefined,
    };
  });
}

function routeToLine(route: KnownRoute | undefined): FeatureCollection<LineString> {
  const points = routePathPoints(route);
  if (points.length < 2) return EMPTY_LINES;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: points },
        properties: {
          routeId: route?.id ?? 0,
          mappedHops: points.length,
          totalHops: route?.hops.length ?? 0,
        },
      },
    ],
  };
}

function routeToHopPoints(route: KnownRoute | undefined): FeatureCollection<Point> {
  const features: Feature<Point>[] = routeReplayHops(route)
    .filter((hop) => hop.coordinates)
    .map((hop) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: hop.coordinates! },
      properties: {
        index: hop.index,
        label: hop.label,
        role: hop.role,
        nodeId: hop.nodeId,
        name: hop.nodeLabel,
        hash: hop.hash,
      },
    }));
  return features.length > 0 ? { type: "FeatureCollection", features } : EMPTY_POINTS;
}

function pointAlong(points: [number, number][], progress: number): [number, number] | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!;
  const distances: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    distances.push(d);
    total += d;
  }
  let remaining = total * progress;
  for (let i = 0; i < distances.length; i += 1) {
    const d = distances[i]!;
    const from = points[i]!;
    const to = points[i + 1]!;
    if (remaining <= d || i === distances.length - 1) {
      const t = d <= 0 ? 1 : Math.max(0, Math.min(1, remaining / d));
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    }
    remaining -= d;
  }
  return points.at(-1) ?? null;
}

export function useVerifiedRouteNeighborhoodOverlay(
  mapRef: RefObject<MapLibreMap | null>,
  isReady: boolean,
  selectedNodeId: string | null,
  iatas: string[] | undefined,
  themeKey: string,
) {
  const iataKey = (iatas ?? []).join(",");
  const query = useQuery({
    queryKey: ["node-route-neighborhood", selectedNodeId, iataKey],
    queryFn: () => getNodeRouteNeighborhood(selectedNodeId!, { iatas, maxHops: 5 }),
    enabled: Boolean(selectedNodeId),
    staleTime: 30_000,
  });
  const data = useMemo(() => neighborhoodToLines(query.data), [query.data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    ensureNeighborhoodLayers(map);
    lineSource(map, NEIGHBORHOOD_SOURCE_ID)?.setData(selectedNodeId ? data : EMPTY_LINES);
  }, [data, isReady, mapRef, selectedNodeId, themeKey]);

  useEffect(() => {
    if (selectedNodeId) return;
    const map = mapRef.current;
    if (!map || !map.getSource(NEIGHBORHOOD_SOURCE_ID)) return;
    lineSource(map, NEIGHBORHOOD_SOURCE_ID)?.setData(EMPTY_LINES);
  }, [mapRef, selectedNodeId]);

  return query;
}

export function useRouteReplayOverlay(
  mapRef: RefObject<MapLibreMap | null>,
  isReady: boolean,
  route: KnownRoute | undefined,
  active: boolean,
  themeKey: string,
  onMapClick?: () => void,
) {
  const points = useMemo(() => routePathPoints(route), [route]);
  const line = useMemo(() => routeToLine(route), [route]);
  const hopPoints = useMemo(() => routeToHopPoints(route), [route]);
  const rafRef = useRef(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    ensureRouteReplayLayers(map);
    lineSource(map, ROUTE_SOURCE_ID)?.setData(active ? line : EMPTY_LINES);
    lineSource(map, ROUTE_HOPS_SOURCE_ID)?.setData(active ? hopPoints : EMPTY_POINTS);
    lineSource(map, ROUTE_PULSE_SOURCE_ID)?.setData(EMPTY_POINTS);
  }, [active, hopPoints, isReady, line, mapRef, themeKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active || points.length < 2) return;
    let mounted = true;
    const startedAt = performance.now();
    const duration = 2_600 + Math.min(1_600, points.length * 220);
    const draw = (now: number) => {
      if (!mounted) return;
      const progress = ((now - startedAt) % duration) / duration;
      const point = pointAlong(points, progress);
      lineSource(map, ROUTE_PULSE_SOURCE_ID)?.setData(
        point
          ? {
              type: "FeatureCollection",
              features: [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: {} }],
            }
          : EMPTY_POINTS,
      );
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      lineSource(map, ROUTE_PULSE_SOURCE_ID)?.setData(EMPTY_POINTS);
    };
  }, [active, mapRef, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active || !onMapClick) return;
    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [active, mapRef, onMapClick]);
}
