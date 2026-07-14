import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { paintRoleMeshes, ROLE_COLORS, type RoleMesh } from "../../../src/features/netgraph/netgraph-three-nodes";
import { nodeScaleFactorForLayout } from "../../../src/features/netgraph/netgraph-three-geometry";
import type { NetgraphGraph, NetgraphNode } from "../../../src/features/netgraph/netgraph-model";

function node(): NetgraphNode {
  return {
    id: "node-alpha",
    name: "Alpha",
    publicKey: "alphafeed",
    nodeType: 0,
    nodeTypeName: "Repeater",
    lat: 49,
    lng: -123,
    isObserver: false,
    iatas: ["YVR"],
    routeIds: [42],
    routeCount: 1,
    observationCount: 1,
    firstSeen: 1,
    lastSeen: Date.now(),
    label: "Alpha",
    role: "repeater",
    degree: 2,
    radius: 1,
    position: { x: 0, y: 0, z: 0 },
    seed: { x: 0, y: 0, z: 0 },
    componentId: 1,
    componentX: 0,
    componentY: 0,
    searchText: "alpha",
  };
}

function graph(item = node()): NetgraphGraph {
  return {
    serverTime: 1,
    stats: {
      sourceRouteCount: 0,
      mappedRouteCount: 0,
      nodeCount: 1,
      edgeCount: 0,
      observationCount: 0,
      activeIatas: 1,
      truncatedRoutes: false,
      truncatedNodes: false,
      truncatedEdges: false,
    },
    limits: { routeLimit: 2500, nodeLimit: 2600, edgeLimit: 4200 },
    nodes: [item],
    edges: [],
    nodeById: new Map([[item.id, item]]),
    edgeById: new Map(),
    edgeByRouteId: new Map(),
  };
}

function roleMesh(): RoleMesh {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  return { mesh, nodeIndices: [0], usesTexture: false };
}

describe("paintRoleMeshes", () => {
  it("keeps geographic nodes compact against the globe while preserving Galaxy scale", () => {
    expect(nodeScaleFactorForLayout("geo", 2.12)).toBeCloseTo(0.3816);
    expect(nodeScaleFactorForLayout("galaxy", 2.12)).toBe(2.12);
  });

  it("recolors the actual node instance during a live tx/rx flash", () => {
    const item = node();
    const topology = graph(item);
    const normal = roleMesh();
    const flashed = roleMesh();
    const baseColor = new THREE.Color(ROLE_COLORS.repeater);
    const normalColor = new THREE.Color();
    const flashedColor = new THREE.Color();

    paintRoleMeshes({
      roleMeshes: [normal],
      graph: topology,
      selectedNodeId: null,
      hoverNodeId: null,
      directNodeNeighbors: new Set(),
      secondHopNeighbors: new Set(),
      searchMatches: new Set(),
      selectedNodes: new Set(),
      nodeFocusActive: false,
      showDataQuality: false,
      primary: new THREE.Color("#7ab7ff"),
      bg: new THREE.Color("#070910"),
      muted: new THREE.Color("#697386"),
    });
    normal.mesh.getColorAt(0, normalColor);

    paintRoleMeshes({
      roleMeshes: [flashed],
      graph: topology,
      selectedNodeId: null,
      hoverNodeId: null,
      directNodeNeighbors: new Set(),
      secondHopNeighbors: new Set(),
      searchMatches: new Set(),
      selectedNodes: new Set(),
      nodeFocusActive: false,
      showDataQuality: false,
      liveNodeFlashes: new Map([[item.id, { color: "#91c8ff", direction: "tx", strength: 1.2 }]]),
      primary: new THREE.Color("#7ab7ff"),
      bg: new THREE.Color("#070910"),
      muted: new THREE.Color("#697386"),
    });
    flashed.mesh.getColorAt(0, flashedColor);

    expect(normalColor.getHexString()).toBe(baseColor.getHexString());
    expect(flashedColor.getHexString()).not.toBe(normalColor.getHexString());
    expect(flashedColor.b).toBeGreaterThan(normalColor.b);
  });

  it("scales the node surface shine with live flash strength", () => {
    const item = node();
    const topology = graph(item);
    const low = roleMesh();
    const high = roleMesh();
    const lowColor = new THREE.Color();
    const highColor = new THREE.Color();

    paintRoleMeshes({
      roleMeshes: [low],
      graph: topology,
      selectedNodeId: null,
      hoverNodeId: null,
      directNodeNeighbors: new Set(),
      secondHopNeighbors: new Set(),
      searchMatches: new Set(),
      selectedNodes: new Set(),
      nodeFocusActive: false,
      showDataQuality: false,
      liveNodeFlashes: new Map([[item.id, { color: "#54e1a6", direction: "rx", strength: 0.18 }]]),
      primary: new THREE.Color("#7ab7ff"),
      bg: new THREE.Color("#070910"),
      muted: new THREE.Color("#697386"),
    });
    low.mesh.getColorAt(0, lowColor);

    paintRoleMeshes({
      roleMeshes: [high],
      graph: topology,
      selectedNodeId: null,
      hoverNodeId: null,
      directNodeNeighbors: new Set(),
      secondHopNeighbors: new Set(),
      searchMatches: new Set(),
      selectedNodes: new Set(),
      nodeFocusActive: false,
      showDataQuality: false,
      liveNodeFlashes: new Map([[item.id, { color: "#54e1a6", direction: "rx", strength: 1.2 }]]),
      primary: new THREE.Color("#7ab7ff"),
      bg: new THREE.Color("#070910"),
      muted: new THREE.Color("#697386"),
    });
    high.mesh.getColorAt(0, highColor);

    expect(highColor.g).toBeGreaterThan(lowColor.g);
    expect(highColor.r).toBeGreaterThan(lowColor.r);
    expect(highColor.b).toBeGreaterThan(lowColor.b);
  });
});
