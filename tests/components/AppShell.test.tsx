import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/components/AppShell";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ThemeProvider } from "../../src/hooks/useTheme";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getBrokers, getHealth, getIatas, getLiveSummary, getReadiness, getRegions } from "../../src/api/client";
import type { WsManager } from "../../src/api/ws-manager";

vi.mock("../../src/api/client", () => ({
  getIatas: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
  getHealth: vi.fn(),
  getReadiness: vi.fn(),
  getBrokers: vi.fn(),
  getLiveSummary: vi.fn(),
}));

const wsDiagnostics = {
  status: "connected",
  lastEventTimestamp: Date.now(),
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

function renderShell(activeTab = "Packets") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          <AppShell activeTab={activeTab} onTabChange={() => {}} wsManager={wsManager}>
            <div />
          </AppShell>
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
    ready: true,
    version: "dev",
    serverTime: Date.now(),
    mode: "health",
    dependencies: {
      database: { status: "ok" },
      cache: { status: "ok", detail: "redis" },
    },
    brokers: [{ name: "broker-a", connected: true }],
  });
  vi.mocked(getReadiness).mockReset().mockResolvedValue({
    status: "ok",
    ready: true,
    version: "dev",
    serverTime: Date.now(),
    mode: "readiness",
    dependencies: {
      database: { status: "ok" },
      cache: { status: "ok", detail: "redis" },
      ingestWorkers: { status: "ok", detail: "brokers connected" },
      websocket: { status: "ok", detail: "endpoint available at /ws" },
    },
    brokers: [{ name: "broker-a", connected: true }],
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
    expect(screen.getByText("BEACON v", { exact: false })).toHaveTextContent("BEACON v133.7");
    const version = screen.getByText("133.7");
    expect(version).toHaveClass("animate-pulse");
    expect(version).toHaveClass("text-green");
  });

  it("hides the footer on mobile-first map pages", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell("Live");
    expect(screen.getByText("BEACON v", { exact: false }).closest("footer")).toHaveClass("hidden");
    expect(screen.getByText("BEACON v", { exact: false }).closest("footer")).toHaveClass("md:flex");
  });

  it("region picker shows an error state when the IATA list fails to load", async () => {
    vi.mocked(getIatas).mockRejectedValue(new Error("boom"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it("opens live runtime diagnostics with API, broker, and live counters", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: /Live runtime connected/i }));

    expect(await screen.findByText("Runtime")).toBeInTheDocument();
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
    expect(await screen.findByText("broker-a")).toBeInTheDocument();
    expect(screen.getByText("broker-b")).toBeInTheDocument();
    expect(screen.getByText("YES")).toBeInTheDocument();
    expect(screen.getByText(/0 dropped/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(getHealth).toHaveBeenCalled();
    expect(getReadiness).toHaveBeenCalled();
    expect(getBrokers).toHaveBeenCalled();
    expect(getLiveSummary).toHaveBeenCalled();
  });

  it("defaults to retro fonts and scanlines, then persists readable display toggles", async () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => {
      expect(document.documentElement.dataset.fontMode).toBe("retro");
      expect(document.documentElement.dataset.scanlines).toBe("on");
    });

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

    await waitFor(() => expect(document.documentElement.dataset.designMode).toBe("retro"));
    fireEvent.click(screen.getByRole("button", { name: /Design mode Retro CRT/ }));
    fireEvent.click(screen.getByRole("button", { name: /Aurora Signal/ }));

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("modern");
      expect(document.documentElement.dataset.modernStyle).toBe("aurora-signal");
    });
    expect(localStorage.getItem("beacon-design-mode")).toBe("modern");
    expect(localStorage.getItem("beacon-modern-style")).toBe("aurora-signal");
    expect(screen.getByText("Modern UI")).toBeInTheDocument();
  });

  it("returns to retro mode when a retro color theme is selected", async () => {
    localStorage.setItem("beacon-design-mode", "modern");
    localStorage.setItem("beacon-modern-style", "aurora-signal");
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();

    await waitFor(() => expect(document.documentElement.dataset.designMode).toBe("modern"));
    fireEvent.click(screen.getByRole("button", { name: "Retro color theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Monochrome Green" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.designMode).toBe("retro");
      expect(document.documentElement.dataset.theme).toBe("crt-green");
    });
    expect(localStorage.getItem("beacon-design-mode")).toBe("retro");
    expect(localStorage.getItem("beacon-theme")).toBe("crt-green");
    expect(screen.getByRole("button", { name: "Font retro" })).toBeInTheDocument();
  });
});
