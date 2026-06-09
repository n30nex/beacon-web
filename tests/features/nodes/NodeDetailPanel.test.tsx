import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import { getNode, getNodeObservations, getNodeNeighbors } from "../../../src/api/client";
import type { Node, NodeNeighbor } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getNodeNeighbors: vi.fn(),
}));

const mockGetNode = vi.mocked(getNode);
const mockGetNodeObservations = vi.mocked(getNodeObservations);
const mockGetNodeNeighbors = vi.mocked(getNodeNeighbors);

const node: Node = {
  id: "node-self",
  publicKey: "aabbccddeeff",
  nodeType: 2,
  nodeTypeName: "REPEATER",
  name: "Self Node",
  lat: null,
  lng: null,
  iatas: [],
  locationSource: null,
  lastAdvertAt: null,
  supportsMultibytePaths: false,
  supportsMultibyteTraces: false,
  minFirmwareVersion: null,
  firstSeen: 1,
  lastSeen: 2,
  metadata: null,
};

function neighbor(id: string, name: string): NodeNeighbor {
  return { id, name, nodeType: 2, nodeTypeName: "REPEATER", iata: "YVR", observationCount: 5, firstSeen: 1, lastSeen: 2 };
}

function renderPanel(onViewNode = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} onViewNode={onViewNode} />, { wrapper });
  return { onViewNode };
}

beforeEach(() => {
  mockGetNode.mockReset();
  mockGetNodeObservations.mockReset();
  mockGetNodeNeighbors.mockReset();
  mockGetNode.mockResolvedValue(node);
  mockGetNodeObservations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mockGetNodeNeighbors.mockResolvedValue([]);
});

describe("NodeDetailPanel neighbors", () => {
  it("lists each neighbor's name in a Neighbors section", async () => {
    mockGetNodeNeighbors.mockResolvedValue([neighbor("n-1", "Neighbor A"), neighbor("n-2", "Neighbor B")]);

    renderPanel();

    expect(await screen.findByText("Neighbors")).toBeInTheDocument();
    expect(await screen.findByText("Neighbor A")).toBeInTheDocument();
    expect(screen.getByText("Neighbor B")).toBeInTheDocument();
    expect(mockGetNodeNeighbors).toHaveBeenCalledWith("node-self");
  });

  it("navigates to a neighbor when its row is clicked", async () => {
    mockGetNodeNeighbors.mockResolvedValue([neighbor("n-1", "Neighbor A")]);

    const { onViewNode } = renderPanel();

    fireEvent.click(await screen.findByText("Neighbor A"));
    expect(onViewNode).toHaveBeenCalledWith("n-1");
  });

  it("shows an empty state when there are no neighbors", async () => {
    mockGetNodeNeighbors.mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText("No known neighbors")).toBeInTheDocument();
  });
});
