import * as THREE from "three";

import {
  selectedNodeRouteEdgeIds,
  type NetgraphGraph,
  type NetgraphLayoutMode,
  type NetgraphNode,
  type NetgraphPoint,
  type NetgraphPulse,
  type NetgraphRole,
} from "./netgraph-model";
import { buildEdgePathMap, pointOnSampledPath } from "./netgraph-geo";

const EDGE_LOW = new THREE.Color("#25b7a8");
const EDGE_MID = new THREE.Color("#78d641");
const EDGE_HIGH = new THREE.Color("#ffd45a");
const GEO_NODE_VISUAL_SCALE = 0.18;

export function roleGeometry(role: NetgraphRole, highFidelity: boolean): THREE.BufferGeometry {
  switch (role) {
    case "repeater":
      return highFidelity
        ? new THREE.IcosahedronGeometry(1, 2)
        : new THREE.OctahedronGeometry(1, 0);
    case "companion":
      return new THREE.ConeGeometry(0.98, 1.7, highFidelity ? 7 : 3, highFidelity ? 4 : 1);
    case "room":
      return highFidelity
        ? new THREE.BoxGeometry(1.35, 1.35, 1.35, 3, 3, 3)
        : new THREE.BoxGeometry(1.35, 1.35, 1.35);
    case "observer":
      return new THREE.TorusGeometry(0.8, 0.18, highFidelity ? 14 : 8, highFidelity ? 56 : 28);
    case "sensor":
      return new THREE.CylinderGeometry(0.9, 0.9, 0.55, highFidelity ? 14 : 5, highFidelity ? 6 : 1);
    default:
      return new THREE.SphereGeometry(0.88, highFidelity ? 28 : 16, highFidelity ? 20 : 12);
  }
}

export function edgeBeamMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: THREE.Color,
  options: {
    emissiveIntensity: number;
    highFidelity: boolean;
    radius: number;
    opacity: number;
    map?: THREE.Texture | null;
  },
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const length = Math.max(0.001, delta.length());
  const geometry = new THREE.CylinderGeometry(options.radius, options.radius, length, options.highFidelity ? 10 : 6, 1, true);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: options.emissiveIntensity,
    map: options.map ?? undefined,
    metalness: 0.04,
    roughness: 0.24,
    transparent: true,
    opacity: options.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.renderOrder = 3;
  return mesh;
}

export function edgeBeamOpacityForDensity(visibleDensity: number, selected: boolean): number {
  if (selected) return visibleDensity * 1.15;
  if (visibleDensity >= 0.6) return visibleDensity * 0.85;
  return visibleDensity * 1.05;
}

export function nodeScale(node: NetgraphNode, visualScale = 1): number {
  return node.radius * visualScale;
}

export function nodeScaleFactorForLayout(layoutMode: NetgraphLayoutMode, visualScale = 1): number {
  return visualScale * (layoutMode === "geo" ? GEO_NODE_VISUAL_SCALE : 1);
}

export function colorForEdge(edgeObservationCount: number): THREE.Color {
  if (edgeObservationCount >= 50) return EDGE_HIGH;
  if (edgeObservationCount >= 12) return EDGE_MID;
  return EDGE_LOW;
}

export function nodeMissingGeo(node: NetgraphNode): boolean {
  return node.lat == null || node.lng == null;
}

export function edgePositions(graph: NetgraphGraph, edgeIds?: Set<string>): Float32Array {
  const values: number[] = [];
  for (const edge of graph.edges) {
    if (edgeIds && !edgeIds.has(edge.id)) continue;
    const path = graph.edgePaths.get(edge.id);
    if (!path) continue;
    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index]!;
      const to = path[index + 1]!;
      values.push(from.x, from.y, from.z, to.x, to.y, to.z);
    }
  }
  return new Float32Array(values);
}

export function nodePosition(node: NetgraphNode): THREE.Vector3 {
  return new THREE.Vector3(node.position.x, node.position.y, node.position.z);
}

export function graphWithPositions(graph: NetgraphGraph, positions: Map<string, NetgraphPoint>): NetgraphGraph {
  if (positions.size === 0) return graph;
  const nodes = graph.nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
  return {
    ...graph,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edgePaths: buildEdgePathMap(nodes, graph.edges, graph.layoutMode, graph.globeRadius),
  };
}

export function visibleEdgeIdsForNodes(graph: NetgraphGraph, nodeIds: Set<string>): Set<string> {
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)) edges.add(edge.id);
  }
  return edges;
}

export function intersectSets(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of a) {
    if (b.has(value)) out.add(value);
  }
  return out;
}

export function edgeColors(graph: NetgraphGraph, edgeIds?: Set<string>): Float32Array {
  const values: number[] = [];
  for (const edge of graph.edges) {
    if (edgeIds && !edgeIds.has(edge.id)) continue;
    const color = colorForEdge(edge.observationCount);
    const segmentCount = Math.max(0, (graph.edgePaths.get(edge.id)?.length ?? 1) - 1);
    for (let index = 0; index < segmentCount; index += 1) {
      values.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  return new Float32Array(values);
}

export function routeIdForEdge(graph: NetgraphGraph, edgeId: string): number | null {
  return graph.edgeById.get(edgeId)?.routeIds[0] ?? null;
}

export function nearestEdgeId(graph: NetgraphGraph, camera: THREE.Camera, rect: DOMRect, clientX: number, clientY: number, edgeIds?: Set<string>): string | null {
  let bestId: string | null = null;
  let bestDistance = 12;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  for (const edge of graph.edges) {
    if (edgeIds && !edgeIds.has(edge.id)) continue;
    const path = graph.edgePaths.get(edge.id);
    if (!path) continue;
    for (let index = 0; index < path.length - 1; index += 1) {
      const a = path[index]!;
      const b = path[index + 1]!;
      from.set(a.x, a.y, a.z).project(camera);
      to.set(b.x, b.y, b.z).project(camera);
      if (Math.abs(from.z) > 1 || Math.abs(to.z) > 1) continue;
      const ax = (from.x * 0.5 + 0.5) * rect.width;
      const ay = (-from.y * 0.5 + 0.5) * rect.height;
      const bx = (to.x * 0.5 + 0.5) * rect.width;
      const by = (-to.y * 0.5 + 0.5) * rect.height;
      const distance = distanceToSegment(clientX - rect.left, clientY - rect.top, ax, ay, bx, by);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = edge.id;
      }
    }
  }
  return bestId;
}

export function nearestProjectedNode(graph: NetgraphGraph, camera: THREE.Camera, rect: DOMRect, clientX: number, clientY: number, threshold: number, nodeIds?: Set<string>): NetgraphNode | null {
  let bestNode: NetgraphNode | null = null;
  let bestDistance = threshold;
  const projected = new THREE.Vector3();
  for (const node of graph.nodes) {
    if (nodeIds && !nodeIds.has(node.id)) continue;
    projected.set(node.position.x, node.position.y, node.position.z).project(camera);
    if (Math.abs(projected.z) > 1) continue;
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    const distance = Math.hypot(clientX - rect.left - x, clientY - rect.top - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = node;
    }
  }
  return bestNode;
}

export function edgeFocusPoint(graph: NetgraphGraph, edgeId: string): THREE.Vector3 | null {
  const point = pointOnSampledPath(graph.edgePaths.get(edgeId), 0.5);
  return point ? new THREE.Vector3(point.x, point.y, point.z) : null;
}

export function selectedRouteFocus(graph: NetgraphGraph, routeId: number | null | undefined): { center: THREE.Vector3; span: number } | null {
  const points: THREE.Vector3[] = [];
  for (const edge of graph.edgeByRouteId.get(routeId ?? -1) ?? []) {
    for (const point of graph.edgePaths.get(edge.id) ?? []) points.push(new THREE.Vector3(point.x, point.y, point.z));
  }
  if (points.length === 0) return null;
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  return { center: box.getCenter(new THREE.Vector3()), span: Math.max(size.x, size.y, size.z, 8) };
}

export function selectedRouteWaypoints(graph: NetgraphGraph, routeId: number | null | undefined): THREE.Vector3[] {
  const waypoints: THREE.Vector3[] = [];
  for (const edge of graph.edgeByRouteId.get(routeId ?? -1) ?? []) {
    const path = graph.edgePaths.get(edge.id) ?? [];
    path.forEach((point, index) => {
      if (waypoints.length > 0 && index === 0) return;
      waypoints.push(new THREE.Vector3(point.x, point.y, point.z));
    });
  }
  return waypoints;
}

export function selectedNodeFocus(graph: NetgraphGraph, nodeId: string | null | undefined): { center: THREE.Vector3; span: number; node: NetgraphNode } | null {
  const node = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!node) return null;
  const points: THREE.Vector3[] = [nodePosition(node)];
  for (const id of selectedNodeRouteEdgeIds(graph, node.id)) {
    const edge = graph.edgeById.get(id);
    if (!edge) continue;
    const from = graph.nodeById.get(edge.fromId);
    const to = graph.nodeById.get(edge.toId);
    if (from) points.push(nodePosition(from));
    if (to) points.push(nodePosition(to));
  }
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  return { center: box.getCenter(new THREE.Vector3()), span: Math.max(size.x, size.y, size.z, 12), node };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function pulseProgress(pulse: NetgraphPulse, now: number): { segmentIndex: number; local: number } | null {
  const elapsed = now - pulse.startedAt;
  if (elapsed < 0 || elapsed > pulse.durationMs || pulse.segments.length === 0) return null;
  const progress = elapsed / pulse.durationMs;
  const scaled = progress * pulse.segments.length;
  const segmentIndex = Math.min(pulse.segments.length - 1, Math.floor(scaled));
  return { segmentIndex, local: scaled - segmentIndex };
}

export function positionOnEdge(graph: NetgraphGraph, edgeId: string, local: number, reverse: boolean): THREE.Vector3 | null {
  const t = reverse ? 1 - local : local;
  const point = pointOnSampledPath(graph.edgePaths.get(edgeId), t);
  return point ? new THREE.Vector3(point.x, point.y, point.z) : null;
}

export function positionForPulseLocal(graph: NetgraphGraph, pulse: NetgraphPulse, segmentIndex: number, local: number): THREE.Vector3 | null {
  const segment = pulse.segments[segmentIndex];
  if (!segment) return null;
  return positionOnEdge(graph, segment.edgeId, clamp(local, 0, 1), segment.reverse);
}
