import type { Observation, PacketDetail } from "../../types/api";

export interface PacketJsonExport {
  schema: "beacon.packet.v1";
  exportedAt: string;
  source: {
    app: "Beacon";
    surface: "PacketAnalyzer";
  };
  packetHash: string;
  header: PacketDetail["header"];
  transportCodes?: PacketDetail["transportCodes"];
  scope?: string;
  originPubkey?: string;
  channelHash?: string;
  decrypted: boolean;
  rawPayload: string;
  reconstructedFrameHex?: string;
  timing: {
    firstHeardAt: number;
    lastHeardAt: number;
    firstToLastMs: number;
    observationCount: number;
  };
  selectedObservationId?: number;
  selectedObservation?: Observation;
  observations: Observation[];
  parsedPayload?: PacketDetail["parsedPayload"];
  resolvedRoute?: PacketDetail["resolvedRoute"];
}

export function buildPacketJsonExport(detail: PacketDetail, selectedObservation: Observation | null, reconstructedFrameHex: string, exportedAt = new Date().toISOString()): PacketJsonExport {
  return {
    schema: "beacon.packet.v1",
    exportedAt,
    source: {
      app: "Beacon",
      surface: "PacketAnalyzer",
    },
    packetHash: detail.packetHash,
    header: detail.header,
    transportCodes: detail.transportCodes,
    scope: detail.scope,
    originPubkey: detail.originPubkey,
    channelHash: detail.channelHash,
    decrypted: detail.decrypted,
    rawPayload: detail.rawPayload,
    reconstructedFrameHex: reconstructedFrameHex || undefined,
    timing: {
      firstHeardAt: detail.firstHeardAt,
      lastHeardAt: detail.lastHeardAt,
      firstToLastMs: detail.firstToLastMs,
      observationCount: detail.observationCount,
    },
    selectedObservationId: selectedObservation?.id,
    selectedObservation: selectedObservation ?? undefined,
    observations: detail.observations,
    parsedPayload: detail.parsedPayload,
    resolvedRoute: detail.resolvedRoute,
  };
}

export function packetJsonFilename(packetHash: string): string {
  const safeHash = packetHash.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "unknown";
  return `beacon-packet-${safeHash}.json`;
}
