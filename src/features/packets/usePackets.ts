import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getPackets } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import type { WsPacketObservation, WsLagged } from "../../types/ws";
import type { PacketSummary } from "../../types/api";
import { LIVE_BUFFER_CAP, MAX_INFINITE_PAGES } from "../../lib/constants";

// merge and deduplicate live + paginated packets

function flattenPages(data: { pages: Array<{ items: PacketSummary[] }> } | undefined): PacketSummary[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.items);
}


interface LiveSnapshot {
  buffer: readonly PacketSummary[];
  acknowledgedCount: number;
  observersByHash: ReadonlyMap<string, ReadonlySet<string>>;
}

// RAF batching avoids re-rendering on every WS message -- can be 50+/sec during floods

class LivePacketStore {
  private buffer: PacketSummary[] = []; // newest-first; the published snapshot array
  private hashIndex = new Map<string, number>(); // hash -> position in buffer
  private observersByHash = new Map<string, Set<string>>();
  private acknowledgedCount = 0;
  private snapshot: LiveSnapshot = { buffer: [], acknowledgedCount: 0, observersByHash: new Map() };
  private listeners = new Set<() => void>();
  private rafId: number | null = null;

  // Per-frame staging. pushOrUpdate is O(1): it only records the change here; the single O(n)
  // materialization (prepend new, apply updates, cap, reindex) happens once per rAF in flush(). This
  // collapses a burst of K packets/frame from K full buffer copies + K index rebuilds into ONE.
  private staged = new Map<string, PacketSummary>(); // hash -> latest summary touched this frame
  private newOrder: string[] = []; // hashes new this frame (not already in buffer), arrival order
  private newSet = new Set<string>(); // membership for newOrder dedup within the frame

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => {
    return this.snapshot;
  };

  private scheduleNotify(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.flush();
    });
  }

  pushOrUpdate(summary: PacketSummary): void {
    const hash = summary.packetHash;
    if (summary.latestObserver) {
      const observers = this.observersByHash.get(hash);
      if (observers) {
        observers.add(summary.latestObserver.id);
      } else {
        this.observersByHash.set(hash, new Set([summary.latestObserver.id]));
      }
    }

    this.staged.set(hash, summary); // latest summary for this hash wins
    // New iff it isn't already in the buffer and hasn't been staged-new earlier this frame. Buffer
    // membership can't change between now and flush (only flush mutates it), so this stays consistent.
    if (!this.hashIndex.has(hash) && !this.newSet.has(hash)) {
      this.newSet.add(hash);
      this.newOrder.push(hash);
    }
    this.scheduleNotify();
  }

  // Apply one frame's staged changes in a single pass, then publish. Equivalent end-state to applying
  // each packet immediately (newest-first prepend, in-place update, oldest-evicted cap).
  private flush(): void {
    if (this.staged.size === 0) return;

    // newest-first: newOrder is arrival order (oldest first), so prepend it reversed
    const prepend: PacketSummary[] = [];
    for (let i = this.newOrder.length - 1; i >= 0; i -= 1) {
      prepend.push(this.staged.get(this.newOrder[i]!)!);
    }
    // apply re-observations to the entries already in the buffer (positions unchanged)
    const updated = this.buffer.map((p) => this.staged.get(p.packetHash) ?? p);
    let next = prepend.length > 0 ? [...prepend, ...updated] : updated;

    if (next.length > LIVE_BUFFER_CAP) {
      // Evict the oldest, but a packet touched this frame always survives over an untouched older one:
      // the old per-packet path evicted such a packet then re-added it as new, so a freshly re-heard
      // packet was never lost. Drop the oldest UNTOUCHED packets first (only dipping into touched ones
      // under absurd >cap/frame load), preserving survivor order.
      const overflow = next.length - LIVE_BUFFER_CAP;
      const evictSet = new Set<string>();
      for (let i = next.length - 1; i >= 0 && evictSet.size < overflow; i -= 1) {
        const hash = next[i]!.packetHash;
        if (!this.staged.has(hash)) evictSet.add(hash);
      }
      for (let i = next.length - 1; i >= 0 && evictSet.size < overflow; i -= 1) {
        evictSet.add(next[i]!.packetHash); // fallback: only if there aren't enough untouched to evict
      }
      next = next.filter((p) => !evictSet.has(p.packetHash));
      for (const hash of evictSet) this.observersByHash.delete(hash);
    }

    this.buffer = next;
    this.hashIndex.clear();
    for (let i = 0; i < next.length; i += 1) this.hashIndex.set(next[i]!.packetHash, i);

    this.staged.clear();
    this.newOrder.length = 0;
    this.newSet.clear();

    this.snapshot = { buffer: this.buffer, acknowledgedCount: this.acknowledgedCount, observersByHash: this.observersByHash };
    for (const l of this.listeners) l();
  }

  acknowledge(): void {
    this.acknowledgedCount = this.buffer.length;
    this.snapshot = { buffer: this.buffer, acknowledgedCount: this.acknowledgedCount, observersByHash: this.observersByHash };
    for (const l of this.listeners) l();
  }

  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.buffer = [];
    this.hashIndex.clear();
    this.observersByHash.clear();
    this.acknowledgedCount = 0;
    this.staged.clear();
    this.newOrder.length = 0;
    this.newSet.clear();
    this.snapshot = { buffer: [], acknowledgedCount: 0, observersByHash: new Map() };
  }
}

// combines live WS stream with paginated history

export function usePackets() {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [store] = useState(() => new LivePacketStore());
  const [laggedCount, setLaggedCount] = useState(0);

  const [prevRegionKey, setPrevRegionKey] = useState(regionKey);
  if (prevRegionKey !== regionKey) {
    setPrevRegionKey(regionKey);
    store.reset();
    setLaggedCount(0);
  }

  const { buffer: liveBuffer, acknowledgedCount, observersByHash } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const summary: PacketSummary = {
        packetHash: data.packetHash,
        payloadType: data.packet.payloadType,
        payloadTypeName: data.packet.payloadTypeName,
        routeType: data.packet.routeType,
        routeTypeName: data.packet.routeTypeName,
        firstHeardAt: data.observation.heardAt,
        lastHeardAt: data.observation.heardAt,
        observationCount: data.packet.observationCount,
        scope: data.packet.scope,
        latestObserver: {
          id: data.observation.observerId,
          displayName: data.observation.observerName,
          iata: data.observation.iata,
        },
      };

      store.pushOrUpdate(summary);
    },
    [store],
  );

  // Reset (drop to one fresh first page) instead of invalidate: an invalidate replays every cached
  // page sequentially — up to 20 requests per lag notice during a flood.
  const handleLagged = useCallback(
    (data: WsLagged) => {
      setLaggedCount((prev) => prev + data.droppedCount);
      queryClient.resetQueries({ queryKey: ["packets", regionKey] });
    },
    [queryClient, regionKey],
  );

  // The WS handler is down whenever this tab is unmounted, so cached history may hide a gap right
  // where the live buffer begins. Refresh the first page on mount to close it.
  useEffect(() => {
    queryClient.resetQueries({ queryKey: ["packets", regionKey] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; region changes refetch via the key
  }, []);

  const dismissLagged = useCallback(() => setLaggedCount(0), []);

  const {
    data: history,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["packets", regionKey],
    // first load and every scroll page are the default 50; getPackets fills in the limit
    queryFn: ({ pageParam }) => getPackets(iatas, { cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as number | undefined,
    staleTime: Infinity,
    maxPages: MAX_INFINITE_PAGES,
  });

  // Flatten history only when the paged data changes, not on every live-buffer frame.
  const historyFlat = useMemo(() => flattenPages(history), [history]);

  // Merge live + history in one pass, deduped by hash, live-first so a live entry shadows its history
  // copy (identical output to the old dedup([...live, ...history]) but without re-flattening/re-spread
  // -ing the full ~1000-item history every rAF batch during a flood).
  const allPackets = useMemo(() => {
    const seen = new Set<string>();
    const merged: PacketSummary[] = [];
    for (const p of liveBuffer) {
      if (seen.has(p.packetHash)) continue;
      seen.add(p.packetHash);
      merged.push(p);
    }
    for (const p of historyFlat) {
      if (seen.has(p.packetHash)) continue;
      seen.add(p.packetHash);
      merged.push(p);
    }
    return merged;
  }, [liveBuffer, historyFlat]);

  const observerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPackets) {
      if (p.latestObserver && !map.has(p.latestObserver.id)) {
        map.set(p.latestObserver.id, p.latestObserver.displayName ?? p.latestObserver.id.slice(0, 8));
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allPackets]);

  const newPacketCount = liveBuffer.length - acknowledgedCount;

  const acknowledgeNewPackets = useCallback(() => {
    store.acknowledge();
  }, [store]);

  return {
    allPackets,
    observerOptions,
    newPacketCount,
    acknowledgeNewPackets,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    observersByHash,
    handlePacketObservation,
    handleLagged,
    laggedCount,
    dismissLagged,
  };
}
