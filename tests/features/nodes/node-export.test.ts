import { describe, expect, it } from "vitest";
import { buildNodeJsonExport, nodeJsonFilename } from "../../../src/features/nodes/node-export";
import type { Node, NodeAnalytics, NodeReach } from "../../../src/features/nodes/types";

const node: Node = {
  id: "node-self",
  publicKey: "aabbccddeeff",
  nodeType: 2,
  nodeTypeName: "REPEATER",
  name: "Self Node",
  lat: 49.2827,
  lng: -123.1207,
  iatas: [{ iata: "YVR", lastHeard: 1_782_043_200_000 }],
  locationSource: "advert",
  lastAdvertAt: 1_782_043_190_000,
  supportsMultibytePaths: true,
  supportsMultibyteTraces: false,
  minFirmwareVersion: "1.6",
  firstSeen: 1_782_043_000_000,
  lastSeen: 1_782_043_200_000,
  metadata: { firmware: "1.6.1" },
};

const analytics: NodeAnalytics = {
  nodeId: "node-self",
  since: 1,
  until: 2,
  kpis: { packetCount: 12, observationCount: 34, activeObservers: 3, activeIatas: 2, avgSnr: 7.5, avgRssi: -98.2 },
  payloadMix: [{ key: "4", label: "advert", count: 8 }],
  routeMix: [{ key: "0", label: "FLOOD", count: 6 }],
  iataMix: [{ key: "YVR", label: "YVR", count: 12 }],
  hourly: [],
  snrBuckets: [{ bucket: "5..10", count: 7 }],
  rssiBuckets: [],
  hopBuckets: [],
  topObservers: [],
  topPeers: [],
};

const reach: NodeReach = {
  nodeId: "node-self",
  maxHops: 5,
  generatedAt: 1_782_043_200_000,
  reachableNodes: 9,
  verifiedEdges: 7,
  routeCount: 11,
  observationCount: 44,
  hopBuckets: [{ hopDistance: 1, nodeCount: 3, edgeCount: 3, routeCount: 4, observationCount: 12 }],
  topNodes: [],
  topIatas: [],
};

describe("node JSON export", () => {
  it("builds a stable node handoff payload", () => {
    const exported = buildNodeJsonExport(
      {
        node,
        regionKey: "YVR",
        iatas: ["YVR"],
        analytics,
        reach,
        neighbors: [{ id: "n-1", name: "Neighbor", nodeType: 2, nodeTypeName: "REPEATER", iata: "YVR", observationCount: 5, firstSeen: 1, lastSeen: 2 }],
        observations: {
          items: [{ id: 100, packetHash: "packet-1", payloadType: 4, payloadTypeName: "Advert", iata: "YVR", heardAt: 1_782_043_200_000, snr: 7 }],
          nextCursor: 100,
          hasMore: true,
        },
        adverts: {
          items: [{ id: 101, packetHash: "packet-2", payloadType: 4, payloadTypeName: "Advert", iata: "YVR", heardAt: 1_782_043_199_000, advertisedName: "Self Node" }],
          nextCursor: null,
          hasMore: false,
        },
      },
      "2026-06-21T14:00:00.000Z",
    );

    expect(exported.schema).toBe("beacon.node.v1");
    expect(exported.exportedAt).toBe("2026-06-21T14:00:00.000Z");
    expect(exported.source).toEqual({ app: "Beacon", surface: "NodeDetail" });
    expect(exported.regionScope).toEqual({ iatas: ["YVR"], regionKey: "YVR" });
    expect(exported.node.id).toBe("node-self");
    expect(exported.analytics?.kpis.observationCount).toBe(34);
    expect(exported.reach?.reachableNodes).toBe(9);
    expect(exported.neighbors?.[0]?.id).toBe("n-1");
    expect(exported.recentObservations?.items[0]?.packetHash).toBe("packet-1");
    expect(exported.recentObservations?.hasMore).toBe(true);
    expect(exported.advertTimeline?.items[0]?.advertisedName).toBe("Self Node");
  });

  it("creates a filesystem-safe node JSON filename", () => {
    expect(nodeJsonFilename("node:abc/def 123_extra")).toBe("beacon-node-nodeabcdef123_extra.json");
    expect(nodeJsonFilename("***")).toBe("beacon-node-unknown.json");
  });
});
