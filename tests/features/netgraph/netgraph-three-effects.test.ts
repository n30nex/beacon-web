import { describe, expect, it } from "vitest";
import { resolveVisiblePulseEdgeId } from "../../../src/features/netgraph/netgraph-three-effects";

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
});
