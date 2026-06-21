import { describe, expect, it } from "vitest";
import { buildPacketJsonExport, packetJsonFilename } from "../../../src/features/packets/packet-export";
import { PayloadType, RouteType } from "../../../src/types/enums";
import type { Observation, PacketDetail } from "../../../src/types/api";

const observation: Observation = {
  id: 42,
  observerId: "observer-1",
  observerName: "Roof",
  iata: "YVR",
  heardAt: 1_782_043_200_000,
  rssi: -91,
  snr: 7,
  pathLength: { raw: "81", hashSize: 1, hopCount: 1 },
  pathBytes: "aa",
  sourceBroker: "mqtt-primary",
  resolvedPath: [],
};

const detail: PacketDetail = {
  packetHash: "deadbeef",
  header: {
    raw: "11",
    routeType: RouteType.FLOOD,
    routeTypeName: "FLOOD",
    payloadType: PayloadType.ADVERT,
    payloadTypeName: "Advert",
    payloadVersion: 1,
  },
  scope: "#bc",
  rawPayload: "aabbcc",
  parsedPayload: { name: "Beacon Node" },
  decrypted: false,
  firstHeardAt: 1_782_043_199_000,
  lastHeardAt: 1_782_043_200_000,
  firstToLastMs: 1000,
  observationCount: 1,
  observations: [observation],
};

describe("packet JSON export", () => {
  it("builds a stable operator handoff payload", () => {
    const exported = buildPacketJsonExport(detail, observation, "1181aaaabbcc", "2026-06-21T13:30:00.000Z");

    expect(exported.schema).toBe("beacon.packet.v1");
    expect(exported.exportedAt).toBe("2026-06-21T13:30:00.000Z");
    expect(exported.source).toEqual({ app: "Beacon", surface: "PacketAnalyzer" });
    expect(exported.packetHash).toBe("deadbeef");
    expect(exported.rawPayload).toBe("aabbcc");
    expect(exported.reconstructedFrameHex).toBe("1181aaaabbcc");
    expect(exported.timing).toEqual({
      firstHeardAt: 1_782_043_199_000,
      lastHeardAt: 1_782_043_200_000,
      firstToLastMs: 1000,
      observationCount: 1,
    });
    expect(exported.selectedObservationId).toBe(42);
    expect(exported.selectedObservation).toEqual(observation);
    expect(exported.observations).toEqual([observation]);
    expect(exported.parsedPayload).toEqual({ name: "Beacon Node" });
  });

  it("creates a filesystem-safe packet JSON filename", () => {
    expect(packetJsonFilename("ab:cd/ef deadbeef-01_extra")).toBe("beacon-packet-abcdefdeadbeef-01_extra.json");
    expect(packetJsonFilename("***")).toBe("beacon-packet-unknown.json");
  });
});
