import type { NetgraphSnapshot, NetgraphSnapshotEdge, NetgraphSnapshotNode } from "../../types/api";
import type { WsPacketObservation } from "../../types/ws";
import { payloadColor, payloadLabel } from "../live/live-model";

export const NETGRAPH_ROUTE_LIMITS = [800, 1600, 2500] as const;
export type NetgraphRouteLimit = (typeof NETGRAPH_ROUTE_LIMITS)[number];
export const DEFAULT_NETGRAPH_ROUTE_LIMIT: NetgraphRouteLimit = 2500;
export const MAX_NETGRAPH_ROUTES = 2500;
export const MAX_NETGRAPH_NODES = 2600;
export const MAX_NETGRAPH_EDGES = 4200;
export const MAX_NETGRAPH_PULSES = 360;
export const MAX_NETGRAPH_GLOWS = 220;
export const NETGRAPH_LAYOUT_WIDTH = 144;
export const NETGRAPH_LAYOUT_HEIGHT = 92;
export const NETGRAPH_LAYOUT_DEPTH = 340;

const NETGRAPH_LAYOUT_DEPTH_MIN = 150;
const NETGRAPH_LAYOUT_DEPTH_SOFT_MAX = 780;
const NETGRAPH_FOCUS_DIRECT_RADIUS_BASE = 102;
const NETGRAPH_FOCUS_DIRECT_RADIUS_GROWTH = 14;
const NETGRAPH_FOCUS_CONTEXT_RADIUS_BASE = 206;
const NETGRAPH_FOCUS_CONTEXT_RADIUS_GROWTH = 18.4;
const NETGRAPH_FOCUS_DEPTH_SCALE = 2.45;

export interface NetgraphGalaxyProfile {
  seedShape: "spherical" | "spiral";
  clusterScale: number;
  spiralIntensity: number;
  depthContrast: number;
  settleStrength: number;
  edgeSpacingScale: number;
}

export interface NetgraphVisualProfile {
  autoRotateSpeed: number;
  orbitControlSpeed: number;
  orbitDamping: number;
  nodeScale: number;
  labelScale: number;
  edgeOpacity: number;
  labelDensity: number;
  pulseDensity: number;
  glowDensity: number;
  glowIntensity: number;
  starDensity: number;
  cameraFov: number;
  lightIntensity: number;
  atmosphereDensity: number;
  cameraDistanceScale: number;
  focusHaloScale: number;
}

export type NetgraphExperienceMode = "galaxy" | "focus" | "routes" | "live";
export type NetgraphCinematicPreset = "cinematic" | "clarity" | "performance" | "presentation";
export type NetgraphRenderTierName = "cinematic" | "balanced" | "battery";

export interface NetgraphRenderTier {
  name: NetgraphRenderTierName;
  effectScale: number;
  labelBudgetScale: number;
  textureQuality: "high" | "standard" | "minimal";
  guidedIntro: boolean;
  cometScale: number;
}

export const DEFAULT_NETGRAPH_GALAXY_PROFILE: NetgraphGalaxyProfile = {
  seedShape: "spherical",
  clusterScale: 1.92,
  spiralIntensity: 0.58,
  depthContrast: 2.72,
  settleStrength: 1.48,
  edgeSpacingScale: 1.82,
};

export const DEFAULT_NETGRAPH_VISUAL_PROFILE: NetgraphVisualProfile = {
  autoRotateSpeed: 1.72,
  orbitControlSpeed: 1,
  orbitDamping: 0.07,
  nodeScale: 2.35,
  labelScale: 1,
  edgeOpacity: 1,
  labelDensity: 1,
  pulseDensity: 1,
  glowDensity: 1,
  glowIntensity: 1,
  starDensity: 1,
  cameraFov: 48,
  lightIntensity: 1,
  atmosphereDensity: 1,
  cameraDistanceScale: 0.92,
  focusHaloScale: 1,
};

export type NetgraphCameraMode = "orbit" | "flight" | "touch-flight";
export type NetgraphFocusState = "overview" | "transitioning" | "neighborhood";

export type NetgraphRole = "repeater" | "companion" | "room" | "observer" | "sensor" | "other";
export type NetgraphViewMode = NetgraphExperienceMode;
export type NetgraphQualityMode = "auto" | "high" | "balanced" | "battery";

export interface NetgraphPoint {
  x: number;
  y: number;
  z: number;
}

export interface NetgraphNode extends NetgraphSnapshotNode {
  label: string;
  role: NetgraphRole;
  degree: number;
  radius: number;
  position: NetgraphPoint;
  seed: NetgraphPoint;
  componentId: number;
  componentX: number;
  componentY: number;
  searchText: string;
}

export interface NetgraphEdge extends NetgraphSnapshotEdge {
  fromIndex: number;
  toIndex: number;
  fromId: string;
  toId: string;
}

export interface NetgraphGraph {
  serverTime: number;
  stats: NetgraphSnapshot["stats"];
  limits: NetgraphSnapshot["limits"];
  nodes: NetgraphNode[];
  edges: NetgraphEdge[];
  nodeById: Map<string, NetgraphNode>;
  edgeById: Map<string, NetgraphEdge>;
  edgeByRouteId: Map<number, NetgraphEdge[]>;
}

export type NetgraphFocusShell = "origin" | "direct" | "context";

export interface NetgraphFocusedNode {
  id: string;
  shell: NetgraphFocusShell;
  position: NetgraphPoint;
}

export interface NetgraphFocusedNeighborhood {
  nodeId: string;
  nodes: NetgraphFocusedNode[];
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  directNodeIds: Set<string>;
  contextNodeIds: Set<string>;
  positions: Map<string, NetgraphPoint>;
  visibility: Set<string>;
}

export interface NetgraphPulseSegment {
  edgeId: string;
  fromId: string;
  toId: string;
  reverse: boolean;
}

export interface NetgraphPulse {
  id: string;
  payloadTypeName: string;
  color: string;
  txNodeId?: string;
  rxNodeId?: string;
  txColor: string;
  rxColor: string;
  startedAt: number;
  durationMs: number;
  segments: NetgraphPulseSegment[];
}

export interface NetgraphGlow {
  id: string;
  nodeId: string;
  payloadTypeName: string;
  color: string;
  direction: "tx" | "rx";
  startedAt: number;
  durationMs: number;
}

export type NetgraphLiveVisual =
  | { type: "pulse"; pulse: NetgraphPulse }
  | { type: "glow"; glow: NetgraphGlow }
  | null;

interface Component {
  nodes: NetgraphNode[];
}

export function buildNetgraph(snapshot: NetgraphSnapshot | undefined, profile?: NetgraphGalaxyProfile): NetgraphGraph {
  const safeSnapshot = snapshot ?? emptySnapshot();
  const nodeDrafts = safeSnapshot.nodes.map((node) => nodeFromSnapshot(node));
  const byId = new Map(nodeDrafts.map((node) => [node.id, node]));
  const edges: NetgraphEdge[] = [];
  const depthEnvelope = netgraphDepthEnvelope(nodeDrafts.length, safeSnapshot.edges.length);
  const safeProfile = normalizeGalaxyProfile(profile);
  for (const edge of safeSnapshot.edges) {
    const fromIndex = nodeDrafts.findIndex((node) => node.id === edge.fromNodeId);
    const toIndex = nodeDrafts.findIndex((node) => node.id === edge.toNodeId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) continue;
    const next = {
      ...edge,
      fromIndex,
      toIndex,
      fromId: edge.fromNodeId,
      toId: edge.toNodeId,
    };
    edges.push(next);
    byId.get(next.fromId)!.degree += 1;
    byId.get(next.toId)!.degree += 1;
  }
  const seeded = applySeedLayout(nodeDrafts, edges, NETGRAPH_LAYOUT_WIDTH, NETGRAPH_LAYOUT_HEIGHT, depthEnvelope, safeProfile);
  const nodeById = new Map(seeded.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const edgeByRouteId = new Map<number, NetgraphEdge[]>();
  for (const edge of edges) {
    for (const routeId of edge.routeIds) {
      const list = edgeByRouteId.get(routeId) ?? [];
      list.push(edge);
      edgeByRouteId.set(routeId, list);
    }
  }
  return {
    serverTime: safeSnapshot.serverTime,
    stats: safeSnapshot.stats,
    limits: safeSnapshot.limits,
    nodes: seeded,
    edges,
    nodeById,
    edgeById,
    edgeByRouteId,
  };
}

export function normalizeGalaxyProfile(profile?: NetgraphGalaxyProfile): NetgraphGalaxyProfile {
  const raw = profile ?? DEFAULT_NETGRAPH_GALAXY_PROFILE;
  return {
    seedShape: raw.seedShape === "spiral" ? "spiral" : "spherical",
    clusterScale: clamp(raw.clusterScale, 0.6, 2.1),
    spiralIntensity: clamp(raw.spiralIntensity, 0, 1),
    depthContrast: clamp(raw.depthContrast, 0.45, 2.8),
    settleStrength: clamp(raw.settleStrength, 0.4, 2),
    edgeSpacingScale: clamp(raw.edgeSpacingScale, 0.5, 2),
  };
}

export function normalizeVisualProfile(profile?: NetgraphVisualProfile): NetgraphVisualProfile {
  const raw = profile ?? DEFAULT_NETGRAPH_VISUAL_PROFILE;
  return {
    autoRotateSpeed: clamp(raw.autoRotateSpeed, 0, 2.4),
    orbitControlSpeed: clamp(raw.orbitControlSpeed, 0.3, 2.7),
    orbitDamping: clamp(raw.orbitDamping, 0.04, 0.22),
    nodeScale: clamp(raw.nodeScale, 0.5, 3),
    labelScale: clamp(raw.labelScale, 0.4, 2.4),
    edgeOpacity: clamp(raw.edgeOpacity, 0.15, 1.75),
    labelDensity: clamp(raw.labelDensity, 0.2, 2.2),
    pulseDensity: clamp(raw.pulseDensity, 0, 2.2),
    glowDensity: clamp(raw.glowDensity, 0, 2.2),
    glowIntensity: clamp(raw.glowIntensity, 0.35, 2.8),
    starDensity: clamp(raw.starDensity, 0.2, 2.0),
    cameraFov: clamp(raw.cameraFov, 24, 84),
    lightIntensity: clamp(raw.lightIntensity, 0.35, 2.2),
    atmosphereDensity: clamp(raw.atmosphereDensity, 0.25, 2.2),
    cameraDistanceScale: clamp(raw.cameraDistanceScale, 0.45, 1.95),
    focusHaloScale: clamp(raw.focusHaloScale, 0.2, 2.4),
  };
}

export function resolveNetgraphRenderTier({
  denseGraph,
  lowPowerHardware,
  narrowViewport,
  qualityMode,
  reducedMotion,
}: {
  denseGraph: boolean;
  lowPowerHardware: boolean;
  narrowViewport: boolean;
  qualityMode: NetgraphQualityMode;
  reducedMotion: boolean;
}): NetgraphRenderTier {
  if (qualityMode === "battery" || reducedMotion) {
    return {
      name: "battery",
      effectScale: reducedMotion ? 0 : 0.42,
      labelBudgetScale: 0.54,
      textureQuality: "minimal",
      guidedIntro: false,
      cometScale: 0.42,
    };
  }
  if (qualityMode === "balanced" || (qualityMode === "auto" && (lowPowerHardware || denseGraph || narrowViewport))) {
    return {
      name: "balanced",
      effectScale: narrowViewport ? 0.62 : 0.74,
      labelBudgetScale: narrowViewport ? 0.62 : 0.72,
      textureQuality: "standard",
      guidedIntro: qualityMode !== "balanced",
      cometScale: narrowViewport ? 0.7 : 0.82,
    };
  }
  return {
    name: "cinematic",
    effectScale: 1,
    labelBudgetScale: 1,
    textureQuality: "high",
    guidedIntro: true,
    cometScale: 1,
  };
}

export function applyLayoutPositions(graph: NetgraphGraph, positions: Map<string, NetgraphPoint>): NetgraphGraph {
  const nodes = graph.nodes.map((node) => {
    const point = positions.get(node.id);
    return point ? { ...node, position: point } : node;
  });
  return {
    ...graph,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
  };
}

export function graphSearchMatches(graph: NetgraphGraph, query: string): Set<string> {
  const needle = query.trim().toLowerCase();
  if (!needle) return new Set();
  const matches = new Set<string>();
  for (const node of graph.nodes) {
    if (node.searchText.includes(needle)) matches.add(node.id);
  }
  for (const edge of graph.edges) {
    const edgeText = `${edge.id} ${edge.iatas.join(" ")} ${edge.routeIds.join(" ")}`.toLowerCase();
    if (!edgeText.includes(needle)) continue;
    matches.add(edge.fromId);
    matches.add(edge.toId);
  }
  return matches;
}

export function selectedRouteEdgeIds(graph: NetgraphGraph, routeId: number | null | undefined): Set<string> {
  if (routeId == null) return new Set();
  return new Set((graph.edgeByRouteId.get(routeId) ?? []).map((edge) => edge.id));
}

export function selectedRouteNodeIds(graph: NetgraphGraph, routeId: number | null | undefined): Set<string> {
  const nodes = new Set<string>();
  for (const edge of graph.edgeByRouteId.get(routeId ?? -1) ?? []) {
    nodes.add(edge.fromId);
    nodes.add(edge.toId);
  }
  return nodes;
}

export function selectedNodeRouteEdgeIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  const node = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!node) return new Set();
  const routeIds = new Set(node.routeIds);
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromId === node.id || edge.toId === node.id || edge.routeIds.some((routeId) => routeIds.has(routeId))) {
      edges.add(edge.id);
    }
  }
  return edges;
}

export function nodeDirectEdgeIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  const node = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!node) return new Set();
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromId === node.id || edge.toId === node.id) edges.add(edge.id);
  }
  return edges;
}

export function nodeDirectNeighborIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  const node = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!node) return new Set();
  const neighbors = new Set<string>([node.id]);
  for (const edge of graph.edges) {
    if (edge.fromId === node.id) neighbors.add(edge.toId);
    if (edge.toId === node.id) neighbors.add(edge.fromId);
  }
  return neighbors;
}

export function nodeSecondHopNeighborIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  const direct = nodeDirectNeighborIds(graph, nodeId);
  const node = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!node) return new Set();
  const secondHop = new Set<string>();
  for (const edge of graph.edges) {
    if (direct.has(edge.fromId) && !direct.has(edge.toId)) secondHop.add(edge.toId);
    if (direct.has(edge.toId) && !direct.has(edge.fromId)) secondHop.add(edge.fromId);
  }
  return secondHop;
}

export function focusedNodeNeighborhoodLayout(graph: NetgraphGraph, nodeId: string | null | undefined): NetgraphFocusedNeighborhood | null {
  const selected = nodeId ? graph.nodeById.get(nodeId) : null;
  if (!selected) return null;
  const directNodeIds = nodeDirectNeighborIds(graph, selected.id);
  const contextNodeIds = nodeSecondHopNeighborIds(graph, selected.id);

  directNodeIds.delete(selected.id);

  const sortedDirect = Array.from(directNodeIds).sort((a, b) => compareNodeIdsForFocus(graph, a, b));
  const sortedContext = Array.from(contextNodeIds).sort((a, b) => compareNodeIdsForFocus(graph, a, b));
  const focusedNodes: NetgraphFocusedNode[] = [
    { id: selected.id, shell: "origin", position: { x: 0, y: 0, z: 0 } },
  ];
  const nodeIds = new Set<string>([selected.id, ...sortedDirect, ...sortedContext]);
  const edgeIds = new Set<string>(
    graph.edges.filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)).map((edge) => edge.id),
  );

  const densityScale = focusDensityScale(graph.nodes.length, graph.edges.length);
  const graphScale = focusGraphScale(graph.nodes.length, graph.edges.length);
  const neighborhoodScale = focusNeighborhoodScale(graph.nodes.length, graph.edges.length, sortedDirect.length + sortedContext.length);
  const spacingScale = focusNeighborhoodSpacingScale(sortedDirect.length + sortedContext.length);
  const directRingScale = 1 + (spacingScale - 1) * 0.95;
  const contextRingScale = 1 + (spacingScale - 1) * 1.28;
  const innerRadius = focusDirectRadius(sortedDirect.length, densityScale, graphScale) * neighborhoodScale;
  const outerRadius = focusContextRadius(sortedContext.length, densityScale, graphScale) * neighborhoodScale;
  sortedDirect.forEach((id, index) => {
    focusedNodes.push({
      id,
      shell: "direct",
      position: orbitalShellPoint(id, index, sortedDirect.length, innerRadius * directRingScale),
    });
  });
  sortedContext.forEach((id, index) => {
    focusedNodes.push({
      id,
      shell: "context",
      position: orbitalShellPoint(id, index, sortedContext.length, outerRadius * contextRingScale),
    });
  });
  const positions = new Map(focusedNodes.map((node) => [node.id, node.position]));
  const visibility = new Set(focusedNodes.map((node) => node.id));
  visibility.add(selected.id);
  return {
    nodeId: selected.id,
    nodes: focusedNodes,
    nodeIds,
    edgeIds,
    directNodeIds: new Set([selected.id, ...sortedDirect]),
    contextNodeIds: new Set(sortedContext),
    visibility,
    positions,
  };
}

export function nodeFocusNeighborhoodVisibility(graph: NetgraphGraph, nodeId: string | null | undefined): NetgraphFocusedNeighborhood["visibility"] {
  const layout = focusedNodeNeighborhoodLayout(graph, nodeId);
  return layout?.visibility ?? new Set();
}

export function selectedNodeNeighborhoodNodeIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  return nodeNeighborhoodNodeIds(graph, nodeId);
}

function nodeNeighborhoodNodeIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  if (!nodeId || !graph.nodeById.has(nodeId)) return new Set();
  const direct = nodeDirectNeighborIds(graph, nodeId);
  const context = nodeSecondHopNeighborIds(graph, nodeId);
  const all = new Set([nodeId]);
  direct.forEach((item) => all.add(item));
  context.forEach((item) => all.add(item));
  return all;
}

export function selectedNodeNeighborhoodEdgeIds(graph: NetgraphGraph, nodeId: string | null | undefined): Set<string> {
  const neighborhood = selectedNodeNeighborhoodNodeIds(graph, nodeId);
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (neighborhood.has(edge.fromId) && neighborhood.has(edge.toId)) edges.add(edge.id);
  }
  return edges;
}

export function routePathPoints(graph: NetgraphGraph, routeId: number | null | undefined): NetgraphPoint[] {
  if (routeId == null) return [];
  const edges = graph.edgeByRouteId.get(routeId) ?? [];
  if (edges.length === 0) return [];
  const points: NetgraphPoint[] = [];
  for (const edge of edges) {
    const from = graph.nodeById.get(edge.fromId)?.position;
    const to = graph.nodeById.get(edge.toId)?.position;
    if (!from || !to) continue;
    if (points.length === 0) points.push(from);
    points.push(to);
  }
  return points;
}

export function packetObservationToNetgraphLiveVisual(
  event: WsPacketObservation["data"],
  graph: NetgraphGraph,
  now = Date.now(),
): NetgraphLiveVisual {
  const payloadTypeName = payloadLabel(event.packet.payloadTypeName);
  const color = payloadColor(payloadTypeName);
  const nodeIds = highConfidenceNodeIds(event);
  const txNodeId = nodeIds.find((nodeId) => graph.nodeById.has(nodeId));
  const observerNodeId = graph.nodeById.has(event.observation.observerId) ? event.observation.observerId : undefined;
  const rxNodeId = observerNodeId ?? nodeIds.slice().reverse().find((nodeId) => graph.nodeById.has(nodeId));
  const livePathIds = liveTrafficPathIds(nodeIds, observerNodeId);
  const segments =
    bridgedLiveSegments(graph, livePathIds.filter((nodeId) => graph.nodeById.has(nodeId))) ??
    adjacentLiveSegments(graph, livePathIds);
  if (segments && segments.length > 0) {
    return {
      type: "pulse",
      pulse: {
        id: `${event.packetHash}:${event.observation.id ?? event.observation.heardAt}`,
        payloadTypeName,
        color,
        txNodeId,
        rxNodeId,
        txColor: "#7ab7ff",
        rxColor: "#54e1a6",
        startedAt: now,
        durationMs: Math.min(5600, Math.max(2200, segments.length * 900)),
        segments,
      },
    };
  }
  const glowNodeId = rxNodeId ?? txNodeId;
  if (glowNodeId) {
    return {
      type: "glow",
      glow: {
        id: `glow:${event.packetHash}:${event.observation.id ?? event.observation.heardAt}`,
        nodeId: glowNodeId,
        payloadTypeName,
        color: glowNodeId === rxNodeId ? "#54e1a6" : color,
        direction: glowNodeId === rxNodeId ? "rx" : "tx",
        startedAt: now,
        durationMs: 3600,
      },
    };
  }
  return null;
}

function liveTrafficPathIds(nodeIds: string[], observerNodeId: string | undefined): string[] {
  const ids = [...nodeIds];
  if (observerNodeId && ids.at(-1) !== observerNodeId) ids.push(observerNodeId);
  return ids;
}

function adjacentLiveSegments(graph: NetgraphGraph, nodeIds: string[]): NetgraphPulseSegment[] | null {
  if (nodeIds.length < 2) return null;
  const segments: NetgraphPulseSegment[] = [];
  for (let i = 1; i < nodeIds.length; i += 1) {
    const segment = segmentBetween(graph, nodeIds[i - 1]!, nodeIds[i]!);
    if (segment) segments.push(segment);
  }
  return segments.length > 0 ? segments : null;
}

function bridgedLiveSegments(graph: NetgraphGraph, nodeIds: string[]): NetgraphPulseSegment[] | null {
  if (nodeIds.length < 2) return null;
  const segments: NetgraphPulseSegment[] = [];
  for (let i = 1; i < nodeIds.length; i += 1) {
    const direct = segmentBetween(graph, nodeIds[i - 1]!, nodeIds[i]!);
    if (direct) {
      segments.push(direct);
      continue;
    }
    const bridge = shortestLiveBridge(graph, nodeIds[i - 1]!, nodeIds[i]!);
    if (bridge) segments.push(...bridge);
  }
  return segments.length > 0 ? segments : null;
}

function segmentBetween(graph: NetgraphGraph, fromId: string, toId: string): NetgraphPulseSegment | null {
  const edge = graph.edgeById.get(`${fromId}>${toId}`);
  const reverseEdge = edge ? null : graph.edgeById.get(`${toId}>${fromId}`);
  const matched = edge ?? reverseEdge;
  if (!matched) return null;
  return {
    edgeId: matched.id,
    fromId: matched.fromId,
    toId: matched.toId,
    reverse: Boolean(reverseEdge),
  };
}

function shortestLiveBridge(graph: NetgraphGraph, fromId: string, toId: string): NetgraphPulseSegment[] | null {
  const maxHops = 8;
  const maxVisited = 560;
  const adjacency = new Map<string, Array<{ nodeId: string; segment: NetgraphPulseSegment }>>();
  for (const edge of graph.edges) {
    const forward = {
      edgeId: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      reverse: false,
    };
    const reverse = {
      edgeId: edge.id,
      fromId: edge.fromId,
      toId: edge.toId,
      reverse: true,
    };
    const fromEdges = adjacency.get(edge.fromId) ?? [];
    fromEdges.push({ nodeId: edge.toId, segment: forward });
    adjacency.set(edge.fromId, fromEdges);
    const toEdges = adjacency.get(edge.toId) ?? [];
    toEdges.push({ nodeId: edge.fromId, segment: reverse });
    adjacency.set(edge.toId, toEdges);
  }
  const queue: Array<{ nodeId: string; segments: NetgraphPulseSegment[] }> = [{ nodeId: fromId, segments: [] }];
  const visited = new Set([fromId]);
  for (let cursor = 0; cursor < queue.length && visited.size <= maxVisited; cursor += 1) {
    const current = queue[cursor]!;
    if (current.segments.length >= maxHops) continue;
    for (const next of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(next.nodeId)) continue;
      const segments = [...current.segments, next.segment];
      if (next.nodeId === toId) return segments;
      visited.add(next.nodeId);
      queue.push({ nodeId: next.nodeId, segments });
    }
  }
  return null;
}

export function highConfidenceNodeIds(event: WsPacketObservation["data"]): string[] {
  const ids: string[] = [];
  for (const hop of event.observation.resolvedPath ?? []) {
    if (hop.confidence !== "high" || hop.nodes.length !== 1) continue;
    const nodeId = hop.nodes[0]?.id;
    if (!nodeId || ids.at(-1) === nodeId) continue;
    ids.push(nodeId);
  }
  return ids;
}

export function importantLabelNodeIds(graph: NetgraphGraph, searchMatches: Set<string>, selectedNodeId?: string | null, selectedRouteId?: number | null): Set<string> {
  const selectedRoutes = selectedNodeId ? selectedNodeNeighborhoodNodeIds(graph, selectedNodeId) : selectedRouteNodeIds(graph, selectedRouteId);
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (node.id === selectedNodeId || selectedRoutes.has(node.id) || searchMatches.has(node.id)) ids.add(node.id);
  }
  const labelBudget = graph.nodes.length > 520 ? 34 : graph.nodes.length > 180 ? 52 : 80;
  const topRouteNodes = graph.nodes
    .filter((node) => node.routeCount > 0)
    .slice()
    .sort(compareNodesForLabels)
    .slice(0, labelBudget);
  for (const node of topRouteNodes) {
    ids.add(node.id);
    if (ids.size >= 160) break;
  }
  return ids;
}

export function netgraphDepthEnvelope(nodeCount: number, edgeCount = 0): number {
  const logNodeScale = Math.min(2.55, 1 + Math.log10(Math.max(1, nodeCount)) * 0.44);
  const edgeScale = Math.min(1.72, 1 + Math.max(0, edgeCount - nodeCount) / 360);
  return Math.max(
    NETGRAPH_LAYOUT_DEPTH_MIN,
    Math.min(NETGRAPH_LAYOUT_DEPTH_SOFT_MAX, Math.round(NETGRAPH_LAYOUT_DEPTH * logNodeScale * edgeScale)),
  );
}

function emptySnapshot(): NetgraphSnapshot {
  return {
    serverTime: 0,
    stats: {
      sourceRouteCount: 0,
      mappedRouteCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      observationCount: 0,
      activeIatas: 0,
      truncatedRoutes: false,
      truncatedNodes: false,
      truncatedEdges: false,
    },
    limits: {
      routeLimit: DEFAULT_NETGRAPH_ROUTE_LIMIT,
      nodeLimit: MAX_NETGRAPH_NODES,
      edgeLimit: MAX_NETGRAPH_EDGES,
    },
    nodes: [],
    edges: [],
  };
}

function nodeFromSnapshot(node: NetgraphSnapshotNode): NetgraphNode {
  const label = node.name?.trim() || node.publicKey?.slice(0, 8).toUpperCase() || node.id.slice(0, 8);
  const role = node.isObserver ? "observer" : roleFromTypeName(node.nodeTypeName);
  const radius = 1.5 + Math.min(3.6, Math.log1p(Math.max(0, node.routeCount)) * 0.62);
  return {
    ...node,
    label,
    role,
    degree: 0,
    radius,
    position: fallbackPosition(node.id),
    seed: fallbackPosition(node.id),
    componentId: 0,
    componentX: 0,
    componentY: 0,
    searchText: `${label} ${node.id} ${node.publicKey} ${node.nodeTypeName} ${node.iatas.join(" ")} ${node.routeIds.join(" ")}`.toLowerCase(),
  };
}

function roleFromTypeName(typeName: string | undefined): NetgraphRole {
  const normalized = (typeName ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("repeater")) return "repeater";
  if (normalized.includes("companion") || normalized.includes("chat")) return "companion";
  if (normalized.includes("room")) return "room";
  if (normalized.includes("sensor")) return "sensor";
  return "other";
}

function applySeedLayout(
  nodes: NetgraphNode[],
  edges: NetgraphEdge[],
  width: number,
  height: number,
  depthEnvelope: number,
  profile: NetgraphGalaxyProfile,
): NetgraphNode[] {
  const components = connectedComponents(nodes, edges);
  const cells = packedComponentCells(components.length, width, height);
  const largest = Math.max(1, components[0]?.nodes.length ?? 1);
  const profileSafe = normalizeGalaxyProfile(profile);
  const depthScaleModifier = profileSafe.depthContrast;
  const spacingScale = profileSafe.edgeSpacingScale;
  const nextNodes = nodes.map((node) => ({ ...node }));
  const byId = new Map(nextNodes.map((node) => [node.id, node]));
  components.forEach((component, componentId) => {
    const cell = cells[componentId] ?? { x: width / 2, y: height / 2, width: width * 0.72, height: height * 0.72 };
    const completeViewScale = components.length === 1 ? 1.54 : 1.12;
    const spreadBase = components.length === 1
      ? Math.min(width, height) * 0.42 * spacingScale
      : Math.min(cell.width, cell.height) * 0.45 * spacingScale;
    const spread = Math.max(20, spreadBase * Math.max(0.42, Math.sqrt(component.nodes.length / largest)) * profileSafe.clusterScale * completeViewScale);
    const clusterRadius = Math.max(18, Math.min(spread * 0.84, Math.min(cell.width, cell.height) * 0.44));
    const depthScale = completeViewDepthScale(nodes.length, edges.length, component.nodes.length);
    const bounds = latLngBounds(component.nodes);
    const sphereScale = Math.max(0.82, Math.min(1.72, 0.58 + depthScale * 0.56 * depthScaleModifier));
    component.nodes
      .slice()
      .sort(compareNodesForLayout)
      .forEach((node, index) => {
        const hasGeoShape = bounds.latSpan > 0.01 || bounds.lngSpan > 0.01;
        const hasSpatialBias = hasGeoShape && component.nodes.length > 4;
        const geoBlend = hasSpatialBias ? 0.1 : 0;
        const bias = stableUnit(`${node.id}:component:${componentId}`, "netgraph-geo-bias");
        const seed = profileSafe.seedShape === "spiral"
          ? spiralSeed(index, component.nodes.length, clusterRadius * sphereScale, profileSafe.spiralIntensity, bias)
          : sphericalSeed(index, component.nodes.length, clusterRadius * sphereScale, bias);
        const geoX = hasSpatialBias && node.lng != null
          ? ((node.lng - bounds.minLng) / Math.max(bounds.lngSpan, 0.01) - 0.5) * spread * 1.5
          : seed.x;
        const geoY = hasSpatialBias && node.lat != null
          ? ((bounds.maxLat - node.lat) / Math.max(bounds.latSpan, 0.01) - 0.5) * spread * 1.5
          : seed.y;
        const depthSpread = Math.max(
          44,
          Math.min(
            depthEnvelope * clamp(0.95 + (depthScale - 1) * 0.26, 0.88, 1.65) * depthScaleModifier,
            spread * (2.06 * depthScale * depthScaleModifier),
          ),
        );
        const depthOffset = seed.z
          * clamp(0.84 + (depthScale - 1) * 0.28, 0.82, 1.72)
          * depthScaleModifier
          * (depthSpread / Math.max(1, clusterRadius));
        const seeded = {
          x: cell.x + seed.x * (1 - geoBlend) + geoX * geoBlend - width / 2,
          y: cell.y + seed.y * (1 - geoBlend) + geoY * geoBlend - height / 2,
          z: clampDepth(
            depthSeed(
              node,
              componentId,
              components.length,
              index,
              component.nodes.length,
              depthSpread,
              depthEnvelope,
              depthScale,
              depthScaleModifier,
              spacingScale,
            ) + depthOffset,
            depthEnvelope,
          ),
        };
        const target = byId.get(node.id);
        if (!target) return;
        target.seed = seeded;
        target.position = seeded;
        target.componentId = componentId;
        target.componentX = cell.x - width / 2;
        target.componentY = cell.y - height / 2;
      });
  });
  return nextNodes;
}

function connectedComponents(nodes: NetgraphNode[], edges: NetgraphEdge[]): Component[] {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.fromId)?.add(edge.toId);
    adjacency.get(edge.toId)?.add(edge.fromId);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const components: Component[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const queue = [node.id];
    const ids: string[] = [];
    seen.add(node.id);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      ids.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push({ nodes: ids.map((id) => byId.get(id)).filter((item): item is NetgraphNode => Boolean(item)) });
  }
  return components.sort((a, b) => b.nodes.length - a.nodes.length || compareNodesForLayout(a.nodes[0]!, b.nodes[0]!));
}

export function packedComponentCells(count: number, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  if (count <= 0) return [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * Math.max(0.72, width / Math.max(height, 1)))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const usedWidth = width * Math.min(0.76, count <= 2 ? 0.42 : 0.72);
  const usedHeight = height * Math.min(0.72, count <= 2 ? 0.42 : 0.68);
  const cellWidth = usedWidth / columns;
  const cellHeight = usedHeight / rows;
  const cellSize = Math.max(18, Math.min(cellWidth, cellHeight, Math.min(width, height) * 0.28));
  const slots: Array<{ column: number; row: number; distance: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      slots.push({ column, row, distance: Math.hypot(column - (columns - 1) / 2, row - (rows - 1) / 2) });
    }
  }
  slots.sort((a, b) => a.distance - b.distance || a.row - b.row || a.column - b.column);
  return slots.slice(0, count).map((slot) => ({
    x: width / 2 - usedWidth / 2 + (slot.column + 0.5) * cellWidth,
    y: height / 2 - usedHeight / 2 + (slot.row + 0.5) * cellHeight,
    width: cellSize,
    height: cellSize,
  }));
}

function compareNodesForLayout(a: NetgraphNode, b: NetgraphNode): number {
  return b.degree - a.degree || b.observationCount - a.observationCount || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

function compareNodesForLabels(a: NetgraphNode, b: NetgraphNode): number {
  return b.routeCount - a.routeCount || b.observationCount - a.observationCount || b.degree - a.degree || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

function focusDensityScale(nodeCount: number, edgeCount: number): number {
  const nodePressure = Math.min(1.88, 1 + Math.log10(Math.max(1, nodeCount)) * 0.28);
  const edgePressure = 1 + Math.max(0, edgeCount - nodeCount) / 320 * 0.42;
  return clampFocusRadius(nodePressure * edgePressure, 0.88, 2.4);
}

function focusGraphScale(nodeCount: number, edgeCount: number): number {
  const nodeScale = Math.sqrt(Math.max(1, nodeCount)) / 7.6;
  const edgeScale = Math.max(1, Math.log10(Math.max(1, edgeCount)));
  const scaled = 1 + (nodeScale - 1) * 0.14 + (edgeScale - 1) * 0.12;
  return clampFocusRadius(scaled, 0.85, NETGRAPH_FOCUS_DEPTH_SCALE);
}

function focusNeighborhoodScale(nodeCount: number, edgeCount: number, neighborhoodNodeCount: number): number {
  if (nodeCount <= 12) return 1;
  const nodeScale = Math.min(1.63, 1 + Math.log10(Math.max(1, nodeCount)) * 0.14);
  const neighborhoodScale = 1 + Math.min(1.0, Math.log10(Math.max(1, neighborhoodNodeCount)) / 4.8);
  const edgeScale = Math.min(1.18, 1 + Math.max(0, edgeCount - nodeCount) / 420 * 0.24);
  return clamp(nodeScale * neighborhoodScale * edgeScale, 1, 4.2);
}

function focusNeighborhoodSpacingScale(neighborhoodNodeCount: number): number {
  if (neighborhoodNodeCount <= 3) return 1;
  return clamp(1 + Math.log1p(neighborhoodNodeCount) * 0.24, 1, 3.6);
}

function completeViewDepthScale(nodeCount: number, edgeCount: number, componentSize: number): number {
  if (nodeCount <= 12) return 1;
  const nodeScale = 1 + Math.min(0.55, Math.log10(Math.max(1, nodeCount)) * 0.12);
  const edgeScale = 1 + Math.min(0.74, Math.max(0, edgeCount - nodeCount) / 360 * 0.3);
  const componentScale = 1 + Math.min(0.52, Math.sqrt(Math.max(1, componentSize)) / 14);
  return clamp(nodeScale * edgeScale * componentScale, 1, 3.05);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function focusDirectRadius(directCount: number, densityScale: number, graphScale: number): number {
  const occupancyBoost = Math.min(44, directCount * 2.2);
  const radius = (NETGRAPH_FOCUS_DIRECT_RADIUS_BASE + directCount * NETGRAPH_FOCUS_DIRECT_RADIUS_GROWTH * 0.12) * densityScale;
  return clampFocusRadius(radius * graphScale + occupancyBoost, 44, 560);
}

function focusContextRadius(contextCount: number, densityScale: number, graphScale: number): number {
  const occupancyBoost = Math.min(92, contextCount * 2.0);
  const radius = (NETGRAPH_FOCUS_CONTEXT_RADIUS_BASE + contextCount * NETGRAPH_FOCUS_CONTEXT_RADIUS_GROWTH * 0.08) * densityScale;
  return clampFocusRadius(radius * graphScale + occupancyBoost, 132, 1050);
}

function clampFocusRadius(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compareNodeIdsForFocus(graph: NetgraphGraph, a: string, b: string): number {
  const nodeA = graph.nodeById.get(a);
  const nodeB = graph.nodeById.get(b);
  if (!nodeA || !nodeB) return a.localeCompare(b);
  return bDegree(nodeB) - bDegree(nodeA) || nodeB.observationCount - nodeA.observationCount || nodeA.label.localeCompare(nodeB.label) || a.localeCompare(b);
}

function bDegree(node: NetgraphNode): number {
  return node.degree + Math.min(12, node.routeCount);
}

function orbitalShellPoint(id: string, index: number, count: number, radius: number): NetgraphPoint {
  const phase = stableUnit(id, "focus-phase") * Math.PI * 2;
  if (count <= 1) {
    return {
      x: Math.cos(phase) * radius * 0.82,
      y: radius * 0.22,
      z: Math.sin(phase) * radius * 0.58,
    };
  }
  const golden = Math.PI * (3 - Math.sqrt(5));
  const yUnit = 1 - ((index + 0.5) / count) * 2;
  const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
  const theta = index * golden + phase;
  const depthJitter = (stableUnit(id, "focus-depth") - 0.5) * radius * 0.22;
  return {
    x: Math.cos(theta) * ring * radius,
    y: yUnit * radius * 0.86,
    z: Math.sin(theta) * ring * radius * 0.78 + depthJitter,
  };
}

function latLngBounds(nodes: NetgraphNode[]): { minLat: number; maxLat: number; minLng: number; maxLng: number; latSpan: number; lngSpan: number } {
  const coords = nodes.filter((node) => node.lat != null && node.lng != null);
  if (coords.length === 0) return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0, latSpan: 0, lngSpan: 0 };
  const lats = coords.map((node) => node.lat!);
  const lngs = coords.map((node) => node.lng!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return { minLat, maxLat, minLng, maxLng, latSpan: maxLat - minLat, lngSpan: maxLng - minLng };
}

function sphericalSeed(index: number, count: number, radius: number, phaseOffset: number): { x: number; y: number; z: number } {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const t = (index + phaseOffset + 0.5) / Math.max(1, count);
  const inclination = Math.acos(clamp(1 - 2 * t, -1, 1));
  const azimuth = (index + phaseOffset) * Math.PI * (3 - Math.sqrt(5));
  const radial = Math.pow(clamp(1e-6 + t, 0, 1), 1 / 3) * radius;
  const sinInc = Math.sin(inclination);
  return {
    x: radial * Math.cos(azimuth) * sinInc,
    y: radial * Math.cos(inclination),
    z: radial * Math.sin(azimuth) * sinInc,
  };
}

function spiralSeed(index: number, count: number, radius: number, intensity: number, phaseOffset: number): { x: number; y: number; z: number } {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const normalized = (index + 0.5 + phaseOffset) / Math.max(1, count);
  const turns = 1.6 + intensity * 2.7;
  const angle = normalized * turns * Math.PI * 2 * (0.7 + Math.sqrt(5) / 2) + phaseOffset;
  const radiusProfile = Math.pow(normalized, 0.72) * radius;
  const band = 0.34 + (Math.sin(normalized * Math.PI * turns * 0.45) + 1) / 2 * 0.21;
  const orbit = radiusProfile * band;
  const twist = Math.cos(angle * 0.7 + phaseOffset * 3.4) * radius * 0.12 * intensity;
  return {
    x: Math.cos(angle) * orbit + Math.sin(angle * 0.9 + phaseOffset) * twist,
    y: Math.sin(angle * (1.12 + intensity * 0.38)) * orbit + Math.cos(angle) * twist * 0.54,
    z: (normalized - 0.5) * radius * (0.88 + intensity * 0.72) + Math.sin(phaseOffset * 11 + normalized * Math.PI * 8) * radius * 0.08,
  };
}

function fallbackPosition(id: string): NetgraphPoint {
  const theta = stableUnit(id, "theta") * Math.PI * 2;
  const radius = 20 + stableUnit(id, "radius") * 24;
  return {
    x: Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    z: fallbackZ(id, "other", 0, NETGRAPH_LAYOUT_DEPTH_SOFT_MAX),
  };
}

function depthSeed(
  node: NetgraphNode,
  componentId: number,
  componentCount: number,
  index: number,
  count: number,
  spread: number,
  depthEnvelope: number,
  depthScale: number,
  depthContrast: number,
  spacingScale: number,
): number {
  const componentLayer = componentDepth(componentId, componentCount) * (0.85 + Math.min(1.05, depthScale * 0.45));
  const rank = count <= 1 ? 0 : index / Math.max(1, count - 1);
  const wave = Math.sin(index * 1.754877666 + stableUnit(node.id, "z-phase") * Math.PI * 2);
  const shell = Math.sqrt((index + 0.5) / Math.max(1, count));
  const orbitalDepth = wave * spread * (0.62 + shell * 0.88) * (0.86 + depthScale * 0.37) * depthContrast;
  const geoDepth = node.lat != null && node.lng != null
    ? (stableUnit(`${node.lat.toFixed(3)}:${node.lng.toFixed(3)}`, "geo-z") - 0.5) * spread * (0.74 + depthScale * 0.35) * depthContrast
    : 0;
  const degreeLift = Math.min(26, Math.log1p(Math.max(1, node.degree + node.routeCount)) * 5.8) * depthContrast;
  const rankLayer = (rank - 0.5) * spread * 0.34 * (0.84 + depthScale * 0.38);
  const roleLift = (roleDepth(node.role) + (node.isObserver ? 2 : 0)) * (1 + (depthScale - 1) * 0.27) * depthContrast;
  return clampDepth(
    (componentLayer + orbitalDepth + geoDepth + degreeLift + rankLayer + roleLift) * (0.82 + Math.min(1, spacingScale - 0.2))
      * (0.8 + depthContrast * 0.5),
    depthEnvelope,
  );
}

function componentDepth(componentId: number, componentCount: number): number {
  if (componentCount <= 1 || componentId === 0) return 0;
  const side = componentId % 2 === 0 ? -1 : 1;
  const layer = Math.ceil(componentId / 2);
  return side * Math.min(NETGRAPH_LAYOUT_DEPTH_SOFT_MAX * 0.34, 16 + layer * 14);
}

function roleDepth(role: NetgraphRole): number {
  switch (role) {
    case "observer":
      return 10;
    case "repeater":
      return 5;
    case "companion":
      return -7;
    case "room":
      return -3;
    case "sensor":
      return 7;
    default:
      return 0;
  }
}

function fallbackZ(id: string, role: NetgraphRole, degree: number, depthEnvelope: number): number {
  return clampDepth(
    (stableUnit(id, "z") - 0.5) * depthEnvelope * 1.16 + Math.min(20, degree) * 0.95 + roleDepth(role),
    depthEnvelope,
  );
}

function clampDepth(value: number, depthEnvelope = NETGRAPH_LAYOUT_DEPTH): number {
  return Math.max(-depthEnvelope, Math.min(depthEnvelope, value));
}

function stableUnit(value: string, salt: string): number {
  return stableHash(`${salt}:${value}`) / 0xffffffff;
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
