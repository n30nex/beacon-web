import type { NetgraphEdge, NetgraphNode, NetgraphPoint } from "./netgraph-model";

export const NETGRAPH_GLOBE_RADIUS = 108;
export const NETGRAPH_GEO_NODE_ALTITUDE = 3.6;
export const NETGRAPH_UNLOCATED_RADIUS = 158;

export type NetgraphLocationSource = "coordinates" | "iata-centroid" | "unlocated";

export interface NetgraphGeoPlacement {
  anchor: NetgraphPoint;
  position: NetgraphPoint;
  source: NetgraphLocationSource;
  sourceIata?: string;
}

interface GeographicNode {
  id: string;
  lat?: number;
  lng?: number;
  iatas: string[];
}

interface UnitPoint {
  x: number;
  y: number;
  z: number;
}

const EPSILON = 1e-8;

export function hasFiniteCoordinates(node: Pick<GeographicNode, "lat" | "lng">): node is GeographicNode & { lat: number; lng: number } {
  return Number.isFinite(node.lat) && Number.isFinite(node.lng) && Math.abs(node.lat!) <= 90 && Math.abs(node.lng!) <= 180;
}

export function projectLatLngToSphere(lat: number, lng: number, radius = NETGRAPH_GLOBE_RADIUS): NetgraphPoint {
  const latitude = clamp(lat, -90, 90) * Math.PI / 180;
  const longitude = normalizeLongitude(lng) * Math.PI / 180;
  const horizontal = Math.cos(latitude);
  return {
    x: radius * horizontal * Math.sin(longitude),
    y: radius * Math.sin(latitude),
    z: radius * horizontal * Math.cos(longitude),
  };
}

export function buildGeoPlacements(nodes: GeographicNode[], radius = NETGRAPH_GLOBE_RADIUS): Map<string, NetgraphGeoPlacement> {
  const placements = new Map<string, NetgraphGeoPlacement>();
  const iataVectors = new Map<string, UnitPoint[]>();

  for (const node of nodes) {
    if (!hasFiniteCoordinates(node)) continue;
    const unit = normalizePoint(projectLatLngToSphere(node.lat, node.lng, 1));
    for (const iata of normalizedIatas(node.iatas)) {
      const vectors = iataVectors.get(iata) ?? [];
      vectors.push(unit);
      iataVectors.set(iata, vectors);
    }
  }

  const iataCentroids = new Map<string, UnitPoint>();
  for (const [iata, vectors] of iataVectors) {
    const total = vectors.reduce<UnitPoint>((sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }), { x: 0, y: 0, z: 0 });
    const normalized = normalizePoint(total);
    if (length(normalized) > EPSILON) iataCentroids.set(iata, normalized);
  }

  const anchored = new Map<string, Array<{ node: GeographicNode; anchorUnit: UnitPoint; source: Exclude<NetgraphLocationSource, "unlocated">; sourceIata?: string }>>();
  const unlocated: GeographicNode[] = [];

  for (const node of nodes) {
    let anchorUnit: UnitPoint | undefined;
    let source: Exclude<NetgraphLocationSource, "unlocated"> = "coordinates";
    let sourceIata: string | undefined;
    if (hasFiniteCoordinates(node)) {
      anchorUnit = normalizePoint(projectLatLngToSphere(node.lat, node.lng, 1));
    } else {
      source = "iata-centroid";
      sourceIata = normalizedIatas(node.iatas).find((iata) => iataCentroids.has(iata));
      anchorUnit = sourceIata ? iataCentroids.get(sourceIata) : undefined;
    }
    if (!anchorUnit) {
      unlocated.push(node);
      continue;
    }
    const key = `${anchorUnit.x.toFixed(6)}:${anchorUnit.y.toFixed(6)}:${anchorUnit.z.toFixed(6)}`;
    const group = anchored.get(key) ?? [];
    group.push({ node, anchorUnit, source, sourceIata });
    anchored.set(key, group);
  }

  for (const group of anchored.values()) {
    group.sort((left, right) => left.node.id.localeCompare(right.node.id));
    group.forEach((item, index) => {
      const positionUnit = spreadCoincidentAnchor(item.anchorUnit, index, group.length, item.node.id);
      const anchor = scalePoint(item.anchorUnit, radius);
      placements.set(item.node.id, {
        anchor,
        position: scalePoint(positionUnit, radius + NETGRAPH_GEO_NODE_ALTITUDE),
        source: item.source,
        sourceIata: item.sourceIata,
      });
    });
  }

  unlocated.sort((left, right) => left.id.localeCompare(right.id));
  unlocated.forEach((node, index) => {
    const count = Math.max(1, unlocated.length);
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const band = (stableUnit(node.id, "unlocated-band") - 0.5) * 30;
    const position = {
      x: Math.cos(angle) * NETGRAPH_UNLOCATED_RADIUS,
      y: band,
      z: Math.sin(angle) * NETGRAPH_UNLOCATED_RADIUS,
    };
    placements.set(node.id, {
      anchor: position,
      position,
      source: "unlocated",
    });
  });

  return placements;
}

export function sampleGreatCirclePath(
  from: NetgraphPoint,
  to: NetgraphPoint,
  samples = 24,
  globeRadius = NETGRAPH_GLOBE_RADIUS,
): NetgraphPoint[] {
  const count = Math.max(2, Math.floor(samples));
  const startLength = Math.max(EPSILON, length(from));
  const endLength = Math.max(EPSILON, length(to));
  const start = normalizePoint(from);
  const end = normalizePoint(to);
  const dot = clamp(dotPoint(start, end), -1, 1);
  const angle = Math.acos(dot);
  const lift = Math.min(globeRadius * 0.34, globeRadius * (0.055 + angle * 0.085));
  const points: NetgraphPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    let direction: UnitPoint;
    if (angle < 1e-5) {
      direction = normalizePoint(lerpPoint(start, end, t));
    } else if (Math.PI - angle < 1e-4) {
      const tangent = stableTangent(start, "antipodal");
      direction = normalizePoint({
        x: start.x * Math.cos(Math.PI * t) + tangent.x * Math.sin(Math.PI * t),
        y: start.y * Math.cos(Math.PI * t) + tangent.y * Math.sin(Math.PI * t),
        z: start.z * Math.cos(Math.PI * t) + tangent.z * Math.sin(Math.PI * t),
      });
    } else {
      const sinAngle = Math.sin(angle);
      const startWeight = Math.sin((1 - t) * angle) / sinAngle;
      const endWeight = Math.sin(t * angle) / sinAngle;
      direction = normalizePoint({
        x: start.x * startWeight + end.x * endWeight,
        y: start.y * startWeight + end.y * endWeight,
        z: start.z * startWeight + end.z * endWeight,
      });
    }
    const endpointRadius = startLength + (endLength - startLength) * t;
    const arcRadius = Math.max(globeRadius + NETGRAPH_GEO_NODE_ALTITUDE, endpointRadius) + Math.sin(Math.PI * t) * lift;
    points.push(scalePoint(direction, arcRadius));
  }
  points[0] = { ...from };
  points[points.length - 1] = { ...to };
  return points;
}

export function buildEdgePathMap(
  nodes: NetgraphNode[],
  edges: NetgraphEdge[],
  layoutMode: "geo" | "galaxy",
  globeRadius = NETGRAPH_GLOBE_RADIUS,
): Map<string, NetgraphPoint[]> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const paths = new Map<string, NetgraphPoint[]>();
  for (const edge of edges) {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (!from || !to) continue;
    const located = from.locationSource !== "unlocated" && to.locationSource !== "unlocated";
    const samples = layoutMode === "geo" && located ? greatCircleSampleCount(from.position, to.position) : 2;
    paths.set(edge.id, samples > 2
      ? sampleGreatCirclePath(from.position, to.position, samples, globeRadius)
      : [{ ...from.position }, { ...to.position }]);
  }
  return paths;
}

export function pointOnSampledPath(path: NetgraphPoint[] | undefined, progress: number): NetgraphPoint | null {
  if (!path || path.length === 0) return null;
  if (path.length === 1) return { ...path[0]! };
  const t = clamp(progress, 0, 1);
  const scaled = t * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  return lerpPoint(path[index]!, path[index + 1]!, scaled - index);
}

function spreadCoincidentAnchor(anchor: UnitPoint, index: number, count: number, id: string): UnitPoint {
  if (count <= 1) return anchor;
  const ring = Math.floor(Math.sqrt(index));
  const ringStart = ring * ring;
  const ringSlots = Math.max(1, (ring + 1) * (ring + 1) - ringStart);
  const slot = index - ringStart;
  const phase = stableUnit(id, "coincident-phase") * 0.22;
  const angle = (slot / ringSlots) * Math.PI * 2 + phase;
  const angularOffset = 0.018 + ring * 0.012;
  const tangentA = stableTangent(anchor, "coincident-a");
  const tangentB = normalizePoint(crossPoint(anchor, tangentA));
  return normalizePoint({
    x: anchor.x + (tangentA.x * Math.cos(angle) + tangentB.x * Math.sin(angle)) * angularOffset,
    y: anchor.y + (tangentA.y * Math.cos(angle) + tangentB.y * Math.sin(angle)) * angularOffset,
    z: anchor.z + (tangentA.z * Math.cos(angle) + tangentB.z * Math.sin(angle)) * angularOffset,
  });
}

function stableTangent(normal: UnitPoint, salt: string): UnitPoint {
  const reference = Math.abs(normal.y) < 0.88
    ? { x: 0, y: 1, z: 0 }
    : { x: stableUnit(salt, "pole") > 0.5 ? 1 : -1, y: 0, z: 0 };
  return normalizePoint(crossPoint(reference, normal));
}

function greatCircleSampleCount(from: NetgraphPoint, to: NetgraphPoint): number {
  const angle = Math.acos(clamp(dotPoint(normalizePoint(from), normalizePoint(to)), -1, 1));
  return Math.max(12, Math.min(36, Math.ceil(12 + angle * 9)));
}

function normalizedIatas(iatas: string[]): string[] {
  return Array.from(new Set(iatas.map((iata) => iata.trim().toUpperCase()).filter(Boolean))).sort();
}

function normalizeLongitude(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function length(point: NetgraphPoint): number {
  return Math.hypot(point.x, point.y, point.z);
}

function normalizePoint(point: NetgraphPoint): UnitPoint {
  const magnitude = length(point);
  if (magnitude < EPSILON) return { x: 0, y: 0, z: 1 };
  return { x: point.x / magnitude, y: point.y / magnitude, z: point.z / magnitude };
}

function scalePoint(point: NetgraphPoint, scalar: number): NetgraphPoint {
  return { x: point.x * scalar, y: point.y * scalar, z: point.z * scalar };
}

function lerpPoint(from: NetgraphPoint, to: NetgraphPoint, t: number): NetgraphPoint {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function dotPoint(left: NetgraphPoint, right: NetgraphPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossPoint(left: NetgraphPoint, right: NetgraphPoint): UnitPoint {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function stableUnit(value: string, salt: string): number {
  let hash = 2166136261;
  const source = `${salt}:${value}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
