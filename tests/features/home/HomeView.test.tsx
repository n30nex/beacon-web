import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import { HomeView } from "../../../src/features/home/HomeView";
import { getLiveSummary, getRegion, getRegions, getStatsHome } from "../../../src/api/client";
import type { PageTab } from "../../../src/lib/navigation";
import type { WsManager } from "../../../src/api/ws-manager";

vi.mock("../../../src/api/client", () => ({
  getRegion: vi.fn(),
  getRegions: vi.fn(),
  getStatsHome: vi.fn(),
  getLiveSummary: vi.fn(),
}));

const wsManager = {
  onPacketObservation: () => () => {},
  onLagged: () => () => {},
  onStatusChange: () => () => {},
  onDiagnosticsChange: () => () => {},
  getStatus: () => "connected",
  getDiagnostics: () => ({ status: "connected", activeSubscriptionId: "home-test" }),
} as unknown as WsManager;

function renderHome(onNavigate: (tab: PageTab) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <BrowserRouter>
      <QueryClientProvider client={client}>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          <HomeView wsManager={wsManager} onNavigate={onNavigate} />
        </RegionProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/?tab=Home");
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
  vi.mocked(getRegion).mockReset();
  vi.mocked(getLiveSummary).mockReset().mockResolvedValue({
    serverTime: 1,
    since: 0,
    until: 1,
    latestObservationId: 99,
    packetCount: 12,
    observationCount: 34,
    activeObservers: 3,
    payloadMix: [],
    routeMix: [],
    topIatas: [{ iata: "YVR", count: 20 }],
    topObservers: [],
  });
  vi.mocked(getStatsHome).mockReset().mockResolvedValue({
    serverTime: 1,
    window: { since: 0, until: 1, bucket: "1h" },
    overview: { totalPackets: 1234, totalObservations: 5678, activeObservers: 9, activeIatas: 4, windowHours: 24 },
    live: {
      serverTime: 1,
      since: 0,
      until: 1,
      latestObservationId: 99,
      packetCount: 12,
      observationCount: 34,
      activeObservers: 3,
      payloadMix: [],
      routeMix: [],
      topIatas: [{ iata: "YVR", count: 20 }],
      topObservers: [],
    },
    topIatas: [{ iata: "YVR", count: 20 }],
    topObservers: [{ observerId: "obs1", displayName: "Observer One", observerType: "mqtt", iata: "YVR", observationCount: 15 }],
    topNodes: [{ nodeId: "node1", nodeName: "Node One", nodeType: 1, nodeTypeName: "repeater", iata: "YVR", observationCount: 25, lastHeard: Date.now() }],
  });
});

describe("HomeView", () => {
  it("renders real overview data without Atlas briefing language", async () => {
    renderHome();

    expect(await screen.findByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("5,678")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Home commands" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Activity now" })).toBeInTheDocument();
    expect(screen.getAllByText("Node One")).toHaveLength(3);
    expect(screen.getByText("Live packets")).toBeInTheDocument();
    expect(screen.queryByText(/Atlas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Network critical/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Investigate Queue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/RF Flags/i)).not.toBeInTheDocument();
  });

  it("renders compact command buttons instead of oversized shortcut tiles", async () => {
    const onNavigate = vi.fn();
    renderHome(onNavigate);

    const commands = await screen.findByRole("region", { name: "Home commands" });
    const mapCommand = within(commands).getByRole("button", { name: "Map" });

    expect(commands).toHaveClass("hidden");
    expect(commands).toHaveClass("md:block");
    expect(mapCommand).toHaveClass("h-9");
    expect(mapCommand).not.toHaveClass("aspect-square");
    fireEvent.click(mapCommand);
    expect(onNavigate).toHaveBeenCalledWith("Map");
  });

  it("deep-links ranked entities by their stable IDs", async () => {
    renderHome();
    const topNode = (await screen.findAllByText("Node One"))[0]?.closest("button");
    expect(topNode).toBeTruthy();

    fireEvent.click(topNode!);

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("Nodes");
    expect(new URLSearchParams(window.location.search).get("nodeId")).toBe("node1");
  });
});
