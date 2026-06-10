import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/components/AppShell";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getIatas, getRegions } from "../../src/api/client";
import type { WsManager } from "../../src/api/ws-manager";
import pkg from "../../package.json";

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
  vi.mocked(getIatas).mockReset();
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
});

describe("AppShell", () => {
  it("footer shows the package.json version", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();
    expect(screen.getByText(`BEACON v${pkg.version}`)).toBeInTheDocument();
  });

  it("region picker shows an error state when the IATA list fails to load", async () => {
    vi.mocked(getIatas).mockRejectedValue(new Error("boom"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
