import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GlobalSearchPalette } from "../../src/components/GlobalSearchPalette";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getGlobalSearch, getRegions } from "../../src/api/client";
import type { GlobalSearchResult } from "../../src/types/api";

vi.mock("../../src/api/client", () => ({
  getGlobalSearch: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

const mockGetGlobalSearch = vi.mocked(getGlobalSearch);
const mockGetRegions = vi.mocked(getRegions);

function renderPalette(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>{children}</RegionProvider>
    </QueryClientProvider>
  );

  render(<GlobalSearchPalette open onClose={vi.fn()} onSelect={onSelect} />, { wrapper });
  return { onSelect };
}

beforeEach(() => {
  mockGetGlobalSearch.mockReset();
  mockGetRegions.mockReset().mockResolvedValue([]);
});

describe("GlobalSearchPalette", () => {
  it("shows local page destinations before a remote query is needed", () => {
    renderPalette();

    expect(screen.getByRole("dialog", { name: "Global Beacon search" })).toBeInTheDocument();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(mockGetGlobalSearch).not.toHaveBeenCalled();
  });

  it("selects a local page destination", () => {
    const { onSelect } = renderPalette();

    fireEvent.click(screen.getByText("Live"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: "page", id: "live", url: "/?tab=Live" }));
  });

  it("queries the API after two characters and renders returned results", async () => {
    const nodeResult: GlobalSearchResult = {
      type: "node",
      id: "node-1",
      label: "Gateway Alpha",
      subtitle: "NODE / YOW",
      url: "/?tab=Nodes&nodeId=node-1",
      score: 220,
      matched: "node name",
    };
    mockGetGlobalSearch.mockResolvedValue({ query: "ga", items: [nodeResult] });
    const { onSelect } = renderPalette();

    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), { target: { value: "ga" } });

    const result = await screen.findByText("Gateway Alpha");
    expect(result).toBeInTheDocument();
    expect(mockGetGlobalSearch).toHaveBeenCalledWith(undefined, { q: "ga", limit: 24 });

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Global Beacon search" }), { key: "Enter" });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(nodeResult));
  });
});
