import { useInfinitePages } from "../../hooks/useInfinitePages";
import { getNodesPage } from "../../api/client";
import type { NodeSummary } from "../nodes/types";

const nodeId = (n: NodeSummary) => n.id;
const MAP_NODES_PAGE_LIMIT = 500;

interface UseMapNodesDataOptions {
  auto?: boolean;
  enabled?: boolean;
  limit?: number;
}

// Load the selected region's complete node set for the map. The shared pager owns cursor chaining,
// dedup, and error handling, while callers can raise the per-request limit when a one-shot overlay is
// preferable. Loads once per region; WS updates keep nodes live.
export function useMapNodesData(selectedIatas: string[] | undefined, regionKey: string, options: UseMapNodesDataOptions = {}) {
  const limit = options.limit ?? MAP_NODES_PAGE_LIMIT;
  const { items, loadedCount, isPaging, isError, hasMore, loadMore, updatedAt } = useInfinitePages<NodeSummary>({
    queryKey: ["map-nodes", regionKey],
    queryFn: (cursor) => getNodesPage(selectedIatas, { cursor, limit }),
    getId: nodeId,
    auto: options.auto,
    enabled: options.enabled,
  });
  return { nodes: items, loadedCount, isPaging, isError, hasMore, loadMore, updatedAt };
}
