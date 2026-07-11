import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WS_EVENT_TYPES } from "../../src/types/ws";

const serverRoot = process.env.BEACON_SERVER_ROOT ?? resolve(process.cwd(), "../beacon-server");
const protocolDoc = readFileSync(resolve(serverRoot, "docs/ws-protocol.md"), "utf8");

describe("backend WebSocket contract", () => {
  it("keeps the frontend live event list aligned with the server protocol doc", () => {
    expect(WS_EVENT_TYPES).toEqual(["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"]);
    for (const eventType of WS_EVENT_TYPES) {
      expect(protocolDoc, `server protocol doc must mention ${eventType}`).toContain(`\`${eventType}\``);
    }
  });

  it("documents the server and client message types consumed by WsManager", () => {
    for (const messageType of ["hello", "subscribed", "unsubscribed", "pong", "event", "lagged", "error"]) {
      expect(protocolDoc, `server protocol doc must mention ${messageType}`).toContain(`\`${messageType}\``);
    }
    for (const messageType of ["subscribe", "unsubscribe", "ping"]) {
      expect(protocolDoc, `server protocol doc must mention ${messageType}`).toContain(`\`${messageType}\``);
    }
  });

  it("documents subscription fields sent by the frontend", () => {
    for (const field of ["iatas", "regionIds", "regionSlugs", "payloadTypes", "routeTypes", "channelHashes", "observerIds", "events"]) {
      expect(protocolDoc, `server protocol doc must mention ${field}`).toContain(`\`${field}\``);
    }
  });
});
