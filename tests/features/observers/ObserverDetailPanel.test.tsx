import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ObserverDetailPanel } from "../../../src/features/observers/ObserverDetailPanel";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import { getObserver, getObserverAdverts, getObserverTopology, getRegions } from "../../../src/api/client";
import type { Observer, AdvertObservation } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", () => ({
  getObserver: vi.fn(),
  getObserverAdverts: vi.fn(),
  getObserverTopology: vi.fn(),
  getRegions: vi.fn(),
}));

const mockGetObserver = vi.mocked(getObserver);
const mockGetObserverAdverts = vi.mocked(getObserverAdverts);
const mockGetObserverTopology = vi.mocked(getObserverTopology);
const mockGetRegions = vi.mocked(getRegions);

const observer: Observer = {
  id: "obs-1",
  iata: "YVR",
  status: "online",
  publicKey: "aabbccddeeff",
  statusMetadata: { stats: { noise_floor: -117, queue_len: 2 } },
  firstSeen: 1,
  lastSeen: 2,
  observationCount: 10,
  brokers: [],
};

function advert(id: number, nodeName: string): AdvertObservation {
  return {
    id,
    packetHash: `hash-${id}`,
    payloadType: 4,
    payloadTypeName: "ADVERT",
    iata: "YVR",
    heardAt: 1000,
    snr: 7.5,
    rssi: -90,
    hopCount: 0,
    nodeName,
    nodePublicKey: "1122334455",
  };
}

function renderPanel(onAnalyzePacket = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>{children}</RegionProvider>
    </QueryClientProvider>
  );
  render(<ObserverDetailPanel observerId="obs-1" range="24h" onClose={vi.fn()} onAnalyzePacket={onAnalyzePacket} />, { wrapper });
  return { onAnalyzePacket };
}

beforeEach(() => {
  mockGetObserver.mockReset();
  mockGetObserverAdverts.mockReset();
  mockGetObserverTopology.mockReset();
  mockGetRegions.mockReset();
  mockGetObserver.mockResolvedValue(observer);
  mockGetObserverAdverts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mockGetObserverTopology.mockResolvedValue({
    serverTime: 0,
    window: { since: 0, until: 0, bucket: "1h" },
    observerId: "obs-1",
    packetCount: 0,
    observationCount: 0,
    activeIatas: 0,
    payloadMix: [],
    routeMix: [],
    topNodes: [],
    topTraceTags: [],
    topScopes: [],
    recentAdverts: [],
  });
  mockGetRegions.mockResolvedValue([]);
});

describe("ObserverDetailPanel status", () => {
  it("renders offline when lastStatusAt is 10 minutes old even if the API status says online", async () => {
    mockGetObserver.mockResolvedValue({ ...observer, status: "online", lastStatusAt: Date.now() - 10 * 60_000 });

    renderPanel();

    expect(await screen.findByText("offline")).toBeInTheDocument();
    expect(screen.queryByText("online")).not.toBeInTheDocument();
  });

  it("renders online when lastStatusAt is fresh", async () => {
    mockGetObserver.mockResolvedValue({ ...observer, status: "online", lastStatusAt: Date.now() - 60_000 });

    renderPanel();

    expect(await screen.findByText("online")).toBeInTheDocument();
  });
});

describe("ObserverDetailPanel adverts", () => {
  it("lists adverts heard by the observer", async () => {
    mockGetObserverAdverts.mockResolvedValue({
      items: [advert(1, "Node Alpha"), advert(2, "Node Beta")],
      nextCursor: null,
      hasMore: false,
    });

    renderPanel();

    expect(await screen.findByText("Adverts heard")).toBeInTheDocument();
    expect(await screen.findByText(/Observer refreshed \d+s ago/)).toBeInTheDocument();
    expect(await screen.findByText(/Topology refreshed \d+s ago/)).toBeInTheDocument();
    expect(await screen.findByText(/Adverts refreshed \d+s ago/)).toBeInTheDocument();
    expect(await screen.findByText("Node Alpha")).toBeInTheDocument();
    expect(screen.getByText("Node Beta")).toBeInTheDocument();
    expect(mockGetObserverAdverts).toHaveBeenCalledWith("obs-1", { limit: 50 });
  });

  it("analyzes the packet when an advert row is clicked", async () => {
    mockGetObserverAdverts.mockResolvedValue({
      items: [advert(1, "Node Alpha")],
      nextCursor: null,
      hasMore: false,
    });

    const { onAnalyzePacket } = renderPanel();

    fireEvent.click(await screen.findByText("Node Alpha"));
    expect(onAnalyzePacket).toHaveBeenCalledWith("hash-1");
  });

  it("copies an observer JSON health snapshot with topology and advert context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mockGetObserverTopology.mockResolvedValue({
      serverTime: 1_782_043_200_000,
      window: { since: 1, until: 2, bucket: "1h" },
      observerId: "obs-1",
      packetCount: 12,
      observationCount: 34,
      activeIatas: 2,
      avgSnr: 7.2,
      payloadMix: [{ payloadType: 4, payloadTypeName: "ADVERT", count: 10 }],
      routeMix: [],
      topNodes: [],
      topTraceTags: [],
      topScopes: [],
      recentAdverts: [],
    });
    mockGetObserverAdverts.mockResolvedValue({
      items: [advert(1, "Node Alpha")],
      nextCursor: null,
      hasMore: false,
    });

    renderPanel();

    expect(await screen.findByText("34")).toBeInTheDocument();
    expect(await screen.findByText("Node Alpha")).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("Copy observer JSON"));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const exported = JSON.parse(writeText.mock.calls[0]![0] as string);
    expect(exported.schema).toBe("beacon.observer.v1");
    expect(exported.observer.id).toBe("obs-1");
    expect(exported.derivedStatus).toBe("online");
    expect(exported.healthStats.noise_floor).toBe(-117);
    expect(exported.topology.observationCount).toBe(34);
    expect(exported.advertsHeard.items[0].packetHash).toBe("hash-1");
    expect(screen.getByText("Copied JSON")).toBeInTheDocument();
  });
});
