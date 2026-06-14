import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import type { CursorPage } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import type { WsNodeUpdate } from "../../types/ws";
import { upsertNodePages } from "../nodes/node-updates";

// Coalesce WebSocket nodeUpdate cache writes to one per animation frame. A node-advert flood can
// deliver many updates between two paints; applying each immediately rebuilds the entire node list
// (the useInfinitePages dedup), the map FeatureCollection, and fires a setData — once per message.
// Buffering them (keyed by nodeId so a node that re-adverts twice in a frame keeps only its latest)
// collapses a burst into a single cache write: one items recompute, one geojson rebuild, one setData,
// with an identical end state. The optional onEach runs synchronously per message for side effects
// that must not be coalesced away (e.g. invalidating the open node's detail query).
export function useCoalescedNodeUpdates(
  nodesKey: QueryKey,
  onEach?: (data: WsNodeUpdate["data"]) => void,
): (data: WsNodeUpdate["data"]) => void {
  const queryClient = useQueryClient();
  const pendingRef = useRef(new Map<string, WsNodeUpdate["data"]>());
  const rafRef = useRef(0);
  const onEachRef = useRef(onEach);
  useEffect(() => {
    onEachRef.current = onEach;
  }, [onEach]);

  const flush = useCallback(() => {
    rafRef.current = 0;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    const updates = Array.from(pending.values());
    pending.clear();
    queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(nodesKey, (old) =>
      updates.reduce((acc, data) => upsertNodePages(acc, data), old),
    );
  }, [queryClient, nodesKey]);

  // Region change swaps nodesKey identity — drop any updates still buffered for the old key, and on
  // unmount cancel a pending frame so it can't fire after teardown.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      pending.clear();
    };
  }, [nodesKey]);

  return useCallback(
    (data: WsNodeUpdate["data"]) => {
      onEachRef.current?.(data);
      pendingRef.current.set(data.nodeId, data);
      if (rafRef.current === 0) rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );
}
