import { describe, expect, it } from "vitest";
import {
  mergePulseRouteHeat,
  pruneRouteHeat,
  routeHeatIntensityAt,
} from "../../../src/features/netgraph/netgraph-route-heat";
import { routeHeatEffectsEnabled } from "../../../src/features/netgraph/netgraph-three-route-heat";
import type { NetgraphPulse } from "../../../src/features/netgraph/netgraph-model";

function pulse(overrides: Partial<NetgraphPulse> = {}): NetgraphPulse {
  return {
    id: "pulse-alpha",
    payloadTypeName: "TEXT",
    color: "#ffd166",
    txNodeId: "node-alpha",
    rxNodeId: "node-charlie",
    txColor: "#7ab7ff",
    rxColor: "#54e1a6",
    startedAt: 1000,
    durationMs: 2000,
    segments: [
      { edgeId: "node-alpha>node-bravo", fromId: "node-alpha", toId: "node-bravo", reverse: false },
      { edgeId: "node-bravo>node-charlie", fromId: "node-bravo", toId: "node-charlie", reverse: false },
    ],
    ...overrides,
  };
}

describe("netgraph route heat", () => {
  it("creates a heat entry for each packet route segment", () => {
    const heat = mergePulseRouteHeat([], pulse(), 1000);

    expect(heat).toHaveLength(2);
    expect(heat).toEqual(expect.arrayContaining([
      expect.objectContaining({ edgeId: "node-alpha>node-bravo", color: "#7ab7ff", direction: "tx" }),
      expect.objectContaining({ edgeId: "node-bravo>node-charlie", color: "#54e1a6", direction: "tx" }),
    ]));
  });

  it("boosts repeated use on the same edge instead of adding duplicates", () => {
    const first = mergePulseRouteHeat([], pulse(), 1000);
    const second = mergePulseRouteHeat(first, pulse({ id: "pulse-beta", startedAt: 1400 }), 1400);

    expect(second.filter((heat) => heat.edgeId === "node-alpha>node-bravo")).toHaveLength(1);
    expect(second.find((heat) => heat.edgeId === "node-alpha>node-bravo")?.intensity).toBeGreaterThan(first.find((heat) => heat.edgeId === "node-alpha>node-bravo")?.intensity ?? 0);
  });

  it("fades route heat after peak and prunes expired entries", () => {
    const [heat] = mergePulseRouteHeat([], pulse({ segments: [{ edgeId: "a>b", fromId: "a", toId: "b", reverse: false }] }), 1000);
    expect(heat).toBeDefined();
    const active = routeHeatIntensityAt(heat!, heat!.peakAt);
    const faded = routeHeatIntensityAt(heat!, heat!.decayUntil - 400);

    expect(active).toBeGreaterThan(faded);
    expect(pruneRouteHeat([heat!], heat!.decayUntil + 1)).toEqual([]);
  });

  it("keeps heavy heat effects off in low power modes", () => {
    const base = { animationsDisabled: false, batteryQuality: false, lowPower: false, reducedMotion: false };
    expect(routeHeatEffectsEnabled(base)).toBe(true);
    expect(routeHeatEffectsEnabled({ ...base, lowPower: true })).toBe(false);
    expect(routeHeatEffectsEnabled({ ...base, batteryQuality: true })).toBe(false);
    expect(routeHeatEffectsEnabled({ ...base, reducedMotion: true })).toBe(false);
  });
});
