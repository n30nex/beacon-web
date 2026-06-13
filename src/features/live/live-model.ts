import type { WsPacketObservation } from "../../types/ws";

export const LIVE_FEED_CAP = 80;
export const LIVE_TIMELINE_BINS = 48;
export const LIVE_TIMELINE_WINDOW_MS = 5 * 60_000;

export interface LivePacketEvent {
  id: string;
  sequence: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  routeType: number;
  routeTypeName: string;
  rawHex?: string;
  observationCount: number;
  observerId: string;
  observerName: string;
  iata: string;
  heardAt: number;
  receivedAt: number;
  rssi: number;
  snr: number;
  sourceBroker: string;
  pathBytes?: string;
  pathHashSize?: number;
  hopCount?: number;
  propagationTimeMs?: number;
  scope?: string;
}

export const PAYLOAD_COLORS: Record<string, string> = {
  ADVERT: "#22C55E",
  GRP_TXT: "#3B82F6",
  TXT_MSG: "#EAB308",
  ACK: "#73737B",
  REQUEST: "#A78BFA",
  RESPONSE: "#06B6D4",
  TRACE: "#EC4899",
  PATH: "#14B8A6",
  ANON_REQ: "#F43F5E",
  GRP_DATA: "#8B5CF6",
  MULTIPART: "#0D9488",
  CONTROL: "#B45309",
  RAW_CUSTOM: "#C026D3",
};

const PAYLOAD_ALIASES: Record<string, string> = {
  ADVERTISEMENT: "ADVERT",
  TEXT_MESSAGE: "TXT_MSG",
  TXT_MESSAGE: "TXT_MSG",
  DIRECT_TEXT: "TXT_MSG",
  GROUP_TEXT: "GRP_TXT",
  GROUP_MESSAGE: "GRP_TXT",
  CHANNEL_MESSAGE: "GRP_TXT",
  ANONYMOUS_REQUEST: "ANON_REQ",
  ANON_REQUEST: "ANON_REQ",
  ROUTE_TRACE: "TRACE",
  PATH_DISCOVERY: "PATH",
  GROUP_DATA: "GRP_DATA",
  RAW: "RAW_CUSTOM",
};

export function payloadLabel(typeName: string): string {
  const normalized = typeName.trim().replace(/[\s-]+/g, "_").toUpperCase();
  if (!normalized) return "UNKNOWN";
  return PAYLOAD_ALIASES[normalized] ?? normalized;
}

export function payloadColor(typeName: string): string {
  return PAYLOAD_COLORS[payloadLabel(typeName)] ?? "#A1A1AA";
}

export function normalizeHex(value: string | undefined): string {
  return (value ?? "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

export function hexBytes(value: string | undefined, maxBytes = 72): string[] {
  const normalized = normalizeHex(value);
  const bytes: string[] = [];
  for (let i = 0; i + 1 < normalized.length && bytes.length < maxBytes; i += 2) {
    bytes.push(normalized.slice(i, i + 2));
  }
  return bytes;
}

export function hashColor(hash: string): string {
  const seed = hashSeed(hash);
  const hue = seed % 360;
  return `hsl(${hue} 88% 60%)`;
}

export function toLivePacketEvent(
  data: WsPacketObservation["data"],
  sequence: number,
  receivedAt = Date.now(),
): LivePacketEvent {
  return {
    id: `${receivedAt}-${sequence}-${data.packetHash}`,
    sequence,
    packetHash: data.packetHash,
    payloadType: data.packet.payloadType,
    payloadTypeName: data.packet.payloadTypeName,
    routeType: data.packet.routeType,
    routeTypeName: data.packet.routeTypeName,
    rawHex: data.packet.rawHex,
    observationCount: data.packet.observationCount,
    scope: data.packet.scope,
    observerId: data.observation.observerId,
    observerName: data.observation.observerName,
    iata: data.observation.iata,
    heardAt: data.observation.heardAt,
    receivedAt,
    rssi: data.observation.rssi,
    snr: data.observation.snr,
    sourceBroker: data.observation.sourceBroker,
    pathBytes: data.observation.pathBytes,
    pathHashSize: data.observation.pathLength?.hashSize,
    hopCount: data.observation.pathLength?.hopCount,
    propagationTimeMs: data.observation.propagationTimeMs,
  };
}

export function prependBounded<T>(items: readonly T[], item: T, cap: number): T[] {
  return [item, ...items].slice(0, cap);
}

export function mergeQueuedEvents(
  current: readonly LivePacketEvent[],
  queuedNewestFirst: readonly LivePacketEvent[],
  cap = LIVE_FEED_CAP,
): LivePacketEvent[] {
  return [...queuedNewestFirst, ...current].slice(0, cap);
}

export function countRecent(events: readonly LivePacketEvent[], now: number, windowMs: number): number {
  const cutoff = now - windowMs;
  return events.reduce((count, event) => count + (event.receivedAt >= cutoff ? 1 : 0), 0);
}

export function activityBins(
  events: readonly LivePacketEvent[],
  now: number,
  windowMs = LIVE_TIMELINE_WINDOW_MS,
  binCount = LIVE_TIMELINE_BINS,
): number[] {
  const bins = Array.from({ length: binCount }, () => 0);
  const start = now - windowMs;
  const binMs = windowMs / binCount;
  for (const event of events) {
    if (event.receivedAt < start || event.receivedAt > now) continue;
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((event.receivedAt - start) / binMs)));
    bins[idx] = (bins[idx] ?? 0) + 1;
  }
  return bins;
}

export function topPayloads(
  events: readonly LivePacketEvent[],
  limit = 6,
): Array<{ typeName: string; count: number; color: string }> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const label = payloadLabel(event.payloadTypeName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([typeName, count]) => ({ typeName, count, color: payloadColor(typeName) }))
    .sort((a, b) => b.count - a.count || a.typeName.localeCompare(b.typeName))
    .slice(0, limit);
}

export function hashSeed(hash: string): number {
  let seed = 0;
  for (let i = 0; i < hash.length; i++) {
    seed = (seed * 33 + hash.charCodeAt(i)) >>> 0;
  }
  return seed;
}
