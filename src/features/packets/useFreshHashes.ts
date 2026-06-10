import { useEffect, useRef, useState } from "react";
import type { PacketSummary } from "../../types/api";
import { LIVE_BUFFER_CAP } from "../../lib/constants";

const FRESH_HIGHLIGHT_MS = 1000;

// Tracks which packet hashes just arrived so rows can flash. The first batch is the baseline
// (no flash); after that, every leading run of unseen hashes is fresh for FRESH_HIGHLIGHT_MS.
export function useFreshHashes(packets: PacketSummary[]): Set<string> {
  const [prevPackets, setPrevPackets] = useState<PacketSummary[] | null>(null);
  const [known, setKnown] = useState<Set<string> | null>(null); // null until the baseline batch
  const [freshHashes, setFreshHashes] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<string[][]>([]);
  const scheduledRef = useRef(new WeakSet<string[]>());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // detect fresh arrivals during render, not in an effect
  if (packets !== prevPackets) {
    setPrevPackets(packets);
    if (known === null) {
      if (packets.length > 0) setKnown(new Set(packets.map((p) => p.packetHash)));
    } else {
      const newFresh: string[] = [];
      for (const p of packets) {
        if (known.has(p.packetHash)) break;
        newFresh.push(p.packetHash);
      }

      let nextKnown = new Set(known);
      for (const p of packets) nextKnown.add(p.packetHash);
      if (nextKnown.size > LIVE_BUFFER_CAP * 2) {
        nextKnown = new Set(packets.map((p) => p.packetHash));
      }
      if (nextKnown.size !== known.size) setKnown(nextKnown);

      if (newFresh.length > 0) {
        const merged = new Set(freshHashes);
        for (const h of newFresh) merged.add(h);
        setFreshHashes(merged);
        setBatches([...batches, newFresh]);
      }
    }
  }

  // each batch clears on its own timer, so a later batch can't cancel an earlier clear
  useEffect(() => {
    for (const batch of batches) {
      if (scheduledRef.current.has(batch)) continue;
      scheduledRef.current.add(batch);
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        setBatches((prev) => prev.filter((b) => b !== batch));
        setFreshHashes((prev) => {
          const next = new Set(prev);
          for (const h of batch) next.delete(h);
          return next;
        });
      }, FRESH_HIGHLIGHT_MS);
      timersRef.current.add(timer);
    }
  }, [batches]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  return freshHashes;
}
