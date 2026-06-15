import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ObserverTab } from "../../../src/features/stats/ObserverTab";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import {
  getObserver,
  getObserverTelemetry,
  getObserversPage,
  getRegions,
  getStatsObserverCompare,
  getStatsObserverHealth,
} from "../../../src/api/client";
import type { WsManager } from "../../../src/api/ws-manager";
import type { Observer } from "../../../src/features/observers/types";
import type { ObserverTelemetry, StatsObserverCompare, StatsObserverHealthResponse } from "../../../src/features/stats/types";

vi.mock("../../../src/api/client", () => ({
  getObserver: vi.fn(),
  getObserverTelemetry: vi.fn(),
  getObserversPage: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
  getStatsObserverCompare: vi.fn(),
  getStatsObserverHealth: vi.fn(),
}));

vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: () => <div data-testid="compare-chart" />,
}));

const idA = "00000000-0000-0000-0000-000000000101";
const idB = "00000000-0000-0000-0000-000000000202";

const mockWs = {
  onObserverStatus: () => () => {},
} as unknown as WsManager;

const health: StatsObserverHealthResponse = {
  serverTime: 1,
  window: { since: 1, until: 2, bucket: "1h" },
  summary: { totalObservers: 2, staleObservers: 0, lowBattery: 0, highNoise: 0, highAirtime: 0, queueBacklog: 0, receiveErrors: 0, noTelemetry: 0 },
  items: [
    {
      observerId: idA,
      displayName: "Gateway A",
      observerType: "meshcoretomqtt",
      iata: "YVR",
      status: "online",
      lastHeard: 2,
      observationCount: 20,
      hasTelemetry: true,
      healthScore: 95,
      flags: { stale: false, lowBattery: false, highNoise: false, highAirtime: false, queueBacklog: false, receiveErrors: false, noTelemetry: false },
    },
    {
      observerId: idB,
      displayName: "Gateway B",
      observerType: "meshcoretomqtt",
      iata: "YVR",
      status: "online",
      lastHeard: 2,
      observationCount: 10,
      hasTelemetry: true,
      healthScore: 88,
      flags: { stale: false, lowBattery: false, highNoise: false, highAirtime: false, queueBacklog: false, receiveErrors: false, noTelemetry: false },
    },
  ],
};

const compare: StatsObserverCompare = {
  serverTime: 1,
  window: { since: 1, until: 2, bucket: "1h" },
  sharedIatas: ["YVR"],
  items: [
    {
      ...health.items[0],
      packetCount: 7,
      payloadMix: [{ payloadType: 4, payloadTypeName: "advert", count: 12 }],
      routeMix: [{ routeType: 0, routeTypeName: "FLOOD", count: 12 }],
      avgNoiseFloorDb: -105,
      avgAirtimeTxPct: 4,
      avgAirtimeRxPct: 6,
      avgBatteryMv: 4100,
      receiveErrorsSum: 0,
    },
    {
      ...health.items[1],
      packetCount: 5,
      payloadMix: [{ payloadType: 5, payloadTypeName: "group_text", count: 6 }],
      routeMix: [{ routeType: 1, routeTypeName: "DIRECT", count: 6 }],
      avgNoiseFloorDb: -100,
      avgAirtimeTxPct: 5,
      avgAirtimeRxPct: 8,
      avgBatteryMv: 4000,
      receiveErrorsSum: 1,
    },
  ],
  series: [{ t: 1, observerId: idA, packetCount: 2, observationCount: 4, receiveErrors: 0 }],
};

const observer: Observer = {
  id: idA,
  displayName: "Gateway A",
  observerType: "meshcoretomqtt",
  iata: "YVR",
  status: "online",
  publicKey: "aabbcc",
  firstSeen: 1,
  lastSeen: 2,
  observationCount: 20,
  brokers: [],
};

const telemetry: ObserverTelemetry = { range: "24h", interval: "1h", points: [] };

function renderObserverTab(initialCompare = false, initialIds: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [compare, setCompare] = useState({ enabled: initialCompare, ids: initialIds });
    return (
      <ObserverTab
        compareIds={compare.ids}
        compareMode={compare.enabled}
        onCompareChange={(enabled, ids) => setCompare({ enabled, ids })}
        range="24h"
        selectedObserverId={null}
        onSelectObserver={vi.fn()}
        wsManager={mockWs}
      />
    );
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>{children}</RegionProvider>
    </QueryClientProvider>
  );
  render(<Harness />, { wrapper });
}

beforeEach(() => {
  vi.mocked(getStatsObserverHealth).mockReset().mockResolvedValue(health);
  vi.mocked(getStatsObserverCompare).mockReset().mockResolvedValue(compare);
  vi.mocked(getObserversPage).mockReset();
  vi.mocked(getObserver).mockReset().mockResolvedValue(observer);
  vi.mocked(getObserverTelemetry).mockReset().mockResolvedValue(telemetry);
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
});

describe("ObserverTab compare", () => {
  it("enables compare mode and renders selected observer comparison", async () => {
    renderObserverTab();

    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));

    expect(await screen.findByText("Shared IATAs")).toBeInTheDocument();
    expect(screen.getAllByText("Gateway A").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Gateway B").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Observation Timeline")).toBeInTheDocument();
    expect(screen.getByText("advert 12")).toBeInTheDocument();
    await waitFor(() => expect(getStatsObserverCompare).toHaveBeenCalledWith(undefined, [idA, idB], { range: "24h" }));
  });

  it("hydrates compare mode from provided observer ids", async () => {
    renderObserverTab(true, [idA, idB]);

    expect(await screen.findByText("Shared IATAs")).toBeInTheDocument();
    await waitFor(() => expect(getStatsObserverCompare).toHaveBeenCalledWith(undefined, [idA, idB], { range: "24h" }));
  });
});
