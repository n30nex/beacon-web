import { describe, expect, it } from "vitest";
import { buildObserverJsonExport, observerJsonFilename } from "../../../src/features/observers/observer-export";
import type { AdvertObservation, Observer, ObserverTopologySummary } from "../../../src/features/observers/types";

const observer: Observer = {
  id: "obs-1",
  displayName: "Roof Observer",
  observerType: "mqtt",
  iata: "YVR",
  status: "online",
  publicKey: "aabbccddeeff",
  radioFreqMhz: 915,
  radioSf: 11,
  radioBwKhz: 250,
  firstSeen: 1_782_043_000_000,
  lastSeen: 1_782_043_200_000,
  observationCount: 1200,
  brokers: [{ name: "mqtt-primary", lastSeenAt: 1_782_043_200_000, lastPacketAt: 1_782_043_199_000 }],
};

const topology: ObserverTopologySummary = {
  serverTime: 1_782_043_200_000,
  window: { since: 1, until: 2, bucket: "1h" },
  observerId: "obs-1",
  packetCount: 12,
  observationCount: 34,
  activeIatas: 2,
  avgSnr: 7.2,
  payloadMix: [{ payloadType: 4, payloadTypeName: "Advert", count: 10 }],
  routeMix: [{ routeType: 0, routeTypeName: "Flood", count: 8 }],
  topNodes: [],
  topTraceTags: [],
  topScopes: [],
  recentAdverts: [],
};

const advert: AdvertObservation = {
  id: 101,
  packetHash: "packet-101",
  payloadType: 4,
  payloadTypeName: "Advert",
  iata: "YVR",
  heardAt: 1_782_043_190_000,
  nodeName: "Node Alpha",
};

describe("observer JSON export", () => {
  it("builds a stable observer health snapshot", () => {
    const exported = buildObserverJsonExport(
      {
        observer,
        derivedStatus: "online",
        range: "24h",
        regionKey: "YVR",
        iatas: ["YVR"],
        healthStats: { noise_floor: -117, queue_len: 2, recv_errors: 1 },
        topology,
        adverts: { items: [advert], nextCursor: 101, hasMore: true },
      },
      "2026-06-21T14:30:00.000Z",
    );

    expect(exported.schema).toBe("beacon.observer.v1");
    expect(exported.exportedAt).toBe("2026-06-21T14:30:00.000Z");
    expect(exported.source).toEqual({ app: "Beacon", surface: "ObserverDetail" });
    expect(exported.regionScope).toEqual({ iatas: ["YVR"], regionKey: "YVR" });
    expect(exported.range).toBe("24h");
    expect(exported.derivedStatus).toBe("online");
    expect(exported.healthStats?.noise_floor).toBe(-117);
    expect(exported.observer.id).toBe("obs-1");
    expect(exported.topology?.observationCount).toBe(34);
    expect(exported.advertsHeard?.items[0]?.packetHash).toBe("packet-101");
    expect(exported.advertsHeard?.hasMore).toBe(true);
  });

  it("creates a filesystem-safe observer JSON filename", () => {
    expect(observerJsonFilename("obs:abc/def 123_extra")).toBe("beacon-observer-obsabcdef123_extra.json");
    expect(observerJsonFilename("***")).toBe("beacon-observer-unknown.json");
  });
});
