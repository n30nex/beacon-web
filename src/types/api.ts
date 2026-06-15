import type { PathConfidence } from "./enums";

// response wrappers

export interface CursorPage<T> {
  items: T[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface LatestObserver {
  id: string;
  displayName?: string;
  iata: string;
}

// packet list and detail shapes

export interface PacketSummary {
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  routeType: number;
  routeTypeName: string;
  firstHeardAt: number;
  lastHeardAt: number;
  observationCount: number;
  latestObserver?: LatestObserver;
  scope?: string; // matched transport scope name, e.g. "#bc"
}

export interface ResolvedNode {
  id: string; // uuid
  name?: string;
  publicKey: string; // hex-encoded prefix
  latitude?: number; // decimal degrees (resolved DB value, not the 1e7 advert encoding)
  longitude?: number;
}

export interface ResolvedHop {
  confidence: PathConfidence;
  nodes: ResolvedNode[]; // empty when confidence is "none"
  snr?: number; // per-hop link SNR (dB) when the backend resolved it
  hashBytes?: string; // hex per-hop path-hash prefix, carried by RouteHop; trace hops get theirs from rawPath instead
}

export interface PathLength {
  raw: string; // path-length byte as hex (e.g. "1e")
  hashSize: number; // bytes per hop hash
  hopCount: number;
}

export interface Observation {
  id: number;
  observerId: string;
  observerName?: string;
  iata: string;
  heardAt: number;
  pathLength: PathLength;
  pathBytes?: string;
  rssi?: number;
  snr?: number;
  propagationTimeMs?: number;
  radio?: {
    freqMhz?: number;
    spreadFactor?: number;
    bandwidthKhz?: number;
    codingRate?: number;
  };
  sourceBroker: string;
  resolvedPath: ResolvedHop[];
}

export interface PacketHeader {
  raw: string; // header byte as hex (e.g. "11")
  routeType: number;
  routeTypeName: string;
  payloadType: number;
  payloadTypeName: string;
  payloadVersion: number;
}

export interface TransportCodes {
  regionCode: number;
  subRegionCode: number;
}

export interface PacketDetail {
  packetHash: string;
  header: PacketHeader;
  transportCodes?: TransportCodes;
  scope?: string; // matched transport scope name, e.g. "#bc"
  originPubkey?: string;
  parsedPayload?: Record<string, unknown> | string;
  rawPayload: string;
  decrypted: boolean;
  channelHash?: string;
  firstHeardAt: number;
  lastHeardAt: number;
  firstToLastMs: number; // ms between first and last hearing — the packet's overall propagation time
  observationCount: number;
  // trace packets only: the resolved intended route from the trace's path hashes (one hop per hash)
  resolvedRoute?: ResolvedHop[];
  observations: Observation[];
}

// region metadata

export interface IataCode {
  iata: string;
  displayName?: string;
  lat?: number;
  lon?: number;
}

// A region groups IATAs under a URL-safe slug. The list endpoint returns summaries; the detail
// endpoint adds the member IATAs and map-focus hints.
export interface RegionSummary {
  id: number;
  slug: string; // e.g. "western-canada"
  name: string;
}

export interface Region extends RegionSummary {
  description?: string;
  centerLat?: number;
  centerLng?: number;
  zoomLevel?: number;
  iatas: string[]; // member IATA codes
}

export interface BrokerStatus {
  name: string;
  connected: boolean;
}

export interface HealthDependency {
  status: string;
  detail?: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  serverTime: number;
  dependencies: Record<string, HealthDependency>;
  brokers: BrokerStatus[];
}

export interface LiveRouteMixItem {
  routeType: number;
  routeTypeName: string;
  count: number;
}

export interface LiveIataCount {
  iata: string;
  count: number;
}

export interface LiveSummary {
  serverTime: number;
  since: number;
  until: number;
  latestObservationId: number;
  packetCount: number;
  observationCount: number;
  activeObservers: number;
  payloadMix: PayloadBreakdownItemShape[];
  routeMix: LiveRouteMixItem[];
  topIatas: LiveIataCount[];
  topObservers: TopObserverShape[];
}

// known routes — fully resolved multi-hop paths discovered at ingest, where every hop matched a node
// at high confidence. One RouteHop per hash, in order.
export interface RouteHop {
  nodeId: string; // uuid of the resolved node
  hashBytes: string; // hex-encoded path-hash prefix for this hop
  node?: ResolvedNode; // resolved node detail for this hop
}

export interface KnownRoute {
  id: number;
  iata: string;
  hopCount: number;
  hops: RouteHop[];
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  observationCount: number;
}

export interface RouteNeighborhoodNode {
  id: string;
  name?: string;
  publicKey: string;
  lat: number;
  lng: number;
  hopDistance: number;
}

export interface RouteNeighborhoodEdge {
  fromNodeId: string;
  toNodeId: string;
  iata: string;
  routeIds: number[];
  hopDistance: number;
  lastSeen: number;
  observationCount: number;
}

export interface NodeRouteNeighborhood {
  nodeId: string;
  maxHops: number;
  nodes: RouteNeighborhoodNode[];
  edges: RouteNeighborhoodEdge[];
}

// the boundary hop in a cross-IATA route: the link from the last node in the source IATA to the
// first node in the target IATA.
export interface CrossIATAHop {
  fromNode: ResolvedNode;
  toNode: ResolvedNode;
  fromIata: string;
  toIata: string;
  lastSeen: number; // epoch ms
}

// a route spanning two IATAs: a segment in the source IATA, the boundary hop, then a segment in the
// target IATA. From GET /routes/cross.
export interface CrossIATARoute {
  sourceSegment: RouteHop[];
  crossHop: CrossIATAHop;
  targetSegment: RouteHop[];
  totalHops: number;
}

// trace tags — a trace series groups the packets that share a 4-byte trace tag. The list endpoint
// returns per-tag summaries; the detail endpoint returns the tag's packets with their resolved routes.
export interface TraceTagSummary {
  traceTag: string; // hex-encoded 4-byte tag
  firstHeardAt: number; // epoch ms
  lastHeardAt: number; // epoch ms
  packetCount: number;
  iataCount: number; // distinct IATAs the tag was heard in
}

export interface RawHop {
  hash: string; // hex per-hop path-hash prefix
  snr?: number; // per-hop link SNR (dB) when known
}

export interface TracePacket {
  packetHash: string;
  routeType: number;
  routeTypeName: string;
  scope?: string; // matched transport scope name, when any
  firstHeardAt: number; // epoch ms
  lastHeardAt: number; // epoch ms
  rawPath: RawHop[]; // one hop per trace path hash, index-aligned with resolvedRoute
  resolvedRoute: ResolvedHop[]; // one hop per trace path hash; nodes empty when unresolved
}

export interface TraceDetail {
  traceTag: string;
  packets: TracePacket[];
}

export interface AtlasWindow {
  since: number;
  until: number;
}

export interface AtlasIata {
  iata: string;
  displayName?: string;
  lat?: number;
  lng?: number;
  observationCount: number;
  uniquePackets: number;
  activeObservers: number;
}

export interface AtlasStoryBeat {
  id: string;
  kind: string;
  title: string;
  detail: string;
  iata?: string;
  value?: number;
  at?: number;
}

export interface AtlasPathPoint {
  kind: "origin" | "observer" | string;
  label?: string;
  iata?: string;
  lat: number;
  lng: number;
  at?: number;
}

export interface AtlasReplayPacket {
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  routeType: number;
  routeTypeName: string;
  scope?: string;
  firstHeardAt: number;
  lastHeardAt: number;
  observationCount: number;
  iatas: string[];
  latestObserver?: LatestObserver;
  origin?: ResolvedNode;
  path: AtlasPathPoint[];
}

export interface RegionAtlasSummary {
  region: Region;
  window: AtlasWindow;
  kpis: StatsOverviewShape;
  iatas: AtlasIata[];
  hourly: ObservationPointShape[];
  nodeTypes: NodeTypeCount[];
  payloadMix: PayloadBreakdownItemShape[];
  topNodes: TopNodeShape[];
  topObservers: TopObserverShape[];
  radioPresets: RadioPresetShape[];
  scopes: ScopeSummary[];
  storyBeats: AtlasStoryBeat[];
}

export interface StatsOverviewShape {
  totalPackets: number;
  totalObservations: number;
  activeObservers: number;
  activeIatas: number;
  windowHours: number;
}

export interface ObservationPointShape {
  hour: number;
  iata: string;
  observationCount: number;
  uniquePackets: number;
  activeObservers: number;
}

export interface PayloadBreakdownItemShape {
  payloadType: number;
  payloadTypeName: string;
  count: number;
}

export interface TopNodeShape {
  nodeId: string;
  nodeName?: string;
  nodeType: number;
  nodeTypeName: string;
  iata: string;
  observationCount: number;
  lastHeard: number;
}

export interface TopObserverShape {
  observerId: string;
  displayName?: string;
  observerType?: string;
  iata: string;
  observationCount: number;
}

export interface RadioPresetShape {
  preset: string;
  iata: string;
  sourceType: string;
  count: number;
}

export interface ScopeSummary {
  name: string;
  observerCount: number;
  nodeCount: number;
  iataCount: number;
}

export interface NodeTypeCount {
  nodeType: number;
  nodeTypeName: string;
  count: number;
}
