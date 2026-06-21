import type { KnownRoute, ResolvedNode } from "../../types/api";

export interface RouteJsonHop {
  index: number;
  nodeId: string;
  hashBytes: string;
  node?: ResolvedNode;
}

export interface RouteJsonExport {
  schema: "beacon.route.v1";
  exportedAt: string;
  source: {
    app: "Beacon";
    surface: "RouteDetail";
  };
  routeId: number;
  iata: string;
  hopCount: number;
  observationCount: number;
  firstSeen: number;
  lastSeen: number;
  hops: RouteJsonHop[];
  route: KnownRoute;
}

export function buildRouteJsonExport(route: KnownRoute, exportedAt = new Date().toISOString()): RouteJsonExport {
  return {
    schema: "beacon.route.v1",
    exportedAt,
    source: {
      app: "Beacon",
      surface: "RouteDetail",
    },
    routeId: route.id,
    iata: route.iata,
    hopCount: route.hopCount,
    observationCount: route.observationCount,
    firstSeen: route.firstSeen,
    lastSeen: route.lastSeen,
    hops: route.hops.map((hop, index) => ({
      index: index + 1,
      nodeId: hop.nodeId,
      hashBytes: hop.hashBytes,
      node: hop.node,
    })),
    route,
  };
}

export function routeJsonFilename(route: KnownRoute): string {
  const safeIata = route.iata.replace(/[^a-z0-9_-]/gi, "").slice(0, 12) || "unknown";
  return `beacon-route-${safeIata}-${route.id}.json`;
}
