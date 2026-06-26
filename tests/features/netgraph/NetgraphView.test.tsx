import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { NetgraphView } from "../../../src/features/netgraph/NetgraphView";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import { getLiveBackfill, getNetgraphSnapshot, getRegion, getRegions } from "../../../src/api/client";
import type { WsManager } from "../../../src/api/ws-manager";
import type { NetgraphSnapshot } from "../../../src/types/api";
import type { WsPacketObservation } from "../../../src/types/ws";

vi.mock("../../../src/features/netgraph/ThreeNetgraphCanvas", () => ({
  ThreeNetgraphCanvas: ({
    onSelectNode,
    onSelectRoute,
    onError,
    searchMatches,
    viewMode,
    qualityMode,
    showDataQuality,
  }: {
    onSelectNode: (nodeId: string) => void;
    onSelectRoute: (routeId: number) => void;
    onError: (message: string) => void;
    searchMatches: Set<string>;
    viewMode: string;
    qualityMode: string;
    showDataQuality: boolean;
  }) => (
    <div data-testid="mock-netgraph-canvas">
      <output aria-label="search matches">{searchMatches.size}</output>
      <output aria-label="canvas mode">{viewMode}</output>
      <output aria-label="canvas quality">{qualityMode}</output>
      <output aria-label="canvas data overlay">{showDataQuality ? "on" : "off"}</output>
      <button type="button" onClick={() => onSelectNode("node-alpha")}>Pick Alpha</button>
      <button type="button" onClick={() => onSelectRoute(42)}>Pick Route</button>
      <button type="button">Blank Canvas</button>
      <button type="button" onClick={() => onError("no webgl")}>Break WebGL</button>
    </div>
  ),
}));

vi.mock("../../../src/api/client", () => ({
  getLiveBackfill: vi.fn(),
  getNetgraphSnapshot: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

const mockGetLiveBackfill = vi.mocked(getLiveBackfill);
const mockGetNetgraphSnapshot = vi.mocked(getNetgraphSnapshot);
const mockGetRegions = vi.mocked(getRegions);
const mockGetRegion = vi.mocked(getRegion);

function snapshot(overrides: Partial<NetgraphSnapshot> = {}): NetgraphSnapshot {
  return {
    serverTime: Date.now(),
    stats: {
      sourceRouteCount: 1,
      mappedRouteCount: 1,
      nodeCount: 2,
      edgeCount: 1,
      observationCount: 25,
      activeIatas: 1,
      truncatedRoutes: false,
      truncatedNodes: false,
      truncatedEdges: false,
    },
    limits: {
      routeLimit: 2500,
      nodeLimit: 2600,
      edgeLimit: 4200,
    },
    nodes: [
      node("node-alpha", "Alpha", "Repeater"),
      node("node-bravo", "Bravo", "Room"),
    ],
    edges: [
      {
        id: "node-alpha>node-bravo",
        fromNodeId: "node-alpha",
        toNodeId: "node-bravo",
        iatas: ["YVR"],
        routeIds: [42],
        routeCount: 1,
        observationCount: 25,
        firstSeen: 1,
        lastSeen: Date.now(),
      },
    ],
    ...overrides,
  };
}

function node(id: string, name: string, nodeTypeName: string): NetgraphSnapshot["nodes"][number] {
  return {
    id,
    name,
    publicKey: `${id.slice(0, 8)}feed`,
    nodeType: 0,
    nodeTypeName,
    lat: 49,
    lng: -123,
    isObserver: false,
    iatas: ["YVR"],
    routeIds: [42],
    routeCount: 1,
    observationCount: 25,
    firstSeen: 1,
    lastSeen: Date.now(),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

function packetData(path: string[]): WsPacketObservation["data"] {
  return {
    packetHash: "hash-1",
    packet: {
      payloadType: 1,
      payloadTypeName: "TEXT",
      routeType: 0,
      routeTypeName: "ROUTE_FLOOD",
      isFirstObservation: true,
      observationCount: 1,
    },
    observation: {
      id: 99,
      observerId: "observer-1",
      observerName: "Observer",
      iata: "YVR",
      heardAt: Date.now(),
      rssi: -78,
      snr: 7,
      sourceBroker: "test",
      resolvedPath: path.map((id) => ({
        confidence: "high",
        nodes: [{ id, name: id, publicKey: `${id}pk` }],
      })),
    },
  };
}

function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderNetgraph(initialSearch = "?tab=Netgraph", wsManager?: WsManager, selectedNodeId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSelectNode = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/${initialSearch}`]}>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          {children}
          <LocationProbe />
        </RegionProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

  render(<NetgraphView selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} wsManager={wsManager} />, { wrapper });
  return { onSelectNode };
}

beforeEach(() => {
  mockGetLiveBackfill.mockReset().mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mockGetNetgraphSnapshot.mockReset().mockResolvedValue(snapshot());
  mockGetRegions.mockReset().mockResolvedValue([]);
  mockGetRegion.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NetgraphView", () => {
  it("loads snapshot data into the 3D topology workspace", async () => {
    renderNetgraph();

    expect(await screen.findByRole("heading", { name: "Netgraph" })).toBeInTheDocument();
    expect(await screen.findByTestId("mock-netgraph-canvas")).toBeInTheDocument();
    expect(screen.getByText(/2 connected nodes/)).toBeInTheDocument();
    expect(mockGetNetgraphSnapshot).toHaveBeenCalledWith({ iatas: undefined, routeLimit: 2500 });
  });

  it("starts mobile devices at a lighter route cap", async () => {
    stubMatchMedia((query) => query === "(max-width: 767px)");
    renderNetgraph();

    expect(await screen.findByRole("heading", { name: "Netgraph" })).toBeInTheDocument();
    expect(await screen.findByTestId("mock-netgraph-canvas")).toBeInTheDocument();
    expect(mockGetNetgraphSnapshot).toHaveBeenCalledWith({ iatas: undefined, routeLimit: 800 });
    fireEvent.click(screen.getByRole("button", { name: "Open netgraph settings" }));
    expect(screen.getByRole("button", { name: "800" })).toHaveAttribute("aria-pressed", "true");
  });

  it("changes density and refetches with the selected route cap", async () => {
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Open netgraph settings" }));
    fireEvent.click(screen.getByRole("button", { name: "1,600" }));

    await waitFor(() => expect(mockGetNetgraphSnapshot).toHaveBeenCalledWith({ iatas: undefined, routeLimit: 1600 }));
  });

  it("passes Galaxy and Low Power visual modes into the 3D canvas", async () => {
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    expect(screen.getByLabelText("canvas mode")).toHaveTextContent("galaxy");
    expect(screen.getByLabelText("canvas quality")).toHaveTextContent("high");
    expect(screen.getByLabelText("canvas data overlay")).toHaveTextContent("on");

    fireEvent.click(screen.getByRole("button", { name: "Open netgraph settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Low Power/ }));

    expect(screen.getByLabelText("canvas quality")).toHaveTextContent("battery");
    expect(screen.getByLabelText("canvas data overlay")).toHaveTextContent("off");
  });

  it("keeps settings focused on the two visual modes", async () => {
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Open netgraph settings" }));

    expect(screen.getByRole("group", { name: "Netgraph visual mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Galaxy/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Low Power/ })).toBeInTheDocument();
    expect(screen.queryByText("Advanced")).not.toBeInTheDocument();
  });

  it("focuses search matches without leaving the canvas", async () => {
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.change(screen.getByPlaceholderText("Search nodes"), { target: { value: "alpha" } });

    expect(screen.getByLabelText("search matches")).toHaveTextContent("2");
  });

  it("selects nodes and preserves the selected node in the URL", async () => {
    const { onSelectNode } = renderNetgraph("?tab=Netgraph&routeId=42");
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Pick Alpha" }));

    expect(onSelectNode).toHaveBeenCalledWith("node-alpha");
    expect(screen.getByLabelText("canvas mode")).toHaveTextContent("focus");
    expect(screen.getByLabelText("location")).toHaveTextContent("nodeId=node-alpha");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("routeId=42");
  });

  it("shows a compact node focus panel without leaving topology mode", async () => {
    const { onSelectNode } = renderNetgraph("?tab=Netgraph&nodeId=node-alpha", undefined, "node-alpha");
    await screen.findByTestId("mock-netgraph-canvas");

    expect(screen.getByLabelText("Selected node focus")).toHaveTextContent("Alpha");
    expect(screen.getByText(/1 highlighted pathways/)).toBeInTheDocument();
    expect(screen.getByText(/1 first-hop/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Focus selected node neighborhood" }));
    expect(screen.getByLabelText("canvas mode")).toHaveTextContent("focus");
    fireEvent.click(screen.getByRole("button", { name: "Close selected node focus" }));

    expect(onSelectNode).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("location")).not.toHaveTextContent("nodeId=node-alpha");
  });

  it("can explicitly send a selected node to the map URL", async () => {
    renderNetgraph("?tab=Netgraph&nodeId=node-alpha", undefined, "node-alpha");
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "View selected node on map" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("tab=Map");
    expect(screen.getByLabelText("location")).toHaveTextContent("nodeId=node-alpha");
    expect(screen.getByLabelText("location")).toHaveTextContent("mapFocus=node");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("routeId=");
  });

  it("keeps focus on blank canvas clicks and exits through the close button", async () => {
    const { onSelectNode } = renderNetgraph("?tab=Netgraph&nodeId=node-alpha&routeId=42", undefined, "node-alpha");
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Blank Canvas" }));

    expect(onSelectNode).not.toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("location")).toHaveTextContent("nodeId=node-alpha");
    expect(screen.getByLabelText("location")).toHaveTextContent("routeId=42");
    fireEvent.click(screen.getByRole("button", { name: "Close selected route focus" }));
    expect(onSelectNode).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("location")).not.toHaveTextContent("nodeId=node-alpha");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("routeId=42");
  });

  it("increments the live pulse counter from packet observations", async () => {
    let packetHandler: ((data: WsPacketObservation["data"]) => void) | null = null;
    const wsManager = {
      getStatus: () => "connected",
      onPacketObservation: vi.fn((handler: (data: WsPacketObservation["data"]) => void) => {
        packetHandler = handler;
        return vi.fn();
      }),
      onLagged: vi.fn(() => vi.fn()),
    } as unknown as WsManager;

    renderNetgraph("?tab=Netgraph&live=1", wsManager);
    await screen.findByTestId("mock-netgraph-canvas");

    act(() => {
      packetHandler?.(packetData(["node-alpha", "node-bravo"]));
    });

    await waitFor(() => expect(screen.getByText("1 live pulses")).toBeInTheDocument());
  });

  it("warms live tx/rx pulses from recent backfill", async () => {
    mockGetLiveBackfill.mockResolvedValueOnce({
      items: [packetData(["node-alpha", "node-bravo"])],
      nextCursor: null,
      hasMore: false,
    });
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    await waitFor(() => expect(mockGetLiveBackfill).toHaveBeenCalledWith(undefined, { afterObservationId: 0, limit: 80 }));
    await waitFor(() => expect(screen.getByText("1 live pulses")).toBeInTheDocument());
  });

  it("falls back to route lists when WebGL fails", async () => {
    renderNetgraph();
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Break WebGL" }));

    expect(await screen.findByText("Route graph fallback")).toBeInTheDocument();
    expect(screen.getByText(/WebGL is unavailable/)).toBeInTheDocument();
    expect(screen.getAllByText(/Alpha -> Bravo/)[0]).toBeInTheDocument();
  });

  it("can send a selected route to the map replay URL", async () => {
    const { onSelectNode } = renderNetgraph("?tab=Netgraph&nodeId=node-alpha");
    await screen.findByTestId("mock-netgraph-canvas");

    fireEvent.click(screen.getByRole("button", { name: "Pick Route" }));
    expect(onSelectNode).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("canvas mode")).toHaveTextContent("routes");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("nodeId=node-alpha");
    fireEvent.click(screen.getByRole("button", { name: "Replay selected route in 3D" }));
    expect(screen.getByLabelText("canvas mode")).toHaveTextContent("routes");
    fireEvent.click(screen.getByRole("button", { name: "View on map" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("tab=Map");
    expect(screen.getByLabelText("location")).toHaveTextContent("routeId=42");
    expect(screen.getByLabelText("location")).toHaveTextContent("routeReplay=1");
  });

  it("shows empty and error states", async () => {
    mockGetNetgraphSnapshot.mockResolvedValueOnce(snapshot({ nodes: [], edges: [], stats: { ...snapshot().stats, nodeCount: 0, edgeCount: 0, mappedRouteCount: 0 } }));
    renderNetgraph();
    expect(await screen.findByText("No connected public routes yet")).toBeInTheDocument();
    expect(screen.getByText(/Try a wider region or route limit/)).toBeInTheDocument();

    mockGetNetgraphSnapshot.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(snapshot());
    renderNetgraph("?tab=Netgraph&case=error");
    expect(await screen.findByText("Topology snapshot unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry topology snapshot" }));
    expect(await screen.findByTestId("mock-netgraph-canvas")).toBeInTheDocument();
  });
});
