import type { CursorPage } from "../../types/api";
import type { Node, NodeAdvertObservation, NodeAnalytics, NodeNeighbor, NodeObservation, NodeReach } from "./types";

export interface NodeJsonExport {
  schema: "beacon.node.v1";
  exportedAt: string;
  source: {
    app: "Beacon";
    surface: "NodeDetail";
  };
  regionScope: {
    iatas?: string[];
    regionKey: string;
  };
  node: Node;
  analytics?: NodeAnalytics;
  reach?: NodeReach;
  neighbors?: NodeNeighbor[];
  recentObservations?: {
    items: NodeObservation[];
    nextCursor: number | null;
    hasMore: boolean;
  };
  advertTimeline?: {
    items: NodeAdvertObservation[];
    nextCursor: number | null;
    hasMore: boolean;
  };
}

export function buildNodeJsonExport(
  args: {
    node: Node;
    regionKey: string;
    iatas?: string[];
    analytics?: NodeAnalytics;
    reach?: NodeReach;
    neighbors?: NodeNeighbor[];
    observations?: CursorPage<NodeObservation>;
    adverts?: CursorPage<NodeAdvertObservation>;
  },
  exportedAt = new Date().toISOString(),
): NodeJsonExport {
  return {
    schema: "beacon.node.v1",
    exportedAt,
    source: {
      app: "Beacon",
      surface: "NodeDetail",
    },
    regionScope: {
      iatas: args.iatas,
      regionKey: args.regionKey,
    },
    node: args.node,
    analytics: args.analytics,
    reach: args.reach,
    neighbors: args.neighbors,
    recentObservations: args.observations
      ? {
          items: args.observations.items,
          nextCursor: args.observations.nextCursor,
          hasMore: args.observations.hasMore,
        }
      : undefined,
    advertTimeline: args.adverts
      ? {
          items: args.adverts.items,
          nextCursor: args.adverts.nextCursor,
          hasMore: args.adverts.hasMore,
        }
      : undefined,
  };
}

export function nodeJsonFilename(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "unknown";
  return `beacon-node-${safeId}.json`;
}
