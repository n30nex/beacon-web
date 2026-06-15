export interface NodeIATA {
  iata: string;
  lastHeard: number; // unix ms
}

export interface NodeSummary {
  id: string;
  publicKey: string;
  nodeType: number;
  nodeTypeName: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radio?: string; // compact "freq,bw,sf" string, e.g. "915.0,250,11"; absent when unknown
  defaultScope?: string; // most recently matched transport scope name, e.g. "#bc"
  iatas: NodeIATA[];
  // Set when this node also runs as an observer (watches traffic for uplink). isObserver drives the
  // map's observer-pip marker variant; observerId, when present, links to that observer's detail.
  isObserver?: boolean;
  observerId?: string;
}

export interface Node extends NodeSummary {
  locationSource: string | null;
  lastAdvertAt: number | null; // epoch ms
  supportsMultibytePaths: boolean;
  supportsMultibyteTraces: boolean;
  minFirmwareVersion: string | null;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  metadata: Record<string, unknown> | null;
}

// First-hop neighbor of a node, from GET /nodes/{id}/neighbors (bare array, no pagination).
export interface NodeNeighbor {
  id: string;
  name?: string;
  nodeType: number;
  nodeTypeName: string;
  lat?: number;
  lng?: number;
  iata: string;
  observationCount: number;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
}

export interface NodeObservation {
  id: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  iata: string;
  heardAt: number; // epoch ms
  rssi?: number;
  snr?: number;
  hopCount?: number;
}

export interface NodeAnalyticsCount {
  key: string;
  label: string;
  count: number;
}

export interface NodeActivityPoint {
  timestamp: number;
  packets: number;
  observations: number;
}

export interface NodeSignalBucket {
  bucket: string;
  count: number;
}

export interface NodeAnalyticsPeer {
  id: string;
  name?: string;
  publicKey: string;
  nodeTypeName: string;
  iata: string;
  observationCount: number;
  lastSeen: number;
}

export interface NodeAnalytics {
  nodeId: string;
  since: number;
  until: number;
  kpis: {
    packetCount: number;
    observationCount: number;
    activeObservers: number;
    activeIatas: number;
    firstHeardAt?: number;
    lastHeardAt?: number;
    avgSnr?: number;
    avgRssi?: number;
    avgHopCount?: number;
  };
  payloadMix: NodeAnalyticsCount[];
  routeMix: NodeAnalyticsCount[];
  iataMix: NodeAnalyticsCount[];
  hourly: NodeActivityPoint[];
  snrBuckets: NodeSignalBucket[];
  rssiBuckets: NodeSignalBucket[];
  hopBuckets: NodeSignalBucket[];
  topObservers: NodeAnalyticsCount[];
  topPeers: NodeAnalyticsPeer[];
}

export interface NodeReachHopBucket {
  hopDistance: number;
  nodeCount: number;
  edgeCount: number;
  routeCount: number;
  observationCount: number;
}

export interface NodeReachNode {
  id: string;
  name?: string;
  publicKey: string;
  hopDistance: number;
  iatas: string[];
  routeCount: number;
  observationCount: number;
  lastSeen: number;
}

export interface NodeReachIata {
  iata: string;
  nodeCount: number;
  edgeCount: number;
  routeCount: number;
  observationCount: number;
  lastSeen: number;
}

export interface NodeReach {
  nodeId: string;
  maxHops: number;
  generatedAt: number;
  reachableNodes: number;
  verifiedEdges: number;
  routeCount: number;
  observationCount: number;
  hopBuckets: NodeReachHopBucket[];
  topNodes: NodeReachNode[];
  topIatas: NodeReachIata[];
}
