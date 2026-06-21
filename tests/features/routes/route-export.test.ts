import { describe, expect, it } from "vitest";
import { buildRouteJsonExport, routeJsonFilename } from "../../../src/features/routes/route-export";
import type { KnownRoute } from "../../../src/types/api";

const route: KnownRoute = {
  id: 77,
  iata: "YVR",
  hopCount: 2,
  observationCount: 42,
  firstSeen: 1_782_043_000_000,
  lastSeen: 1_782_043_200_000,
  hops: [
    {
      nodeId: "node-a",
      hashBytes: "aa",
      node: { id: "node-a", publicKey: "aabb", name: "Alpha" },
    },
    {
      nodeId: "node-b",
      hashBytes: "bb",
      node: { id: "node-b", publicKey: "bbcc", name: "Beta" },
    },
  ],
};

describe("route JSON export", () => {
  it("builds a stable route handoff payload", () => {
    const exported = buildRouteJsonExport(route, "2026-06-21T15:00:00.000Z");

    expect(exported.schema).toBe("beacon.route.v1");
    expect(exported.exportedAt).toBe("2026-06-21T15:00:00.000Z");
    expect(exported.source).toEqual({ app: "Beacon", surface: "RouteDetail" });
    expect(exported.routeId).toBe(77);
    expect(exported.iata).toBe("YVR");
    expect(exported.hopCount).toBe(2);
    expect(exported.observationCount).toBe(42);
    expect(exported.hops).toEqual([
      { index: 1, nodeId: "node-a", hashBytes: "aa", node: { id: "node-a", publicKey: "aabb", name: "Alpha" } },
      { index: 2, nodeId: "node-b", hashBytes: "bb", node: { id: "node-b", publicKey: "bbcc", name: "Beta" } },
    ]);
    expect(exported.route).toEqual(route);
  });

  it("creates a filesystem-safe route JSON filename", () => {
    expect(routeJsonFilename({ ...route, id: 12, iata: "YV/R:*" })).toBe("beacon-route-YVR-12.json");
    expect(routeJsonFilename({ ...route, id: 13, iata: "***" })).toBe("beacon-route-unknown-13.json");
  });
});
