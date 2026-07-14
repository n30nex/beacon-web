import { describe, expect, it } from "vitest";
import {
  buildGeoPlacements,
  NETGRAPH_GLOBE_RADIUS,
  NETGRAPH_UNLOCATED_RADIUS,
  pointOnSampledPath,
  projectLatLngToSphere,
  sampleGreatCirclePath,
} from "../../../src/features/netgraph/netgraph-geo";
import { buildNetgraph, type NetgraphPulse } from "../../../src/features/netgraph/netgraph-model";
import { positionForPulseLocal } from "../../../src/features/netgraph/netgraph-three-geometry";
import type { NetgraphSnapshot } from "../../../src/types/api";

describe("Geo Constellation geometry", () => {
  it("projects the equator and poles onto a finite sphere", () => {
    const equator = projectLatLngToSphere(0, 0);
    const north = projectLatLngToSphere(90, 45);
    const south = projectLatLngToSphere(-90, -120);

    expect(equator).toEqual({ x: 0, y: 0, z: NETGRAPH_GLOBE_RADIUS });
    expect(north.y).toBeCloseTo(NETGRAPH_GLOBE_RADIUS, 8);
    expect(south.y).toBeCloseTo(-NETGRAPH_GLOBE_RADIUS, 8);
    expect([equator, north, south].flatMap(Object.values).every(Number.isFinite)).toBe(true);
  });

  it("crosses the dateline along the short great-circle arc", () => {
    const from = projectLatLngToSphere(12, 179, NETGRAPH_GLOBE_RADIUS + 3.6);
    const to = projectLatLngToSphere(12, -179, NETGRAPH_GLOBE_RADIUS + 3.6);
    const path = sampleGreatCirclePath(from, to, 21);
    const middle = path[10]!;

    expect(path[0]).toEqual(from);
    expect(path.at(-1)).toEqual(to);
    expect(middle.z).toBeLessThan(-NETGRAPH_GLOBE_RADIUS);
    expect(path.flatMap(Object.values).every(Number.isFinite)).toBe(true);
  });

  it("spreads coincident nodes deterministically around one geographic anchor", () => {
    const inputs = [
      { id: "c", lat: 43.65, lng: -79.38, iatas: ["YYZ"] },
      { id: "a", lat: 43.65, lng: -79.38, iatas: ["YYZ"] },
      { id: "b", lat: 43.65, lng: -79.38, iatas: ["YYZ"] },
    ];
    const first = buildGeoPlacements(inputs);
    const second = buildGeoPlacements(inputs.slice().reverse());

    expect(first.get("a")?.anchor).toEqual(first.get("b")?.anchor);
    expect(first.get("a")?.position).not.toEqual(first.get("b")?.position);
    expect(first).toEqual(second);
  });

  it("uses same-IATA centroids before the labeled outer constellation", () => {
    const placements = buildGeoPlacements([
      { id: "located-a", lat: 43, lng: -79, iatas: ["YYZ"] },
      { id: "located-b", lat: 45, lng: -75, iatas: ["YYZ"] },
      { id: "iata-fallback", iatas: ["YYZ"] },
      { id: "outer", iatas: ["NONE"] },
    ]);

    expect(placements.get("iata-fallback")).toMatchObject({ source: "iata-centroid", sourceIata: "YYZ" });
    expect(placements.get("outer")?.source).toBe("unlocated");
    expect(Math.hypot(...Object.values(placements.get("outer")!.position))).toBeGreaterThanOrEqual(NETGRAPH_UNLOCATED_RADIUS);
  });

  it("samples pulse positions from the exact edge curve", () => {
    const graph = buildNetgraph(testSnapshot());
    const edgeId = graph.edges[0]!.id;
    const pulse: NetgraphPulse = {
      id: "pulse", payloadTypeName: "TEXT", color: "#fff", txColor: "#fff", rxColor: "#fff",
      startedAt: 0, durationMs: 1000, segments: [{ edgeId, fromId: "west", toId: "east", reverse: false }],
    };
    const expected = pointOnSampledPath(graph.edgePaths.get(edgeId), 0.5)!;
    const actual = positionForPulseLocal(graph, pulse, 0, 0.5)!;

    expect(actual.toArray()).toEqual([expected.x, expected.y, expected.z]);
    expect(actual.toArray().every(Number.isFinite)).toBe(true);
  });
});

function testSnapshot(): NetgraphSnapshot {
  const node = (id: string, lng: number): NetgraphSnapshot["nodes"][number] => ({
    id, name: id, publicKey: `${id}pk`, nodeType: 1, nodeTypeName: "Repeater", lat: 25, lng,
    isObserver: false, iatas: ["TST"], routeIds: [7], routeCount: 1, observationCount: 2, firstSeen: 1, lastSeen: 2,
  });
  return {
    serverTime: 2,
    stats: { sourceRouteCount: 1, mappedRouteCount: 1, nodeCount: 2, edgeCount: 1, observationCount: 2, activeIatas: 1, truncatedRoutes: false, truncatedNodes: false, truncatedEdges: false },
    limits: { routeLimit: 800, nodeLimit: 2600, edgeLimit: 4200 },
    nodes: [node("west", -70), node("east", 85)],
    edges: [{ id: "west>east", fromNodeId: "west", toNodeId: "east", iatas: ["TST"], routeIds: [7], routeCount: 1, observationCount: 2, firstSeen: 1, lastSeen: 2 }],
  };
}
