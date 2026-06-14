import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/components/AppShell";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getIatas, getRegions } from "../../src/api/client";
import type { WsManager } from "../../src/api/ws-manager";

vi.mock("../../src/api/client", () => ({
  getIatas: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

const wsManager = {
  onStatusChange: () => () => {},
  getStatus: () => "connected",
  getLastEventTimestamp: () => Date.now(),
} as unknown as WsManager;

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>
        <AppShell activeTab="Packets" onTabChange={() => {}} wsManager={wsManager}>
          <div />
        </AppShell>
      </RegionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.fontMode;
  delete document.documentElement.dataset.scanlines;
  vi.mocked(getIatas).mockReset();
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
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

  it("region picker shows an error state when the IATA list fails to load", async () => {
    vi.mocked(getIatas).mockRejectedValue(new Error("boom"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
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
});
