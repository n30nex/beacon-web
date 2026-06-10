import { describe, it, expect } from "vitest";
import { normalizeTelemetry } from "../../../src/features/stats/useTelemetry";
import type { ObserverTelemetry } from "../../../src/features/stats/types";

const SEC = 1_700_000_000; // a second-scale epoch
const MS = SEC * 1000;

describe("normalizeTelemetry", () => {
  it("scales raw (1h) second-epoch points up to ms", () => {
    const raw: ObserverTelemetry = {
      range: "24h",
      interval: "1h",
      points: [{ t: SEC, batteryMv: 3700, airtimeTxPct: null, airtimeRxPct: null, noiseFloorDb: null, uptimeSeconds: null, queueLength: null, receiveErrors: null }],
    };
    expect(normalizeTelemetry(raw, "1h").points[0]!.t).toBe(MS);
  });

  it("leaves bucketed (6h/24h) ms-epoch points untouched", () => {
    const bucketed: ObserverTelemetry = {
      range: "7d",
      interval: "6h",
      points: [{ t: MS, batteryMv: 3700, airtimeTxPct: null, airtimeRxPct: null, noiseFloorDb: null, uptimeSeconds: null, queueLength: null, receiveErrors: null }],
    };
    expect(normalizeTelemetry(bucketed, "6h").points[0]!.t).toBe(MS);
  });

  it("does not mutate other fields", () => {
    const raw: ObserverTelemetry = {
      range: "24h",
      interval: "1h",
      points: [{ t: SEC, batteryMv: 3700, airtimeTxPct: 1.5, airtimeRxPct: 2.5, noiseFloorDb: -110, uptimeSeconds: 42, queueLength: 3, receiveErrors: 1 }],
    };
    const p = normalizeTelemetry(raw, "1h").points[0]!;
    expect(p.batteryMv).toBe(3700);
    expect(p.airtimeTxPct).toBe(1.5);
    expect(p.receiveErrors).toBe(1);
  });
});
