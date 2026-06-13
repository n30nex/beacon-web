import { describe, expect, it } from "vitest";
import {
  LIVE_FEED_CAP,
  activityBins,
  countRecent,
  mergeQueuedEvents,
  prependBounded,
  toLivePacketEvent,
  topPayloads,
  type LivePacketEvent,
} from "../../../src/features/live/live-model";
import type { WsPacketObservation } from "../../../src/types/ws";

function wsPacket(hash: string, overrides: Partial<WsPacketObservation["data"]> = {}): WsPacketObservation["data"] {
  return {
    packetHash: hash,
    packet: {
      payloadType: 4,
      payloadTypeName: "ADVERT",
      routeType: 1,
      routeTypeName: "FLOOD",
      isFirstObservation: true,
      observationCount: 1,
      scope: "#bc",
    },
    observation: {
      observerId: "obs-1",
      observerName: "Observer 1",
      iata: "YOW",
      heardAt: 1000,
      rssi: -91,
      snr: 8.5,
      sourceBroker: "meshcore",
    },
    ...overrides,
  };
}

function event(id: string, receivedAt: number, payloadTypeName = "ADVERT"): LivePacketEvent {
  return toLivePacketEvent(
    wsPacket(id, {
      packetHash: id,
      packet: { ...wsPacket(id).packet, payloadTypeName },
    }),
    Number(id.replace(/\D/g, "")) || 1,
    receivedAt,
  );
}

describe("live packet model", () => {
  it("normalizes WebSocket packet observations for the Live page", () => {
    const normalized = toLivePacketEvent(wsPacket("abc123"), 7, 2000);
    expect(normalized).toMatchObject({
      sequence: 7,
      packetHash: "abc123",
      payloadTypeName: "ADVERT",
      routeTypeName: "FLOOD",
      observerName: "Observer 1",
      iata: "YOW",
      receivedAt: 2000,
      scope: "#bc",
    });
    expect(normalized.id).toContain("abc123");
  });

  it("keeps newest events first and bounded", () => {
    let events: LivePacketEvent[] = [];
    for (let i = 0; i < LIVE_FEED_CAP + 5; i++) {
      events = prependBounded(events, event(`h${i}`, i), LIVE_FEED_CAP);
    }
    expect(events).toHaveLength(LIVE_FEED_CAP);
    expect(events[0]!.packetHash).toBe(`h${LIVE_FEED_CAP + 4}`);
    expect(events.at(-1)!.packetHash).toBe("h5");
  });

  it("merges queued paused packets ahead of the current feed", () => {
    const current = [event("h1", 100), event("h0", 90)];
    const queued = [event("h3", 300), event("h2", 200)];
    expect(mergeQueuedEvents(current, queued, 3).map((e) => e.packetHash)).toEqual(["h3", "h2", "h1"]);
  });

  it("counts recent packets and builds fixed activity bins", () => {
    const events = [event("h1", 1000), event("h2", 2000), event("h3", 8000)];
    expect(countRecent(events, 10_000, 5_000)).toBe(1);
    expect(activityBins(events, 10_000, 10_000, 5)).toEqual([1, 1, 0, 0, 1]);
  });

  it("sorts top payloads by frequency", () => {
    const events = [
      event("h1", 1000, "TRACE"),
      event("h2", 2000, "ADVERT"),
      event("h3", 3000, "TRACE"),
    ];
    expect(topPayloads(events).map((p) => [p.typeName, p.count])).toEqual([
      ["TRACE", 2],
      ["ADVERT", 1],
    ]);
  });
});
