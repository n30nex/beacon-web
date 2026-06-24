import type { LivePacketEvent } from "./live-model";
import {
  LIVE_PROPAGATION_GROUP_HARD_CAP,
  LIVE_VISUAL_COALESCE_MS,
  MAX_PENDING_ANIMATIONS,
  MAX_PROPAGATION_WAVE_PATHS,
  liveVisualCaps,
  type LiveAnimation,
  type LiveAnimationRequest,
  type LiveVisualQuality,
  type PropagationGroup,
} from "./live-visuals";

interface MutableRef<T> {
  current: T;
}

export function samplePropagationEvents(events: LivePacketEvent[], cap = MAX_PROPAGATION_WAVE_PATHS): LivePacketEvent[] {
  if (events.length <= cap) return events;
  if (cap <= 1) return events.slice(-1);

  const last = events.length - 1;
  return Array.from({ length: cap }, (_, index) => events[Math.round((index * last) / (cap - 1))]!);
}

export function shouldAnimateLiveEvent(
  lastVisualByPacket: Map<string, number>,
  event: LivePacketEvent,
  now = performance.now(),
): boolean {
  const previous = lastVisualByPacket.get(event.packetHash);
  lastVisualByPacket.set(event.packetHash, now);
  if (lastVisualByPacket.size > 256) {
    for (const key of lastVisualByPacket.keys()) {
      lastVisualByPacket.delete(key);
      if (lastVisualByPacket.size <= 192) break;
    }
  }
  return previous == null || now - previous > LIVE_VISUAL_COALESCE_MS;
}

export function enqueueLiveAnimation(options: {
  pendingVisualDroppedRef: MutableRef<number>;
  request: LiveAnimationRequest;
  scheduleLiveStateFlush: () => void;
  visualPressureRef: MutableRef<number>;
  visualQueueRef: MutableRef<LiveAnimationRequest[]>;
}) {
  const caps = liveVisualCaps(undefined, options.visualPressureRef.current);
  const maxPendingAnimations = Math.min(MAX_PENDING_ANIMATIONS, caps.activeAnimations * 3);
  options.visualQueueRef.current.push(options.request);
  if (options.visualQueueRef.current.length > maxPendingAnimations) {
    const dropped = options.visualQueueRef.current.length - maxPendingAnimations;
    options.visualQueueRef.current = options.visualQueueRef.current.slice(-maxPendingAnimations);
    options.pendingVisualDroppedRef.current += dropped;
    options.scheduleLiveStateFlush();
  }
}

export function drainLiveAnimationQueue(options: {
  animationsRef: MutableRef<LiveAnimation[]>;
  pendingVisualDroppedRef: MutableRef<number>;
  playAnimation: (event: LivePacketEvent, waveIndex?: number, waveCount?: number) => boolean;
  publishedVisualQualityRef: MutableRef<LiveVisualQuality>;
  publishedVisualQueueSizeRef: MutableRef<number>;
  scheduleLiveStateFlush: () => void;
  setVisualQuality: (quality: LiveVisualQuality) => void;
  setVisualQueueSize: (size: number) => void;
  visualPressureRef: MutableRef<number>;
  visualQueueRef: MutableRef<LiveAnimationRequest[]>;
}) {
  const caps = liveVisualCaps(undefined, options.visualPressureRef.current);
  const active = options.animationsRef.current.length;
  const queued = options.visualQueueRef.current.length;
  if (queued > 0 && active < caps.activeAnimations) {
    const batchSize = active < caps.activeAnimations / 2 ? 2 : 1;
    const slots = Math.min(batchSize, caps.activeAnimations - active, queued);
    const maxAttempts = Math.min(queued, Math.max(slots, slots * 5));
    let played = 0;
    let skipped = 0;
    for (let attempts = 0; attempts < maxAttempts && played < slots; attempts += 1) {
      const next = options.visualQueueRef.current.shift();
      if (!next) break;
      if (options.playAnimation(next.event, next.waveIndex, next.waveCount)) {
        played += 1;
      } else {
        skipped += 1;
      }
    }
    if (skipped > 0) {
      options.pendingVisualDroppedRef.current += skipped;
      options.scheduleLiveStateFlush();
    }
  }
  if (options.publishedVisualQueueSizeRef.current !== options.visualQueueRef.current.length) {
    options.publishedVisualQueueSizeRef.current = options.visualQueueRef.current.length;
    options.setVisualQueueSize(options.visualQueueRef.current.length);
  }
  if (options.publishedVisualQualityRef.current !== caps.quality) {
    options.publishedVisualQualityRef.current = caps.quality;
    options.setVisualQuality(caps.quality);
  }
}

export function flushLivePropagationGroup(options: {
  packetHash: string;
  pendingVisualDroppedRef: MutableRef<number>;
  propagationGroupsRef: MutableRef<Map<string, PropagationGroup>>;
  queueAnimation: (request: LiveAnimationRequest) => void;
  scheduleLiveStateFlush: () => void;
  visualPressureRef: MutableRef<number>;
}) {
  const group = options.propagationGroupsRef.current.get(options.packetHash);
  if (!group) return;
  options.propagationGroupsRef.current.delete(options.packetHash);

  const ordered = group.events
    .slice()
    .sort((a, b) => a.receivedAt - b.receivedAt || a.sequence - b.sequence);
  const pressure = options.visualPressureRef.current;
  const cap = pressure >= 2 ? 3 : pressure >= 1 ? 4 : MAX_PROPAGATION_WAVE_PATHS;
  const sampled = samplePropagationEvents(ordered, cap);
  const skipped = ordered.length - sampled.length;
  if (skipped > 0) {
    options.pendingVisualDroppedRef.current += skipped;
    options.scheduleLiveStateFlush();
  }
  sampled.forEach((event, index) => {
    options.queueAnimation({ event, waveIndex: index, waveCount: sampled.length });
  });
}

export function scheduleLiveAnimation(options: {
  event: LivePacketEvent;
  flushPropagationGroup: (packetHash: string) => void;
  pendingVisualDroppedRef: MutableRef<number>;
  propagationGroupsRef: MutableRef<Map<string, PropagationGroup>>;
  queueAnimation: (request: LiveAnimationRequest) => void;
  realisticPropagation: boolean;
  scheduleLiveStateFlush: () => void;
  visualPressureRef: MutableRef<number>;
}) {
  if (!options.realisticPropagation) {
    options.queueAnimation({ event: options.event, waveIndex: 0, waveCount: 1 });
    return;
  }

  const current = options.propagationGroupsRef.current.get(options.event.packetHash);
  if (current) {
    if (current.events.length >= LIVE_PROPAGATION_GROUP_HARD_CAP) {
      options.pendingVisualDroppedRef.current += 1;
      options.scheduleLiveStateFlush();
      return;
    }
    current.events.push(options.event);
    return;
  }

  const timer = setTimeout(
    () => options.flushPropagationGroup(options.event.packetHash),
    options.visualPressureRef.current >= 2 ? 260 : 420,
  );
  options.propagationGroupsRef.current.set(options.event.packetHash, { events: [options.event], timer });
}
