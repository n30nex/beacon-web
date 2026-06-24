import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AtlasView } from "../../../src/features/atlas/AtlasView";
import { getAtlasBriefing } from "../../../src/api/client";
import type { WsManager } from "../../../src/api/ws-manager";
import type { AtlasBriefing } from "../../../src/types/api";

vi.mock("../../../src/api/client", () => ({
  getAtlasBriefing: vi.fn(),
}));

vi.mock("../../../src/features/map/useMapLibre", () => ({
  useMapLibre: () => ({
    containerRef: { current: null },
    mapRef: { current: null },
    isReady: false,
    error: null,
  }),
}));

vi.mock("../../../src/features/map/useRouteOverlays", () => ({
  useVerifiedRouteNeighborhoodOverlay: vi.fn(),
}));

const mockGetAtlasBriefing = vi.mocked(getAtlasBriefing);

const wsManager = {
  onNodeUpdate: () => () => {},
} as unknown as WsManager;

function briefing(): AtlasBriefing {
  return {
    serverTime: 1_782_043_200_000,
    region: {
      id: 1,
      slug: "all",
      name: "All Regions",
      iatas: ["YVR"],
    },
    window: { since: 1, until: 2, bucket: "1h" },
    health: {
      status: "ok",
      serverTime: 1_782_043_200_000,
      staleObservers: 0,
      degradedObservers: 0,
      noTelemetry: 0,
      healthScore: 98,
    },
    regions: [
      {
        slug: "all",
        name: "All Regions",
        iataCount: 1,
        packetCount: 12,
        observationCount: 34,
        activeObservers: 2,
        activeIatas: 1,
        activeNodes: 3,
        routeCount: 4,
        observationDeltaPct: 12,
        topIata: "YVR",
        healthScore: 98,
        url: "/?tab=Atlas&atlasRegion=all",
      },
    ],
    priorities: [
      {
        id: "priority-1",
        kind: "hot_iata",
        severity: "info",
        title: "YVR is active",
        detail: "Traffic is healthy",
        region: "all",
        iata: "YVR",
        url: "/?tab=Atlas&atlasRegion=all",
      },
    ],
    hotspots: [
      {
        iata: "YVR",
        displayName: "Vancouver",
        lat: 49.19,
        lng: -123.18,
        observationCount: 34,
        uniquePackets: 12,
        activeObservers: 2,
        url: "/?tab=Map&iata=YVR",
      },
    ],
    degradedObservers: [],
    notableRoutes: [],
    topNodes: [
      {
        nodeId: "node-1",
        nodeName: "Node One",
        nodeType: 1,
        nodeTypeName: "Repeater",
        iata: "YVR",
        observationCount: 20,
        lastHeard: 1_782_043_200_000,
      },
    ],
    topObservers: [
      {
        observerId: "obs-1",
        displayName: "Observer One",
        observerType: "station",
        iata: "YVR",
        observationCount: 18,
      },
    ],
    payloadMix: [{ payloadType: 1, payloadTypeName: "Position", count: 12 }],
    routeMix: [{ routeType: 1, routeTypeName: "Direct", count: 10 }],
    scopes: [{ name: "#bc", observerCount: 2, nodeCount: 3, iataCount: 1 }],
  };
}

function renderAtlas() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/?tab=Atlas"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  render(<AtlasView wsManager={wsManager} selectedNodeId={null} onSelectNode={vi.fn()} />, { wrapper });
}

beforeEach(() => {
  mockGetAtlasBriefing.mockReset();
});

describe("AtlasView route states", () => {
  it("shows a focused loading state while the briefing is pending", () => {
    mockGetAtlasBriefing.mockReturnValue(new Promise(() => {}));

    renderAtlas();

    expect(screen.getByText("Preparing Atlas briefing")).toBeInTheDocument();
    expect(screen.getByText(/Gathering regional health/i)).toBeInTheDocument();
  });

  it("offers a retry when the briefing endpoint fails", async () => {
    mockGetAtlasBriefing.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(briefing());

    renderAtlas();

    expect(await screen.findByText("Atlas briefing unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Atlas briefing" }));
    expect(await screen.findByRole("heading", { name: "All Regions" })).toBeInTheDocument();
    expect(screen.getByText("YVR is active")).toBeInTheDocument();
  });
});
