// Response shapes for the /stats/* endpoints and observer telemetry. Verified against beacon-server.

export interface StatsOverview {
  totalPackets: number;
  totalObservations: number;
  activeObservers: number;
  activeIatas: number;
  windowHours: number;
}

export interface ObservationPoint {
  hour: number; // epoch ms, start of the hourly bucket
  iata: string;
  observationCount: number;
  uniquePackets: number;
  activeObservers: number;
}

export interface PayloadBreakdownItem {
  payloadType: number;
  payloadTypeName: string;
  count: number;
}

export interface RouteMixItem {
  routeType: number;
  routeTypeName: string;
  count: number;
}

export interface IataCount {
  iata: string;
  count: number;
}

export interface TopNode {
  nodeId: string;
  nodeName: string | null;
  nodeType: number;
  nodeTypeName: string;
  iata: string;
  observationCount: number;
  lastHeard: number; // epoch ms
}

export interface TopObserver {
  observerId: string;
  displayName: string | null;
  observerType: string | null;
  iata: string;
  observationCount: number;
}

export interface RadioPreset {
  preset: string; // "freqMhz,bwKhz,sf" e.g. "910.525,62.5,7"
  iata: string;
  sourceType: string; // "observer" or "node"
  count: number;
}

export interface ScopeStats {
  name: string; // normalized scope name e.g. "#bc"
  packetCount: number;
  observerCount: number;
  nodeCount: number;
}

export interface NodeTypeCount {
  nodeType: number;
  nodeTypeName: string;
  count: number;
}

export interface StatsWindow {
  since: number;
  until: number;
  bucket: "1h" | "6h" | "24h" | string;
}

export interface StatsHealthSummary {
  totalObservers: number;
  staleObservers: number;
  lowBattery: number;
  highNoise: number;
  highAirtime: number;
  queueBacklog: number;
  receiveErrors: number;
  noTelemetry: number;
}

export interface StatsSummary {
  serverTime: number;
  window: StatsWindow;
  overview: StatsOverview;
  live: {
    serverTime: number;
    since: number;
    until: number;
    latestObservationId: number;
    packetCount: number;
    observationCount: number;
    activeObservers: number;
    payloadMix: PayloadBreakdownItem[];
    routeMix: RouteMixItem[];
    topIatas: IataCount[];
    topObservers: TopObserver[];
  };
  nodeTypes: NodeTypeCount[];
  payloadMix: PayloadBreakdownItem[];
  routeMix: RouteMixItem[];
  topIatas: IataCount[];
  topObservers: TopObserver[];
  topNodes: TopNode[];
  radioPresets: RadioPreset[];
  scopes: ScopeStats[];
  health: StatsHealthSummary;
}

export interface StatsTrendPoint {
  t: number;
  packetCount: number;
  observationCount: number;
  activeObservers: number;
}

export interface StatsRegionRow {
  iata: string;
  packetCount: number;
  observationCount: number;
  activeObservers: number;
  activeNodes: number;
  topPayloadType: number;
  topPayloadTypeName: string;
  topPayloadCount: number;
  topRouteType: number;
  topRouteTypeName: string;
  topRouteCount: number;
  lastHeard: number;
  trend: StatsTrendPoint[];
}

export interface StatsRegions {
  serverTime: number;
  window: StatsWindow;
  items: StatsRegionRow[];
}

export interface StatsPayloadBucket {
  t: number;
  payloadType: number;
  payloadTypeName: string;
  count: number;
}

export interface StatsRouteBucket {
  t: number;
  routeType: number;
  routeTypeName: string;
  count: number;
}

export interface StatsPayloads {
  serverTime: number;
  window: StatsWindow;
  totals: PayloadBreakdownItem[];
  routeTotals: RouteMixItem[];
  payloadTimeline: StatsPayloadBucket[];
  routeTimeline: StatsRouteBucket[];
}

export interface StatsHashSizeCount {
  hashSize: number;
  observationCount: number;
  packetCount: number;
}

export interface StatsHashTimelinePoint {
  t: number;
  hashSize: number;
  observationCount: number;
  packetCount: number;
}

export interface StatsHashCollisionPrefix {
  prefix: string;
  hashSize: number;
  iata: string;
  packetCount: number;
  observationCount: number;
  observerCount: number;
  firstHeard: number;
  lastHeard: number;
}

export interface StatsHashCollisionCell {
  hashSize: number;
  iata: string;
  prefixCount: number;
  packetCount: number;
  observationCount: number;
  observerCount: number;
  firstHeard: number;
  lastHeard: number;
}

export interface StatsHashInconsistentPacket {
  packetHash: string;
  minHashSize: number;
  maxHashSize: number;
  hashSizes: number[];
  iatas: string[];
  observationCount: number;
  firstHeard: number;
  lastHeard: number;
}

export interface StatsHashPrefixPacket {
  packetHash: string;
  pathHash: string;
  hashSize: number;
  hopIndex: number;
  payloadType: number;
  payloadTypeName: string;
  routeType: number;
  routeTypeName: string;
  scope?: string | null;
  iatas: string[];
  observationCount: number;
  observerCount: number;
  latestObserverId?: string;
  latestObserver?: string | null;
  firstHeard: number;
  lastHeard: number;
}

export interface StatsHashPrefixLookup {
  serverTime: number;
  window: StatsWindow;
  prefix: string;
  hashSize?: number;
  matchCount: number;
  packetCount: number;
  observationCount: number;
  observerCount: number;
  iatas: string[];
  items: StatsHashPrefixPacket[];
}

export interface StatsHashAnalytics {
  serverTime: number;
  window: StatsWindow;
  totalPackets: number;
  totalObservations: number;
  multibyteObservations: number;
  inconsistentPacketCount: number;
  collisionPrefixCount: number;
  sizeMix: StatsHashSizeCount[];
  timeline: StatsHashTimelinePoint[];
  riskyPrefixes: StatsHashCollisionPrefix[];
  collisionMatrix: StatsHashCollisionCell[];
  inconsistentPacketSamples: StatsHashInconsistentPacket[];
}

export interface StatsTopologyRepeater {
  nodeId: string;
  nodeName?: string | null;
  nodeType: number;
  nodeTypeName: string;
  iatas: string[];
  routeCount: number;
  observationCount: number;
  lastSeen: number;
}

export interface StatsTopologyPair {
  fromNodeId: string;
  fromNodeName?: string | null;
  toNodeId: string;
  toNodeName?: string | null;
  iata: string;
  routeCount: number;
  observationCount: number;
  lastSeen: number;
}

export interface StatsTopologyHopBucket {
  hopCount: number;
  routeCount: number;
  observationCount: number;
}

export interface StatsTopologyPath {
  routeId: number;
  iata: string;
  hopCount: number;
  nodeIds: string[];
  nodeNames: string[];
  observationCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface StatsTopology {
  serverTime: number;
  window: StatsWindow;
  routeCount: number;
  observationCount: number;
  activeIatas: number;
  averageHopCount: number;
  hopBuckets: StatsTopologyHopBucket[];
  topRepeaters: StatsTopologyRepeater[];
  topPairs: StatsTopologyPair[];
  bestPaths: StatsTopologyPath[];
}

export interface StatsSubpathLengthBucket {
  nodeCount: number;
  routeCount: number;
  subpathCount: number;
  observationCount: number;
}

export interface StatsSubpathRow {
  nodeCount: number;
  nodeIds: string[];
  nodeNames: string[];
  iatas: string[];
  routeCount: number;
  observationCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface StatsSubpathEndpointPair {
  fromNodeId: string;
  fromNodeName?: string | null;
  toNodeId: string;
  toNodeName?: string | null;
  iatas: string[];
  minNodeCount: number;
  maxNodeCount: number;
  routeCount: number;
  observationCount: number;
  lastSeen: number;
}

export interface StatsSubpathTimelinePoint {
  t: number;
  nodeCount: number;
  routeCount: number;
  subpathCount: number;
  observationCount: number;
}

export interface StatsSubpaths {
  serverTime: number;
  window: StatsWindow;
  routeCount: number;
  subpathCount: number;
  uniqueSubpathCount: number;
  observationCount: number;
  averageNodeCount: number;
  lengthBuckets: StatsSubpathLengthBucket[];
  topSubpaths: StatsSubpathRow[];
  topEndpointPairs: StatsSubpathEndpointPair[];
  timeline: StatsSubpathTimelinePoint[];
}

export interface StatsChannelKeyBucket {
  keyState: string;
  channelCount: number;
  messageCount: number;
  packetCount: number;
  observationCount: number;
}

export interface StatsChannelTimelinePoint {
  t: number;
  keyState: string;
  messageCount: number;
  packetCount: number;
  observationCount: number;
}

export interface StatsChannelRow {
  channelId?: number;
  channelHash: string;
  name?: string | null;
  keyState: string;
  isHashtag: boolean;
  keyKnown: boolean;
  messageCount: number;
  packetCount: number;
  observationCount: number;
  activeIatas: number;
  activeObservers: number;
  latestIata: string;
  lastSeen: number;
}

export interface StatsChannelSender {
  senderName: string;
  senderPubkey?: string;
  channelId: number;
  channelHash: string;
  channelName?: string | null;
  messageCount: number;
  observationCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface StatsChannelIata {
  iata: string;
  channelCount: number;
  messageCount: number;
  packetCount: number;
  observationCount: number;
}

export interface StatsChannels {
  serverTime: number;
  window: StatsWindow;
  totalChannels: number;
  knownChannels: number;
  unknownChannels: number;
  hashtagChannels: number;
  publicChannels: number;
  messageCount: number;
  packetCount: number;
  observationCount: number;
  activeIatas: number;
  keyMix: StatsChannelKeyBucket[];
  timeline: StatsChannelTimelinePoint[];
  topChannels: StatsChannelRow[];
  topSenders: StatsChannelSender[];
  topIatas: StatsChannelIata[];
}

export interface StatsObserverHealthFlags {
  stale: boolean;
  lowBattery: boolean;
  highNoise: boolean;
  highAirtime: boolean;
  queueBacklog: boolean;
  receiveErrors: boolean;
  noTelemetry: boolean;
}

export interface StatsObserverHealth {
  observerId: string;
  displayName: string | null;
  observerType: string | null;
  iata: string;
  status: string;
  lastHeard: number;
  observationCount: number;
  telemetryAt?: number;
  hasTelemetry: boolean;
  batteryMv?: number;
  noiseFloorDb?: number;
  airtimeTxPct?: number;
  airtimeRxPct?: number;
  queueLength?: number;
  receiveErrors?: number;
  healthScore: number;
  flags: StatsObserverHealthFlags;
}

export interface StatsObserverHealthResponse {
  serverTime: number;
  window: StatsWindow;
  summary: StatsHealthSummary;
  items: StatsObserverHealth[];
}

export interface StatsObserverCompareItem extends StatsObserverHealth {
  packetCount: number;
  payloadMix: PayloadBreakdownItem[];
  routeMix: RouteMixItem[];
  avgNoiseFloorDb?: number;
  avgAirtimeTxPct?: number;
  avgAirtimeRxPct?: number;
  avgBatteryMv?: number;
  maxQueueLength?: number;
  receiveErrorsSum: number;
}

export interface StatsObserverComparePoint {
  t: number;
  observerId: string;
  packetCount: number;
  observationCount: number;
  noiseFloorDb?: number;
  airtimeTxPct?: number;
  airtimeRxPct?: number;
  queueLength?: number;
  receiveErrors: number;
  batteryMv?: number;
}

export interface StatsObserverCompare {
  serverTime: number;
  window: StatsWindow;
  sharedIatas: string[];
  items: StatsObserverCompareItem[];
  series: StatsObserverComparePoint[];
}

export interface StatsRFHealthIata {
  iata: string;
  activeObservers: number;
  staleObservers: number;
  avgNoiseFloorDb?: number;
  maxAirtimePct?: number;
  maxQueueLength?: number;
  receiveErrors: number;
  lowBattery: number;
  healthScore: number;
}

export interface StatsRFHealthPoint {
  t: number;
  iata: string;
  noiseFloorDb?: number;
  airtimeTxPct?: number;
  airtimeRxPct?: number;
  queueLength?: number;
  receiveErrors: number;
  batteryMv?: number;
}

export interface StatsRFHealth {
  serverTime: number;
  window: StatsWindow;
  summary: StatsHealthSummary;
  byIata: StatsRFHealthIata[];
  topOffenders: StatsObserverHealth[];
  series: StatsRFHealthPoint[];
}

export interface TelemetryPoint {
  t: number; // epoch ms (normalized in useObserverTelemetry — backend raw path emits seconds)
  batteryMv: number | null;
  airtimeTxPct: number | null;
  airtimeRxPct: number | null;
  noiseFloorDb: number | null;
  uptimeSeconds: number | null;
  queueLength: number | null;
  receiveErrors: number | null;
}

export interface ObserverTelemetry {
  range: string;
  interval: string;
  points: TelemetryPoint[];
}

// Sub-tab + time-range identifiers shared across the Stats page.
export type StatsTab = "overview" | "regions" | "payloads" | "hash" | "topology" | "paths" | "channels" | "rf" | "observers" | "scopes";
export type StatsRange = "24h" | "7d" | "30d";

export const RANGE_MS: Record<StatsRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
