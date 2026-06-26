import { describe, expect, it } from "vitest";
import { pulseNodeFlashEvents, resolveVisiblePulseEdgeId } from "../../../src/features/netgraph/netgraph-three-effects";
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

describe("netgraph live packet effect visibility", () => {
  it("keeps packets on their real route when the edge is visible", () => {
    const resolved = resolveVisiblePulseEdgeId({
      pulseId: "pulse-alpha",
      segmentEdgeId: "node-alpha>node-bravo",
      segmentIndex: 0,
      visibleEdgeIds: new Set(["node-alpha>node-bravo", "node-bravo>node-charlie"]),
    });

    expect(resolved).toEqual({ edgeId: "node-alpha>node-bravo", mirrored: false });
  });

  it("mirrors hidden packets onto a visible focus route deterministically", () => {
    const visibleEdgeIds = new Set(["node-alpha>node-bravo", "node-bravo>node-charlie"]);
    const first = resolveVisiblePulseEdgeId({
      pulseId: "pulse-hidden",
      segmentEdgeId: "node-xray>node-yankee",
      segmentIndex: 2,
      visibleEdgeIds,
    });
    const second = resolveVisiblePulseEdgeId({
      pulseId: "pulse-hidden",
      segmentEdgeId: "node-xray>node-yankee",
      segmentIndex: 2,
      visibleEdgeIds,
    });

    expect(first).toEqual(second);
    expect(first?.mirrored).toBe(true);
    expect(first?.edgeId).toBeDefined();
    expect(visibleEdgeIds.has(first?.edgeId ?? "")).toBe(true);
  });

  it("omits hidden packets when no focus route is visible", () => {
    const resolved = resolveVisiblePulseEdgeId({
      pulseId: "pulse-hidden",
      segmentEdgeId: "node-xray>node-yankee",
      segmentIndex: 1,
      visibleEdgeIds: new Set(),
    });

    expect(resolved).toBeNull();
  });

  it("fires a tx node flash when a packet departs the first hop", () => {
    const flashes = pulseNodeFlashEvents(pulse(), 1000);

    expect(flashes).toEqual([
      expect.objectContaining({ nodeId: "node-alpha", direction: "tx", progress: 0 }),
    ]);
  });

  it("keeps the departure flash visible long enough to read in the overview", () => {
    const flashes = pulseNodeFlashEvents(pulse(), 1880);

    expect(flashes).toEqual([
      expect.objectContaining({ nodeId: "node-alpha", direction: "tx" }),
    ]);
    expect(flashes[0]?.strength).toBeGreaterThan(0.3);
  });

  it("times relay rx and tx flashes at the segment boundary", () => {
    const flashes = pulseNodeFlashEvents(pulse(), 2000);

    expect(flashes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "node-bravo", direction: "rx", progress: 0 }),
      expect.objectContaining({ nodeId: "node-bravo", direction: "tx", progress: 0 }),
    ]));
  });

  it("keeps the final rx node shining just after packet arrival", () => {
    const flashes = pulseNodeFlashEvents(pulse(), 2260, 820);

    expect(flashes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "node-bravo", direction: "rx" }),
      expect.objectContaining({ nodeId: "node-bravo", direction: "tx" }),
    ]));

    const finalFlashes = pulseNodeFlashEvents(pulse(), 3260, 820);
    expect(finalFlashes).toEqual([
      expect.objectContaining({ nodeId: "node-charlie", direction: "rx", terminal: true }),
    ]);
  });
});
