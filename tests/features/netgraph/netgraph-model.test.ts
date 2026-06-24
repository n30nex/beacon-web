import { describe, expect, it } from "vitest";
import {
  buildNetgraph,
  focusedNodeNeighborhoodLayout,
  graphSearchMatches,
  importantLabelNodeIds,
  nodeDirectEdgeIds,
  nodeDirectNeighborIds,
  nodeSecondHopNeighborIds,
  packetObservationToNetgraphLiveVisual,
  resolveNetgraphRenderTier,
  routePathPoints,
  selectedNodeNeighborhoodNodeIds,
  selectedNodeRouteEdgeIds,
  selectedRouteEdgeIds,
  stableHash,
} from "../../../src/features/netgraph/netgraph-model";
import { layoutRequestFromGraph, resultToPositionMap, settleNetgraphLayout } from "../../../src/features/netgraph/netgraph-layout";
import type { NetgraphSnapshot } from "../../../src/types/api";
import type { WsPacketObservation } from "../../../src/types/ws";

function snapshot(overrides: Partial<NetgraphSnapshot> = {}): NetgraphSnapshot {
  return {
    serverTime: 123,
    stats: {
      sourceRouteCount: 1,
      mappedRouteCount: 1,
      nodeCount: 3,
      edgeCount: 2,
      observationCount: 42,
      activeIatas: 1,
      truncatedRoutes: false,
      truncatedNodes: false,
      truncatedEdges: false,
    },
    limits: {
      routeLimit: 2500,
      nodeLimit: 2600,
      edgeLimit: 4200,
    },
    nodes: [
      node("node-alpha", "Alpha", "Repeater", 49.2, -123.1),
      node("node-bravo", "Bravo", "Room", 49.4, -122.9),
      node("node-charlie", "Charlie", "Companion"),
    ],
    edges: [
      edge("node-alpha", "node-bravo", [42, 43], 20),
      edge("node-bravo", "node-charlie", [42], 22),
    ],
    ...overrides,
  };
}

function node(id: string, name: string, nodeTypeName: string, lat?: number, lng?: number, overrides: Partial<NetgraphSnapshot["nodes"][number]> = {}): NetgraphSnapshot["nodes"][number] {
  return {
    id,
    name,
    publicKey: `${id.replaceAll("-", "").slice(0, 8).padEnd(8, "0")}feed`,
    nodeType: 0,
    nodeTypeName,
    lat,
    lng,
    isObserver: false,
    iatas: ["YVR"],
    routeIds: [42],
    routeCount: 1,
    observationCount: 12,
    firstSeen: 1,
    lastSeen: 2,
    ...overrides,
  };
}

function edge(fromNodeId: string, toNodeId: string, routeIds: number[], observationCount: number): NetgraphSnapshot["edges"][number] {
  return {
    id: `${fromNodeId}>${toNodeId}`,
    fromNodeId,
    toNodeId,
    iatas: ["YVR"],
    routeIds,
    routeCount: routeIds.length,
    observationCount,
    firstSeen: 1,
    lastSeen: 2,
  };
}

function chainSnapshot(count = 14): NetgraphSnapshot {
  const nodes = Array.from({ length: count }, (_, index) =>
    node(`node-${String(index).padStart(2, "0")}`, `Node ${index}`, index % 5 === 0 ? "Repeater" : index % 5 === 1 ? "Room" : index % 5 === 2 ? "Companion" : "Sensor", 49 + index * 0.012, -123 + index * 0.009),
  );
  const edges = Array.from({ length: count - 1 }, (_, index) => edge(nodes[index]!.id, nodes[index + 1]!.id, [100 + index], 8 + index * 3));
  return snapshot({
    stats: {
      sourceRouteCount: edges.length,
      mappedRouteCount: edges.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      observationCount: edges.reduce((total, item) => total + item.observationCount, 0),
      activeIatas: 1,
      truncatedRoutes: false,
      truncatedNodes: false,
      truncatedEdges: false,
    },
    nodes,
    edges,
  });
}

function packetData(path: string[], observerId = "observer-1"): WsPacketObservation["data"] {
  return {
    packetHash: "hash-1",
    packet: {
      payloadType: 1,
      payloadTypeName: "TEXT",
      routeType: 0,
      routeTypeName: "ROUTE_FLOOD",
      isFirstObservation: true,
      observationCount: 1,
    },
    observation: {
      id: 9,
      observerId,
      observerName: "Observer",
      iata: "YVR",
      heardAt: 1000,
      rssi: -80,
      snr: 7,
      sourceBroker: "test",
      resolvedPath: path.map((id) => ({
        confidence: "high",
        nodes: [{ id, name: id, publicKey: `${id}pk` }],
      })),
    },
  };
}

describe("buildNetgraph", () => {
  it("returns an empty graph when no snapshot is available", () => {
    const graph = buildNetgraph(undefined);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.stats.mappedRouteCount).toBe(0);
  });

  it("maps snapshot nodes and directed edges into render-ready graph indexes", () => {
    const graph = buildNetgraph(snapshot());

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodeById.get("node-alpha")?.role).toBe("repeater");
    expect(graph.nodeById.get("node-bravo")?.role).toBe("room");
    expect(graph.edgeByRouteId.get(42)?.map((item) => item.id)).toEqual(["node-alpha>node-bravo", "node-bravo>node-charlie"]);
    expect(selectedRouteEdgeIds(graph, 43)).toEqual(new Set(["node-alpha>node-bravo"]));
  });

  it("sizes nodes by route count instead of observation volume", () => {
    const graph = buildNetgraph(snapshot({
      stats: { ...snapshot().stats, nodeCount: 2, edgeCount: 0 },
      nodes: [
        node("node-routes", "Routes", "Repeater", undefined, undefined, { routeCount: 36, observationCount: 1 }),
        node("node-noisy", "Noisy", "Repeater", undefined, undefined, { routeCount: 1, observationCount: 10000 }),
      ],
      edges: [],
    }));

    expect(graph.nodeById.get("node-routes")!.radius).toBeGreaterThan(graph.nodeById.get("node-noisy")!.radius);
  });

  it("prioritizes labels for selected, searched, and high-route nodes", () => {
    const nodes = Array.from({ length: 12 }, (_, index) =>
      node(`node-${String(index).padStart(2, "0")}`, `Node ${index}`, "Repeater", undefined, undefined, {
        routeCount: index === 8 ? 480 : index + 1,
        observationCount: 10,
      }),
    );
    const graph = buildNetgraph(snapshot({
      stats: { ...snapshot().stats, nodeCount: nodes.length, edgeCount: 0 },
      nodes,
      edges: [],
    }));
    const labels = Array.from(importantLabelNodeIds(graph, new Set(["node-03"]), "node-01", null));

    expect(labels.slice(0, 2)).toEqual(["node-01", "node-03"]);
    expect(labels[2]).toBe("node-08");
  });

  it("keeps fallback positions and settled layout deterministic", () => {
    const graphA = buildNetgraph(snapshot());
    const graphB = buildNetgraph(snapshot());

    expect(graphA.nodeById.get("node-charlie")?.seed).toEqual(graphB.nodeById.get("node-charlie")?.seed);
    expect(stableHash("node-charlie")).toBe(stableHash("node-charlie"));

    const positionsA = resultToPositionMap(settleNetgraphLayout(layoutRequestFromGraph(graphA, 20)));
    const positionsB = resultToPositionMap(settleNetgraphLayout(layoutRequestFromGraph(graphB, 20)));
    expect(positionsA.get("node-alpha")).toEqual(positionsB.get("node-alpha"));
  });

  it("settles nodes into meaningful 3D depth instead of a flat XY sheet", () => {
    const graph = buildNetgraph(chainSnapshot());
    const seedDepth = depthSpan(graph.nodes.map((node) => node.seed.z));
    const positions = resultToPositionMap(settleNetgraphLayout(layoutRequestFromGraph(graph, 34)));
    const settledDepth = depthSpan(Array.from(positions.values()).map((point) => point.z));
    const strongestEdgeDepth = Math.max(
      ...graph.edges.map((item) => Math.abs((positions.get(item.fromId)?.z ?? 0) - (positions.get(item.toId)?.z ?? 0))),
    );

    expect(seedDepth).toBeGreaterThan(70);
    expect(settledDepth).toBeGreaterThan(62);
    expect(strongestEdgeDepth).toBeGreaterThan(8);
  });

  it("returns route path points in graph coordinates", () => {
    const graph = buildNetgraph(snapshot());

    expect(routePathPoints(graph, 42)).toHaveLength(3);
    expect(routePathPoints(graph, 404)).toEqual([]);
  });

  it("selects the full route neighborhood around a clicked node", () => {
    const graph = buildNetgraph(snapshot());

    expect(selectedNodeRouteEdgeIds(graph, "node-alpha")).toEqual(new Set(["node-alpha>node-bravo", "node-bravo>node-charlie"]));
    expect(selectedNodeNeighborhoodNodeIds(graph, "node-alpha")).toEqual(new Set(["node-alpha", "node-bravo", "node-charlie"]));
    expect(nodeDirectEdgeIds(graph, "node-alpha")).toEqual(new Set(["node-alpha>node-bravo"]));
    expect(nodeDirectNeighborIds(graph, "node-alpha")).toEqual(new Set(["node-alpha", "node-bravo"]));
    expect(nodeSecondHopNeighborIds(graph, "node-alpha")).toEqual(new Set(["node-charlie"]));
    expect(selectedNodeRouteEdgeIds(graph, "missing")).toEqual(new Set());
  });

  it("builds a deterministic 3D focused neighborhood layout", () => {
    const graphA = buildNetgraph(snapshot());
    const graphB = buildNetgraph(snapshot());
    const focusA = focusedNodeNeighborhoodLayout(graphA, "node-alpha");
    const focusB = focusedNodeNeighborhoodLayout(graphB, "node-alpha");

    expect(focusA?.positions.get("node-alpha")).toEqual({ x: 0, y: 0, z: 0 });
    expect(focusA?.positions).toEqual(focusB?.positions);
    const direct = focusA?.nodes.find((node) => node.id === "node-bravo");
    const context = focusA?.nodes.find((node) => node.id === "node-charlie");

    expect(direct?.shell).toBe("direct");
    expect(context?.shell).toBe("context");
    expect(distanceFromOrigin(direct!.position)).toBeGreaterThan(34);
    expect(distanceFromOrigin(context!.position)).toBeGreaterThan(distanceFromOrigin(direct!.position));
    expect(depthSpan(focusA!.nodes.map((node) => node.position.z))).toBeGreaterThan(20);
    expect(focusA?.edgeIds).toEqual(new Set(["node-alpha>node-bravo", "node-bravo>node-charlie"]));
  });

  it("matches search terms across node and edge metadata", () => {
    const graph = buildNetgraph(snapshot());

    expect(graphSearchMatches(graph, "alpha")).toEqual(new Set(["node-alpha", "node-bravo"]));
    expect(graphSearchMatches(graph, "43")).toEqual(new Set(["node-alpha", "node-bravo"]));
  });

  it("maps device and quality inputs into cinematic render tiers", () => {
    expect(resolveNetgraphRenderTier({
      denseGraph: false,
      lowPowerHardware: false,
      narrowViewport: false,
      qualityMode: "auto",
      reducedMotion: false,
    })).toMatchObject({ name: "cinematic", textureQuality: "high", guidedIntro: true });

    expect(resolveNetgraphRenderTier({
      denseGraph: true,
      lowPowerHardware: true,
      narrowViewport: true,
      qualityMode: "auto",
      reducedMotion: false,
    })).toMatchObject({ name: "balanced", textureQuality: "standard" });

    expect(resolveNetgraphRenderTier({
      denseGraph: true,
      lowPowerHardware: true,
      narrowViewport: true,
      qualityMode: "high",
      reducedMotion: false,
    })).toMatchObject({ name: "cinematic", textureQuality: "high" });

    expect(resolveNetgraphRenderTier({
      denseGraph: false,
      lowPowerHardware: false,
      narrowViewport: false,
      qualityMode: "auto",
      reducedMotion: true,
    })).toMatchObject({ name: "battery", effectScale: 0, guidedIntro: false });
  });
});

function depthSpan(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function distanceFromOrigin(point: { x: number; y: number; z: number }): number {
  return Math.hypot(point.x, point.y, point.z);
}

describe("packetObservationToNetgraphLiveVisual", () => {
  it("turns matched high-confidence paths into edge pulse segments", () => {
    const graph = buildNetgraph(snapshot());
    const visual = packetObservationToNetgraphLiveVisual(packetData(["node-alpha", "node-bravo", "node-charlie"]), graph, 5000);

    expect(visual?.type).toBe("pulse");
    if (visual?.type !== "pulse") return;
    expect(visual.pulse.segments.map((segment) => segment.edgeId)).toEqual(["node-alpha>node-bravo", "node-bravo>node-charlie"]);
    expect(visual.pulse.txNodeId).toBe("node-alpha");
    expect(visual.pulse.rxNodeId).toBe("node-charlie");
    expect(visual.pulse.startedAt).toBe(5000);
  });

  it("prefers a known observer node as the rx endpoint", () => {
    const graph = buildNetgraph(snapshot());
    const visual = packetObservationToNetgraphLiveVisual(packetData(["node-alpha", "node-bravo"], "node-charlie"), graph, 5000);

    expect(visual?.type).toBe("pulse");
    if (visual?.type !== "pulse") return;
    expect(visual.pulse.txNodeId).toBe("node-alpha");
    expect(visual.pulse.rxNodeId).toBe("node-charlie");
    expect(visual.pulse.txColor).toBe("#7ab7ff");
    expect(visual.pulse.rxColor).toBe("#54e1a6");
  });

  it("uses a node glow when only one path node can be matched", () => {
    const graph = buildNetgraph(snapshot());
    const visual = packetObservationToNetgraphLiveVisual(packetData(["node-alpha"]), graph, 5000);

    expect(visual).toMatchObject({ type: "glow", glow: { nodeId: "node-alpha", direction: "rx" } });
  });

  it("uses an observer rx glow when the route path is unavailable", () => {
    const graph = buildNetgraph(snapshot());
    const visual = packetObservationToNetgraphLiveVisual(packetData([], "node-bravo"), graph, 5000);

    expect(visual).toMatchObject({ type: "glow", glow: { nodeId: "node-bravo", direction: "rx" } });
  });
});
