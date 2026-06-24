import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  NETGRAPH_LAYOUT_DEPTH,
  type NetgraphGalaxyProfile,
  type NetgraphGraph,
  type NetgraphPoint,
  netgraphDepthEnvelope,
  stableHash,
} from "./netgraph-model";

export interface NetgraphLayoutNode extends SimulationNodeDatum {
  id: string;
  seedX: number;
  seedY: number;
  seedZ: number;
  z: number;
  componentX: number;
  componentY: number;
  radius: number;
  degree: number;
}

export interface NetgraphLayoutLink extends SimulationLinkDatum<NetgraphLayoutNode> {
  id: string;
  source: string | NetgraphLayoutNode;
  target: string | NetgraphLayoutNode;
  observationCount: number;
}

export interface NetgraphLayoutRequest {
  nodes: NetgraphLayoutNode[];
  links: NetgraphLayoutLink[];
  ticks: number;
  depthEnvelope: number;
  densityScale?: number;
  settleStrength?: number;
  edgeSpacingScale?: number;
}

export interface NetgraphLayoutResult {
  positions: Array<{ id: string; x: number; y: number; z: number }>;
}

export function layoutRequestFromGraph(
  graph: NetgraphGraph,
  ticks = 130,
  depthEnvelope?: number,
  profile?: NetgraphGalaxyProfile,
): NetgraphLayoutRequest {
  const envelope = depthEnvelope ?? netgraphDepthEnvelope(graph.nodes.length, graph.edges.length);
  const settleStrength = Math.max(0.35, Math.min(2.6, profile?.settleStrength ?? 1));
  const edgeSpacingScale = Math.max(0.55, Math.min(3, profile?.edgeSpacingScale ?? 1));
  return {
    ticks,
    depthEnvelope: envelope,
    densityScale: layoutDensityScale(graph.nodes.length, graph.edges.length),
    settleStrength,
    edgeSpacingScale,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      seedX: node.seed.x,
      seedY: node.seed.y,
      seedZ: node.seed.z,
      z: node.seed.z,
      componentX: node.componentX,
      componentY: node.componentY,
      radius: Math.max(1.3, node.radius * 3.1),
      degree: node.degree,
    })),
    links: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.fromId,
      target: edge.toId,
      observationCount: edge.observationCount,
    })),
  };
}

export function settleNetgraphLayout(request: NetgraphLayoutRequest): NetgraphLayoutResult {
  const nodes = request.nodes.map((node) => ({ ...node }));
  const links = request.links.map((link) => ({ ...link }));
  const densityScale = request.densityScale ?? layoutDensityScale(request.nodes.length, request.links.length);
  const settleStrength = request.settleStrength ?? 1;
  const edgeSpacingScale = request.edgeSpacingScale ?? 1;
  const settleBlend = Math.max(0.55, Math.min(2.5, settleStrength));
  const spacingPressure = clamp(edgeSpacingScale, 0.6, 3);
  const simulation = forceSimulation<NetgraphLayoutNode, NetgraphLayoutLink>(nodes)
    .force("link", forceLink<NetgraphLayoutNode, NetgraphLayoutLink>(links)
      .id((node) => node.id)
      .distance((link) => linkDistance(link, densityScale, edgeSpacingScale, settleBlend))
      .strength(0.3 + settleBlend * 0.055)
      .iterations(1))
    .force("charge", forceManyBody<NetgraphLayoutNode>().strength((node) =>
      (-64 - Math.min(node.degree, 20) * 5.1) * densityScale * settleBlend * (0.82 + spacingPressure * 0.2),
    ))
    .force("collide", forceCollide<NetgraphLayoutNode>()
      .radius((node) => node.radius * (1 + spacingPressure * 0.16) + 3.2 + (densityScale - 1) * 2.35 * spacingPressure)
      .strength(0.94)
      .iterations(3))
    .force("x", forceX<NetgraphLayoutNode>((node) => node.componentX + (node.seedX - node.componentX) * 0.82).strength(0.052 + settleBlend * 0.01))
    .force("y", forceY<NetgraphLayoutNode>((node) => node.componentY + (node.seedY - node.componentY) * 0.82).strength(0.052 + settleBlend * 0.01))
    .alpha(0.95)
    .alphaDecay(0.032)
    .velocityDecay(Math.max(0.31, Math.min(0.54, 0.42 + (1 - settleBlend) * 0.045)))
    .stop();
  simulation.tick(Math.max(1, Math.min(260, Math.floor(request.ticks))));
  simulation.stop();
  settleDepth(
    nodes,
    links,
    Math.max(1, Math.min(220, Math.floor(request.ticks * 0.82))),
    request.depthEnvelope,
    settleBlend,
    edgeSpacingScale,
  );
  return {
    positions: nodes.map((node) => ({
      id: node.id,
      x: finite(node.x, node.seedX),
      y: finite(node.y, node.seedY),
      z: finite(node.z, node.seedZ),
    })),
  };
}

export function resultToPositionMap(result: NetgraphLayoutResult): Map<string, NetgraphPoint> {
  return new Map(result.positions.map((point) => [point.id, { x: point.x, y: point.y, z: point.z }]));
}

function linkDistance(link: NetgraphLayoutLink, densityScale = 1, edgeSpacingScale = 1, settleStrength = 1): number {
  const base = 8 + Math.log1p(Math.max(1, link.observationCount)) * 1.72;
  return Math.max(10, Math.min(58, base * densityScale * (0.82 + settleStrength * 0.34) * Math.max(0.6, Math.min(2.65, edgeSpacingScale))));
}

function layoutDensityScale(nodeCount: number, edgeCount: number): number {
  if (nodeCount <= 12) return 1;
  const nodeScale = Math.min(2.38, 1 + Math.log2(Math.max(1, nodeCount) / 12) * 0.35);
  const edgeScale = Math.min(1.42, 1 + Math.max(0, edgeCount - nodeCount) / 300 * 0.24);
  return clamp(nodeScale * edgeScale, 1, 2.7);
}

function settleDepth(
  nodes: NetgraphLayoutNode[],
  links: NetgraphLayoutLink[],
  ticks: number,
  depthEnvelope = NETGRAPH_LAYOUT_DEPTH,
  settleStrength = 1,
  edgeSpacingScale = 1,
): void {
  const envelope = clampDepth(requestClampDepth(depthEnvelope), depthEnvelope);
  const depthBoost = 1 + ((requestClampDepth(depthEnvelope) / Math.max(1, depthEnvelope)) * 0.2);
  const envelopeScale = Math.max(0.34, Math.min(1.65, envelope / NETGRAPH_LAYOUT_DEPTH));
  const depthForceScale = clamp(0.95 + envelopeScale * 0.22 + (settleStrength - 1) * 0.22, 0.95, 2.1);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const velocity = new Map(nodes.map((node) => [node.id, 0]));
  for (let tick = 0; tick < ticks; tick += 1) {
    const alpha = 1 - tick / Math.max(1, ticks);
    for (const link of links) {
      const source = typeof link.source === "string" ? byId.get(link.source) : link.source;
      const target = typeof link.target === "string" ? byId.get(link.target) : link.target;
      if (!source || !target) continue;
      const desiredDelta = edgeDepthDelta(link.id, link.observationCount, envelope, settleStrength, edgeSpacingScale);
      const force = (desiredDelta - ((target.z ?? target.seedZ) - (source.z ?? source.seedZ))) *
        (0.014 + alpha * 0.024 * envelopeScale) * depthForceScale * depthBoost * settleStrength;
      velocity.set(source.id, (velocity.get(source.id) ?? 0) - force);
      velocity.set(target.id, (velocity.get(target.id) ?? 0) + force);
    }
    for (const node of nodes) {
      const seedPull = (node.seedZ - (node.z ?? node.seedZ)) * (0.024 + alpha * 0.02) * settleStrength;
      const degreeLift = Math.min(26, Math.log1p(Math.max(0, node.degree)) * (2.0 + envelopeScale * 0.6) * depthForceScale) * edgeSpacingScale;
      const nextVelocity = ((velocity.get(node.id) ?? 0) + seedPull + degreeLift * 0.0021) * (0.62 + envelopeScale * 0.15 * depthForceScale);
      node.z = clampDepth((node.z ?? node.seedZ) + nextVelocity);
      velocity.set(node.id, nextVelocity);
    }
  }
}

function edgeDepthDelta(edgeId: string, observationCount: number, depthEnvelope: number, settleStrength = 1, edgeSpacingScale = 1): number {
  const direction = (stableHash(`edge-depth:${edgeId}`) / 0xffffffff - 0.5) * 2;
  const base = Math.max(14, Math.min(56, 14 + Math.log1p(Math.max(1, observationCount)) * 3));
  const strength = base * clamp(depthEnvelope / NETGRAPH_LAYOUT_DEPTH, 0.68, 2.55) * settleStrength * edgeSpacingScale;
  return direction * strength;
}

function clampDepth(value: number, depthEnvelope = NETGRAPH_LAYOUT_DEPTH): number {
  return Math.max(-depthEnvelope, Math.min(depthEnvelope, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function requestClampDepth(depthEnvelope: number): number {
  return Math.max(NETGRAPH_LAYOUT_DEPTH / 3, depthEnvelope);
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
