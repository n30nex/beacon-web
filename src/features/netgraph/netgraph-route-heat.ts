import {
  MAX_NETGRAPH_ROUTE_HEAT,
  type NetgraphPulse,
  type NetgraphRouteHeat,
} from "./netgraph-model";

export const ROUTE_HEAT_DECAY_MS = 10000;
const ROUTE_HEAT_PRUNE_FLOOR = 0.018;

export function routeHeatIntensityAt(heat: NetgraphRouteHeat, now: number): number {
  if (now < heat.startedAt || now > heat.decayUntil) return 0;
  const attackDuration = Math.max(80, heat.peakAt - heat.startedAt);
  if (now <= heat.peakAt) {
    const attack = (now - heat.startedAt) / attackDuration;
    return heat.intensity * (0.38 + Math.min(1, Math.max(0, attack)) * 0.62);
  }
  const decay = 1 - (now - heat.peakAt) / Math.max(1, heat.decayUntil - heat.peakAt);
  return heat.intensity * Math.pow(Math.min(1, Math.max(0, decay)), 1.45);
}

export function pruneRouteHeat(routeHeat: NetgraphRouteHeat[], now: number): NetgraphRouteHeat[] {
  return routeHeat
    .filter((heat) => heat.decayUntil > now && routeHeatIntensityAt(heat, now) > ROUTE_HEAT_PRUNE_FLOOR)
    .slice(-MAX_NETGRAPH_ROUTE_HEAT);
}

export function mergePulseRouteHeat(
  current: NetgraphRouteHeat[],
  pulse: NetgraphPulse,
  now = Date.now(),
): NetgraphRouteHeat[] {
  if (pulse.segments.length === 0 || pulse.durationMs <= 0) return pruneRouteHeat(current, now);

  const byEdge = new Map<string, NetgraphRouteHeat>();
  for (const heat of current) {
    if (heat.decayUntil > now || heat.startedAt > now) byEdge.set(heat.edgeId, heat);
  }

  const segmentDuration = pulse.durationMs / pulse.segments.length;
  for (const [segmentIndex, segment] of pulse.segments.entries()) {
    const segmentStart = pulse.startedAt + segmentIndex * segmentDuration;
    const segmentEnd = segmentStart + segmentDuration;
    const peakAt = segmentEnd;
    const decayUntil = peakAt + ROUTE_HEAT_DECAY_MS;
    const existing = byEdge.get(segment.edgeId);
    const existingIntensity = existing ? routeHeatIntensityAt(existing, Math.max(now, segmentStart)) : 0;
    const isTerminal = segmentIndex === pulse.segments.length - 1;
    byEdge.set(segment.edgeId, {
      id: segment.edgeId,
      edgeId: segment.edgeId,
      payloadTypeName: pulse.payloadTypeName,
      color: pulse.color,
      direction: segment.reverse ? "rx" : "tx",
      reverse: segment.reverse,
      intensity: Math.min(2.45, existingIntensity + (isTerminal ? 0.96 : 0.78)),
      startedAt: existing ? Math.min(existing.startedAt, segmentStart) : segmentStart,
      peakAt: Math.max(existing?.peakAt ?? 0, peakAt),
      decayUntil: Math.max(existing?.decayUntil ?? 0, decayUntil),
    });
  }

  return Array.from(byEdge.values())
    .sort((a, b) => b.decayUntil - a.decayUntil || b.intensity - a.intensity)
    .slice(0, MAX_NETGRAPH_ROUTE_HEAT);
}
