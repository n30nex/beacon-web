import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouteDetailPanel } from "../../../src/features/routes/RouteDetailPanel";
import type { KnownRoute } from "../../../src/types/api";

const route: KnownRoute = {
  id: 77,
  iata: "YVR",
  hopCount: 2,
  observationCount: 42,
  firstSeen: 1_782_043_000_000,
  lastSeen: 1_782_043_200_000,
  hops: [
    {
      nodeId: "node-a",
      hashBytes: "aa",
      node: { id: "node-a", publicKey: "aabb", name: "Alpha" },
    },
    {
      nodeId: "node-b",
      hashBytes: "bb",
      node: { id: "node-b", publicKey: "bbcc", name: "Beta" },
    },
  ],
};

describe("RouteDetailPanel handoff actions", () => {
  it("copies a route JSON handoff with hop context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<RouteDetailPanel route={route} onClose={vi.fn()} onViewOnMap={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Copy route JSON"));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const exported = JSON.parse(writeText.mock.calls[0]![0] as string);
    expect(exported.schema).toBe("beacon.route.v1");
    expect(exported.routeId).toBe(77);
    expect(exported.iata).toBe("YVR");
    expect(exported.observationCount).toBe(42);
    expect(exported.hops[0].node.name).toBe("Alpha");
    expect(screen.getByText("Copied JSON")).toBeInTheDocument();
  });

  it("keeps the existing map handoff", () => {
    const onViewOnMap = vi.fn();
    render(<RouteDetailPanel route={route} onClose={vi.fn()} onViewOnMap={onViewOnMap} />);

    fireEvent.click(screen.getByText("View on Map"));

    expect(onViewOnMap).toHaveBeenCalledWith(route);
  });
});
