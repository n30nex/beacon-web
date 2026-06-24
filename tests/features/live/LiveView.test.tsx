import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LiveView } from "../../../src/features/live/LiveView";
import { getIatas, getLiveBackfill, getLiveSummary } from "../../../src/api/client";
import type { WsManager } from "../../../src/api/ws-manager";

const useMapLibreMock = vi.hoisted(() => vi.fn());
const useMapNodesDataMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/features/map/useMapLibre", () => ({
  useMapLibre: useMapLibreMock,
}));

vi.mock("../../../src/features/map/useMapNodes", () => ({
  useMapNodes: vi.fn(),
}));

vi.mock("../../../src/features/map/useMapNodesData", () => ({
  useMapNodesData: useMapNodesDataMock,
}));

vi.mock("../../../src/features/map/useNodeUpdates", () => ({
  useCoalescedNodeUpdates: () => vi.fn(),
}));

vi.mock("../../../src/features/map/useRouteOverlays", () => ({
  useVerifiedRouteNeighborhoodOverlay: vi.fn(),
}));

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: undefined, regionKey: "*" }),
}));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({ themeId: "terminal", themes: [], paletteRev: 0 }),
}));

vi.mock("../../../src/api/client", () => ({
  getIatas: vi.fn(),
  getLiveBackfill: vi.fn(),
  getLiveSummary: vi.fn(),
}));

const mockGetIatas = vi.mocked(getIatas);
const mockGetLiveBackfill = vi.mocked(getLiveBackfill);
const mockGetLiveSummary = vi.mocked(getLiveSummary);

const wsManager = {
  getDiagnostics: () => ({
    status: "connected",
    lastEventTimestamp: Date.now(),
    connectedAt: Date.now(),
    reconnectAttempt: 0,
    parseFailureCount: 0,
    lastParseFailureAt: null,
    laggedNoticeCount: 0,
    lastLaggedAt: null,
    lastLaggedDroppedCount: null,
    lastLaggedSince: null,
    activeSubscriptionId: "sub-1",
  }),
  onDiagnosticsChange: () => () => {},
  onPacketObservation: () => () => {},
  onLagged: () => () => {},
  onNodeUpdate: () => () => {},
} as unknown as WsManager;

function renderLiveView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <LiveView wsManager={wsManager} onAnalyze={vi.fn()} selectedNodeId={null} onSelectNode={vi.fn()} />,
    { wrapper },
  );
}

beforeEach(() => {
  localStorage.clear();
  mockGetIatas.mockResolvedValue([]);
  mockGetLiveSummary.mockResolvedValue({
    serverTime: Date.now(),
    totalPackets: 0,
    totalObservations: 0,
    observationCount: 0,
    latestObservationId: 0,
    latestHeardAt: null,
    payloadMix: [],
    routeMix: [],
  });
  mockGetLiveBackfill.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  useMapNodesDataMock.mockReturnValue({
    nodes: [],
    loadedCount: 0,
    isPaging: false,
    isError: false,
    updatedAt: null,
  });
  useMapLibreMock.mockReturnValue({
    containerRef: { current: null },
    mapRef: { current: null },
    isReady: false,
    error: new Error("map failed"),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LiveView map route states", () => {
  it("offers a real map reload action when the live basemap fails to initialize", async () => {
    renderLiveView();

    expect(screen.getByText("Live map failed to load")).toBeInTheDocument();
    expect(screen.getByText(/browser graphics context/i)).toBeInTheDocument();
    expect(useMapLibreMock.mock.calls.at(-1)?.[3]).toMatchObject({ resetKey: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Reload live map" }));

    await waitFor(() => expect(useMapLibreMock.mock.calls.at(-1)?.[3]).toMatchObject({ resetKey: 1 }));
  });
});
