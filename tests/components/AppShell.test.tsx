import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/components/AppShell";
import { RuntimeStatusPanel } from "../../src/components/RuntimeStatusPanel";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ThemeProvider } from "../../src/hooks/useTheme";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getBrokers, getHealth, getIatas, getLiveSummary, getReadiness, getRegions, getSystemStatus } from "../../src/api/client";
import type { WsManager } from "../../src/api/ws-manager";

vi.mock("../../src/api/client", () => ({
  getIatas: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
  getHealth: vi.fn(),
  getReadiness: vi.fn(),
  getSystemStatus: vi.fn(),
  getBrokers: vi.fn(),
  getLiveSummary: vi.fn(),
}));

const wsDiagnostics = {
  status: "connected",
  lastEventTimestamp: Date.now(),
  lastTransportTimestamp: Date.now(),
  lastDataTimestamp: Date.now(),
  reconnectAttempt: 0,
  parseFailureCount: 0,
  lastParseFailureAt: null,
  laggedNoticeCount: 1,
  lastLaggedAt: Date.now(),
  lastLaggedDroppedCount: 0,
  lastLaggedSince: Date.now() - 10_000,
  activeSubscriptionId: "sub-test",
} as const;

const wsManager = {
  onStatusChange: () => () => {},
  onDiagnosticsChange: () => () => {},
  getStatus: () => "connected",
  getLastEventTimestamp: () => Date.now(),
  getDiagnostics: () => wsDiagnostics,
} as unknown as WsManager;

const testThemes = [
  {
    id: "crt-amber",
    name: "Default Amber CRT",
    vars: {
      "--palette-bg-base": "#090500",
      "--palette-primary": "#ffb000",
      "--palette-secondary": "#42ff7c",
      "--palette-green": "#42ff7c",
      "--palette-danger": "#ff5f2e",
      "--palette-warn": "#ffd166",
    },
  },
  {
    id: "crt-green",
    name: "Monochrome Green",
    vars: {
      "--palette-bg-base": "#020701",
      "--palette-primary": "#33ff66",
      "--palette-secondary": "#8dffb0",
      "--palette-green": "#33ff66",
      "--palette-danger": "#ff4f4f",
      "--palette-warn": "#d6ff66",
    },
  },
];

const testModernStyles = [
  {
    id: "iphone-glass-dark",
    name: "iPhone Glass Dark",
    description: "Black glass, frosted chrome, blue-violet signal light.",
    swatches: ["#f8fbff", "#7ab7ff", "#a78bfa", "#05070d"],
    vars: {
      "--palette-bg-base": "#05070d",
      "--palette-primary": "#7ab7ff",
      "--palette-secondary": "#a78bfa",
      "--palette-green": "#54e1a6",
      "--palette-danger": "#ff6b8a",
      "--palette-warn": "#ffd76d",
    },
  },
  {
    id: "aurora-signal",
    name: "Aurora Signal",
    description: "Northern-light glass with green, violet, and electric blue motion.",
    swatches: ["#effff9", "#6fffd2", "#8f7bff", "#03110f"],
    vars: {
      "--palette-bg-base": "#03110f",
      "--palette-primary": "#6fffd2",
      "--palette-secondary": "#8f7bff",
      "--palette-green": "#64f59a",
      "--palette-danger": "#ff658e",
      "--palette-warn": "#ffe16a",
    },
  },
];

function mockThemeFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes("modern-designs.json") ? testModernStyles : testThemes),
      } as Response),
    ),
  );
}

function renderShell(activeTab = "Home", onTabChange: (tab: string) => void = () => {}, onOpenSearch?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          <AppShell activeTab={activeTab} onTabChange={onTabChange} wsManager={wsManager} onOpenSearch={onOpenSearch}>
            <div />
          </AppShell>
        </RegionProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function renderRuntimePanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          <RuntimeStatusPanel wsManager={wsManager} variant="page" />
        </RegionProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockThemeFetch();
  document.documentElement.removeAttribute("data-design-mode");
  document.documentElement.removeAttribute("data-modern-style");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.fontMode;
  delete document.documentElement.dataset.scanlines;
  vi.mocked(getIatas).mockReset();
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
  vi.mocked(getHealth).mockReset().mockResolvedValue({
    status: "ok",
    version: "dev",
    serverTime: Date.now(),
  });
  vi.mocked(getReadiness).mockReset().mockResolvedValue({
    status: "ok",
    ready: true,
    serverTime: Date.now(),
  });
  vi.mocked(getSystemStatus).mockReset().mockResolvedValue({
    status: "degraded",
    serverTime: Date.now(),
    ingest: { status: "ok" },
    liveTraffic: { status: "ok" },
    analytics: { status: "degraded" },
  });
  vi.mocked(getBrokers).mockReset().mockResolvedValue([
    { name: "broker-a", connected: true },
    { name: "broker-b", connected: false },
  ]);
  vi.mocked(getLiveSummary).mockReset().mockResolvedValue({
    serverTime: Date.now(),
    since: Date.now() - 900_000,
    until: Date.now(),
    latestObservationId: 123,
    packetCount: 42,
    observationCount: 84,
    activeObservers: 3,
    payloadMix: [],
    routeMix: [],
    topIatas: [],
    topObservers: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("footer shows the display version with a green pulse", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();
    expect(screen.getByText("BEACON v", { exact: false })).toHaveTextContent("BEACON v1.0.0");
    const version = screen.getByText("1.0.0");
    expect(version).toHaveClass("animate-pulse");
    expect(version).toHaveClass("text-green");
  });

  it("hides the footer on mobile-first map pages", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell("Live");
    expect(screen.getByText("BEACON v", { exact: false }).closest("footer")).toHaveClass("hidden");
    expect(screen.getByText("BEACON v", { exact: false }).closest("footer")).toHaveClass("md:flex");

    renderShell("Netgraph");
    expect(screen.getAllByText("BEACON v", { exact: false }).at(-1)?.closest("footer")).toHaveClass("hidden");
    expect(screen.getAllByText("BEACON v", { exact: false }).at(-1)?.closest("footer")).toHaveClass("md:flex");
  });

  it("groups Netgraph under Monitor and outside System", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    const onTabChange = vi.fn();
    renderShell("Home", onTabChange);

    const pagesNav = screen.getByRole("navigation", { name: "Pages" });
    fireEvent.click(within(pagesNav).getByRole("button", { name: "Monitor" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Monitor" })).getByRole("menuitem", { name: "Netgraph" }));
    expect(onTabChange).toHaveBeenCalledWith("Netgraph");

    fireEvent.click(within(pagesNav).getByRole("button", { name: "System" }));
    const systemMenu = screen.getByRole("menu", { name: "System" });
    expect(within(systemMenu).queryByRole("menuitem", { name: "Netgraph" })).not.toBeInTheDocument();
  });

  it("exposes global search from mobile navigation", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    const onOpenSearch = vi.fn();
    renderShell("Home", () => {}, onOpenSearch);

    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    fireEvent.click(within(mobileNav).getByRole("button", { name: "Search" }));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("region picker shows an error state when the IATA list fails to load", async () => {
    vi.mocked(getIatas).mockRejectedValue(new Error("boom"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Region/ }));

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it("opens live runtime diagnostics with API, broker, and live counters", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /Live system live/i }));

    expect(await screen.findByText("CONNECTED")).toBeInTheDocument();
    expect(await screen.findByText("broker-a")).toBeInTheDocument();
    expect(screen.getByText("broker-b")).toBeInTheDocument();
    expect(screen.getByText("YES")).toBeInTheDocument();
    expect(screen.getByText(/0 dropped/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(getHealth).toHaveBeenCalled();
    expect(getReadiness).toHaveBeenCalled();
    expect(getSystemStatus).toHaveBeenCalled();
    expect(getBrokers).toHaveBeenCalled();
    expect(getLiveSummary).toHaveBeenCalled();
  });

  it("renders only coarse public component states on the System page", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderRuntimePanel();

    expect(await screen.findByText("DEGRADED")).toBeInTheDocument();
    expect(screen.getByText("Ingest")).toBeInTheDocument();
    expect(screen.getByText("Live Traffic")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getAllByText("degraded", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Raw diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByText("Dependencies")).not.toBeInTheDocument();
  });

  it("uses modern glass as the default design mode", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("modern");
      expect(document.documentElement.dataset.modernStyle).toBe("iphone-glass-dark");
    });
    expect(localStorage.getItem("beacon-design-mode")).toBe("modern");
    expect(localStorage.getItem("beacon-modern-style")).toBe("iphone-glass-dark");
    expect(screen.getByRole("button", { name: /Appearance iPhone Glass Dark/ })).toBeInTheDocument();
  });

  it("keeps retro font and scanline toggles available when retro mode is selected", async () => {
    localStorage.setItem("beacon-design-mode", "retro");
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("retro");
      expect(document.documentElement.dataset.fontMode).toBe("retro");
      expect(document.documentElement.dataset.scanlines).toBe("on");
    });

    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: "Font retro" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan on" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.fontMode).toBe("modern");
      expect(document.documentElement.dataset.scanlines).toBe("off");
    });
    expect(localStorage.getItem("beacon-font-mode")).toBe("modern");
    expect(localStorage.getItem("beacon-scanlines")).toBe("off");
    expect(screen.getByRole("button", { name: "Font modern" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Scan off" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a modern glass style from the design picker and persists modern mode", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => expect(document.documentElement.dataset.designMode).toBe("modern"));
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Retro Palettes")).toBeInTheDocument();
    expect(screen.getByText("Modern Glass")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Aurora Signal/ }));

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("modern");
      expect(document.documentElement.dataset.modernStyle).toBe("aurora-signal");
    });
    expect(localStorage.getItem("beacon-design-mode")).toBe("modern");
    expect(localStorage.getItem("beacon-modern-style")).toBe("aurora-signal");
    expect(screen.getByRole("button", { name: /Appearance Aurora Signal/ })).toBeInTheDocument();
  });

  it("returns to retro mode when a retro color theme is selected", async () => {
    localStorage.setItem("beacon-design-mode", "modern");
    localStorage.setItem("beacon-modern-style", "aurora-signal");
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => expect(document.documentElement.dataset.designMode).toBe("modern"));
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Retro Palettes")).toBeInTheDocument();
    expect(screen.getByText("Modern Glass")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monochrome Green" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("retro");
      expect(document.documentElement.dataset.theme).toBe("crt-green");
    });
    expect(localStorage.getItem("beacon-design-mode")).toBe("retro");
    expect(localStorage.getItem("beacon-theme")).toBe("crt-green");
    expect(screen.getByRole("button", { name: /Appearance Monochrome Green/ })).toBeInTheDocument();
  });

  it("persists the simplified density preference from Appearance", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => expect(document.documentElement.dataset.uiDensity).toBe("comfortable"));
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: "dense" }));

    expect(document.documentElement.dataset.uiDensity).toBe("dense");
    expect(localStorage.getItem("beacon-ui-density")).toBe("dense");
  });
});
