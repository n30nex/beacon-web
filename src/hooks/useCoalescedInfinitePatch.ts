import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import { patchInfinitePages } from "../lib/infinite-pages";
import type { CursorPage } from "../types/api";

// Coalesce a stream of WS patch events into one cache write per animation frame. Each event patches
// existing rows in a cursor-paginated cache (no insert — that's the table case, vs the map's upsert);
// applying each immediately rebuilds the deduped items array + re-sorts + re-renders the whole table,
// once per event. Buffering them (keyed so repeated updates to one row keep only the latest) collapses
// a burst into a single setQueryData -> one items rebuild -> one sort/render. patchOne must return the
// SAME array ref when it makes no change (patchNodeSummary / patchObserverSummary do), so a frame of
// only no-op re-adverts still produces zero re-render. onEach runs synchronously per event for side
// effects that must not be coalesced away (e.g. invalidating the open row's detail query).
export function useCoalescedInfinitePatch<TItem, TPayload>(
  queryKey: QueryKey,
  keyOf: (payload: TPayload) => string,
  patchOne: (items: TItem[], payload: TPayload) => TItem[] | undefined,
  onEach?: (payload: TPayload) => void,
): (payload: TPayload) => void {
  const queryClient = useQueryClient();
  const pendingRef = useRef(new Map<string, TPayload>());
  const rafRef = useRef(0);
  const onEachRef = useRef(onEach);
  useEffect(() => {
    onEachRef.current = onEach;
  }, [onEach]);

  const flush = useCallback(() => {
    rafRef.current = 0;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    const batch = Array.from(pending.values());
    pending.clear();
    queryClient.setQueryData<InfiniteData<CursorPage<TItem>>>(queryKey, (old) =>
      patchInfinitePages(old, (items) => {
        let next = items;
        for (const payload of batch) next = patchOne(next, payload) ?? next;
        return next;
      }),
    );
  }, [queryClient, queryKey, patchOne]);

  // queryKey identity changes when the filter/region changes — drop updates buffered for the old key,
  // and on unmount cancel a pending frame so it can't fire after teardown.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      pending.clear();
    };
  }, [queryKey]);

  return useCallback(
    (payload: TPayload) => {
      onEachRef.current?.(payload);
      pendingRef.current.set(keyOf(payload), payload);
      if (rafRef.current === 0) rafRef.current = requestAnimationFrame(flush);
    },
    [flush, keyOf],
  );
}
