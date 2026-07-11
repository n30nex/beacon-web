import type { Map as MapLibreMap } from "maplibre-gl";
import { nullableDisplayLabel } from "../../lib/display-label";
import { toValidGeoCoord } from "../../lib/geo";
import { NODES_SOURCE_ID } from "../map/types";
import type { NodeSummary } from "../nodes/types";
import type { IataCode } from "../../types/api";
import {
  buildTrueRoutePath,
  hashColor,
  hashSeed,
  hexBytes,
  payloadColor,
  sameRouteCoord,
  type LivePacketEvent,
  type LiveRouteNode,
} from "./live-model";
import {
  LIVE_NODE_ACTIVITY_MS,
  LIVE_NODE_ACTIVITY_THROTTLE_MS,
  LIVE_PACKET_FLIGHT_BASE_MS,
  LIVE_PACKET_FLIGHT_EXTRA_MAX_MS,
  LIVE_PACKET_FLIGHT_HOP_MS,
  LIVE_VIEWPORT_PADDING_PX,
  MAX_HOPS_PER_PACKET,
  MAX_MATRIX_FLIGHT_BYTES,
  MAX_RAIN_BYTES,
  liveVisualCaps,
  type Coord,
  type LiveAnimation,
  type LiveAnimationRequest,
  type LiveHeatPoint,
  type LivePulse,
  type LiveRainDrop,
} from "./live-visuals";

interface MutableRef<T> {
  current: T;
}

type LiveNodeMarkerRole = "tx" | "relay" | "rx";

const liveNodeActivityTimers = new WeakMap<MapLibreMap, Map<string, number>>();
const liveNodeActivityState = new WeakMap<MapLibreMap, Map<string, { role: LiveNodeMarkerRole; updatedAt: number }>>();

function key(value: string): string {
  return value.trim().toLowerCase();
}

export function buildNodeCoordMaps(nodes: NodeSummary[]) {
  const byKey = new Map<string, LiveRouteNode>();
  const byPathPrefix = new Map<string, LiveRouteNode[]>();

  for (const node of nodes) {
    const nodeCoord = toValidGeoCoord(node.lat, node.lng);
    if (!nodeCoord) continue;
    const coord: LiveRouteNode = {
      id: node.id,
      name: nullableDisplayLabel(node.name),
      publicKey: node.publicKey,
      lng: nodeCoord.lng,
      lat: nodeCoord.lat,
      iatas: node.iatas.map((i) => i.iata.toUpperCase()),
    };
    byKey.set(key(node.id), coord);
    byKey.set(key(node.publicKey), coord);
    if (node.observerId) byKey.set(key(node.observerId), coord);
    const publicKey = node.publicKey.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    for (let length = 2; length <= Math.min(16, publicKey.length); length += 2) {
      const prefix = publicKey.slice(0, length);
      const bucket = byPathPrefix.get(prefix) ?? [];
      bucket.push(coord);
      byPathPrefix.set(prefix, bucket);
    }
  }

  return { byKey, byPathPrefix };
}

export function buildIataCoordMap(iatas: IataCode[] | undefined): Map<string, Coord> {
  const map = new Map<string, Coord>();
  for (const iata of iatas ?? []) {
    const coord = toValidGeoCoord(iata.lat, iata.lon);
    if (!coord) continue;
    map.set(iata.iata.toUpperCase(), coord);
  }
  return map;
}

export function resolveObserverTarget(
  event: LivePacketEvent,
  nodeCoords: Map<string, LiveRouteNode>,
  iataCoords: Map<string, Coord>,
): { coord: Coord; node: LiveRouteNode | null; label: string } | null {
  const observerNode = nodeCoords.get(key(event.observerId));
  if (observerNode) {
    return {
      coord: { lat: observerNode.lat, lng: observerNode.lng },
      node: observerNode,
      label: observerNode.name || observerNode.publicKey.slice(0, 8),
    };
  }

  const iataCoord = iataCoords.get(event.iata.toUpperCase());
  if (!iataCoord) return null;
  return { coord: iataCoord, node: null, label: event.iata.toUpperCase() };
}

export function coordInMapViewport(map: MapLibreMap, coord: Coord, paddingPx = LIVE_VIEWPORT_PADDING_PX): boolean {
  if (!toValidGeoCoord(coord.lat, coord.lng)) return false;
  const container = map.getContainer();
  const width = container.clientWidth || container.getBoundingClientRect().width || 1;
  const height = container.clientHeight || container.getBoundingClientRect().height || 1;
  const point = map.project([coord.lng, coord.lat]);
  return point.x >= -paddingPx && point.x <= width + paddingPx && point.y >= -paddingPx && point.y <= height + paddingPx;
}

export function pathHasVisibleNode(map: MapLibreMap, path: Array<{ coord: Coord }>, paddingPx = LIVE_VIEWPORT_PADDING_PX): boolean {
  return path.some((point) => coordInMapViewport(map, point.coord, paddingPx));
}

export function flashMapNodeActivity(
  map: MapLibreMap,
  nodeId: string | undefined,
  role: LiveNodeMarkerRole,
  durationMs = LIVE_NODE_ACTIVITY_MS,
): void {
  if (!nodeId || nodeId.includes(":") || !map.getSource(NODES_SOURCE_ID)) return;
  let timers = liveNodeActivityTimers.get(map);
  if (!timers) {
    timers = new Map();
    liveNodeActivityTimers.set(map, timers);
  }
  let states = liveNodeActivityState.get(map);
  if (!states) {
    states = new Map();
    liveNodeActivityState.set(map, states);
  }
  const priorTimer = timers.get(nodeId);
  if (priorTimer !== undefined) window.clearTimeout(priorTimer);

  const now = performance.now();
  const priorState = states.get(nodeId);
  if (!priorState || priorState.role !== role || now - priorState.updatedAt > LIVE_NODE_ACTIVITY_THROTTLE_MS) {
    try {
      map.setFeatureState({ source: NODES_SOURCE_ID, id: nodeId }, { active: true, activityRole: role });
      states.set(nodeId, { role, updatedAt: now });
    } catch {
      return;
    }
  }

  const timer = window.setTimeout(() => {
    timers?.delete(nodeId);
    states?.delete(nodeId);
    if (!map.getSource(NODES_SOURCE_ID)) return;
    try {
      map.setFeatureState({ source: NODES_SOURCE_ID, id: nodeId }, { active: false, activityRole: "" });
    } catch {
      /* source/style may have been replaced while the marker was fading */
    }
  }, durationMs);
  timers.set(nodeId, timer);
}

export function playLivePacketAnimation(options: {
  animationsRef: MutableRef<LiveAnimation[]>;
  byPathPrefix: Map<string, LiveRouteNode[]>;
  colorByHash: boolean;
  event: LivePacketEvent;
  heatRef: MutableRef<LiveHeatPoint[]>;
  iataCoords: Map<string, Coord>;
  map: MapLibreMap | null | undefined;
  matrixMode: boolean;
  matrixRain: boolean;
  nodeCoords: Map<string, LiveRouteNode>;
  playPacketAudio: (event: LivePacketEvent) => void;
  pulsesRef: MutableRef<LivePulse[]>;
  rainRef: MutableRef<LiveRainDrop[]>;
  requestCanvasFrame: (() => void) | null;
  visualPressureRef: MutableRef<number>;
  visualQueueRef: MutableRef<LiveAnimationRequest[]>;
  waveCount?: number;
  waveIndex?: number;
}): boolean {
  const {
    animationsRef,
    byPathPrefix,
    colorByHash,
    event,
    heatRef,
    iataCoords,
    map,
    matrixMode,
    matrixRain,
    nodeCoords,
    playPacketAudio,
    pulsesRef,
    rainRef,
    requestCanvasFrame,
    visualPressureRef,
    visualQueueRef,
    waveCount = 1,
    waveIndex = 0,
  } = options;
  if (!map) return false;
  const caps = liveVisualCaps(undefined, visualPressureRef.current);
  const color = colorByHash ? hashColor(event.packetHash) : payloadColor(event.payloadTypeName);
  const startedAt = performance.now();
  const observerTarget = resolveObserverTarget(event, nodeCoords, iataCoords);
  const path = buildTrueRoutePath(event, observerTarget?.node ?? null, byPathPrefix, MAX_HOPS_PER_PACKET);
  const routeFrom = path?.[0]?.coord;
  const routeTo = path?.at(-1)?.coord;
  const hasRoute = Boolean(routeFrom && routeTo && !sameRouteCoord(routeFrom, routeTo));
  const targetCoord = observerTarget?.coord ?? routeTo;
  if (!targetCoord && !hasRoute) return false;

  const pulsePath = path && path.length > 0 ? path : targetCoord ? [{ coord: targetCoord, label: observerTarget?.label ?? event.iata, nodeId: `${event.id}:target` }] : [];
  if (!pathHasVisibleNode(map, pulsePath)) return false;
  const flightDurationMs = hasRoute && path
    ? LIVE_PACKET_FLIGHT_BASE_MS + Math.min(LIVE_PACKET_FLIGHT_EXTRA_MAX_MS, Math.max(0, path.length - 2) * LIVE_PACKET_FLIGHT_HOP_MS)
    : 0;
  const activityPulses: LivePulse[] = [];
  const originPoint = pulsePath[0];
  const destinationPoint = pulsePath.at(-1);
  const originHeading = pulsePath[1]?.coord;
  const destinationHeading = pulsePath.length > 1 ? pulsePath.at(-2)?.coord : undefined;
  if (originPoint) {
    flashMapNodeActivity(map, originPoint.nodeId, pulsePath.length >= 2 ? "tx" : "rx");
    activityPulses.push({
      id: `${event.id}:origin:${originPoint.nodeId}`,
      coord: originPoint.coord,
      headingTo: originHeading,
      createdAt: startedAt,
      lifetimeMs: matrixMode ? 3_600 : 5_200,
      color,
      strength: Math.max(2.2, event.observationCount + 0.75),
      role: pulsePath.length >= 2 ? "origin" : "activity",
      label: pulsePath.length >= 2 ? "TX ORIGIN" : "LIVE NODE",
    });
  }
  const relayPulses = pulsePath.length > 2 ? pulsePath.slice(1, -1).slice(-4) : [];
  relayPulses.forEach((point, index) => {
    const hopIndex = pulsePath.indexOf(point);
    const routeFraction = pulsePath.length > 1 && hopIndex > 0 ? hopIndex / (pulsePath.length - 1) : (index + 1) / Math.max(2, relayPulses.length + 1);
    activityPulses.push({
      id: `${event.id}:relay:${point.nodeId}:${index}`,
      coord: point.coord,
      headingTo: pulsePath[hopIndex + 1]?.coord,
      createdAt: startedAt + (flightDurationMs ? Math.max(140, flightDurationMs * routeFraction * 0.78) : 120 * (index + 1)),
      lifetimeMs: matrixMode ? 2_400 : 3_300,
      color,
      strength: 1.35,
      role: "relay",
      label: "HOP",
    });
  });
  if (
    destinationPoint &&
    (!originPoint || pulsePath.length < 2 || !sameRouteCoord(originPoint.coord, destinationPoint.coord))
  ) {
    flashMapNodeActivity(map, destinationPoint.nodeId, "rx", LIVE_NODE_ACTIVITY_MS * 1.15);
    activityPulses.push({
      id: `${event.id}:destination:${destinationPoint.nodeId}`,
      coord: destinationPoint.coord,
      headingTo: destinationHeading,
      createdAt: startedAt + (flightDurationMs ? Math.max(520, flightDurationMs * 0.82) : Math.min(560, 140 * Math.max(1, pulsePath.length - 1))),
      lifetimeMs: matrixMode ? 4_200 : 6_000,
      color,
      strength: Math.max(2.3, event.observationCount + 0.85),
      role: "destination",
      label: "RX DEST",
    });
  }
  if (activityPulses.length > 0) {
    pulsesRef.current = [
      ...pulsesRef.current.slice(-Math.max(0, caps.pulses - activityPulses.length)),
      ...activityPulses,
    ].slice(-caps.pulses);
  }

  const heatSource = path && path.length > 0 ? path : targetCoord ? [{ coord: targetCoord }] : [];
  const heatPoints = heatSource.slice(-MAX_HOPS_PER_PACKET).map((point, index) => ({
    id: `${event.id}:heat:${index}`,
    coord: point.coord,
    createdAt: startedAt,
    lifetimeMs: 28_000,
    intensity: Math.max(1, Math.min(4, event.observationCount + 0.6)),
  }));
  heatRef.current = [...heatRef.current.slice(-Math.max(0, caps.heatPoints - heatPoints.length)), ...heatPoints].slice(-caps.heatPoints);

  if (matrixRain && rainRef.current.length < caps.rainDrops) {
    const shouldSampleRain = visualQueueRef.current.length < 12 || (event.sequence + hashSeed(event.packetHash)) % 3 === 0;
    const bytes = shouldSampleRain ? hexBytes(event.rawHex || event.packetHash, MAX_RAIN_BYTES) : [];
    if (bytes.length > 0) {
      const seed = hashSeed(`${event.packetHash}:${event.sequence}:rain`);
      const hopCount = Math.max(1, event.hopCount ?? 1);
      const maxYRatio = Math.min(1, Math.max(0.28, hopCount / 4));
      rainRef.current = [
        ...rainRef.current.slice(-(caps.rainDrops - 1)),
        {
          id: `${event.id}:rain`,
          bytes,
          xRatio: (seed % 10_000) / 10_000,
          createdAt: startedAt,
          durationMs: 1_300 + maxYRatio * 2_700,
          maxYRatio,
          color,
        },
      ];
    }
  }

  playPacketAudio(event);

  if (hasRoute && path && routeFrom && routeTo && animationsRef.current.length < caps.activeAnimations) {
    animationsRef.current = [
      ...animationsRef.current.slice(-(caps.activeAnimations - 1)),
      {
        id: event.id,
        event,
        from: routeFrom,
        to: routeTo,
        path,
        startedAt,
        durationMs: flightDurationMs,
        color,
        waveIndex,
        waveCount,
        bytes: hexBytes(event.rawHex || event.packetHash, MAX_MATRIX_FLIGHT_BYTES),
      },
    ];
  }

  requestCanvasFrame?.();
  return true;
}
