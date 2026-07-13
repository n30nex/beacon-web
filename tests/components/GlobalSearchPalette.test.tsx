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
  localStorage.clear();
  mockGetGlobalSearch.mockReset();
  mockGetRegions.mockReset().mockResolvedValue([]);
});

describe("GlobalSearchPalette", () => {
  it("shows local page destinations before a remote query is needed", () => {
    renderPalette();

    expect(screen.getByRole("dialog", { name: "Global Beacon search" })).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Netgraph")).toBeInTheDocument();
    expect(screen.queryByText("Atlas")).not.toBeInTheDocument();
    expect(screen.queryByText("Investigate")).not.toBeInTheDocument();
    expect(screen.queryByText("Ops")).not.toBeInTheDocument();
    expect(mockGetGlobalSearch).not.toHaveBeenCalled();
  });

  it("selects a local page destination", () => {
    const { onSelect } = renderPalette();

    fireEvent.click(screen.getByText("Live"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: "page", id: "live", url: "/?tab=Live" }));
  });

  it("routes local data pages directly", () => {
    const { onSelect } = renderPalette();

    fireEvent.click(screen.getByText("Packets"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      type: "page",
      id: "packets",
      url: "/?tab=Packets",
    }));
  });

  it("routes local Netgraph page directly", () => {
    const { onSelect } = renderPalette();

    fireEvent.click(screen.getByText("Netgraph"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      type: "page",
      id: "netgraph",
      url: "/?tab=Netgraph",
    }));
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

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), { target: { value: "ga" } });

    const result = await screen.findByText("Gateway Alpha");
    expect(result).toBeInTheDocument();
    expect(mockGetGlobalSearch).toHaveBeenCalledWith(undefined, { q: "ga", limit: 24 }, expect.any(AbortSignal));

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Global search" }), { key: "Enter" });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(nodeResult));
  });

  it("persists successful submitted searches as recent chips", async () => {
    const nodeResult: GlobalSearchResult = {
      type: "node",
      id: "node-1",
      label: "Gateway Alpha",
      subtitle: "NODE / YOW",
      url: "/?tab=Nodes&nodeId=node-1",
      score: 220,
      matched: "node name",
    };
    mockGetGlobalSearch.mockResolvedValue({ query: "gateway alpha", items: [nodeResult] });
    renderPalette();

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), { target: { value: "gateway alpha" } });
    await screen.findByText("Gateway Alpha");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Global search" }), { key: "Enter" });

    expect(JSON.parse(localStorage.getItem("beacon-global-search-recents") ?? "[]")).toEqual(["gateway alpha"]);
  });

  it("shows saved recent searches and replays one into the query box", async () => {
    localStorage.setItem("beacon-global-search-recents", JSON.stringify(["gateway alpha"]));
    mockGetGlobalSearch.mockResolvedValue({ query: "gateway alpha", items: [] });
    renderPalette();

    fireEvent.click(screen.getByRole("button", { name: "gateway alpha" }));

    expect(screen.getByRole("combobox", { name: "Global search" })).toHaveValue("gateway alpha");
    await waitFor(() => expect(mockGetGlobalSearch).toHaveBeenCalledWith(undefined, { q: "gateway alpha", limit: 24 }, expect.any(AbortSignal)));
  });

  it("keeps local aliases visible while remote providers are pending", async () => {
    mockGetGlobalSearch.mockImplementation(() => new Promise(() => undefined));
    renderPalette();

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), { target: { value: "atlas" } });

    expect(await screen.findByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("LOCAL PAGE MATCHES REMAIN AVAILABLE")).toBeInTheDocument();
  });

  it("distinguishes partial results and offers retry", async () => {
    mockGetGlobalSearch.mockResolvedValue({ query: "alpha", items: [], partial: true, providers: { node: { status: "timeout", durationMs: 1000 } } });
    renderPalette();

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), { target: { value: "alpha" } });

    expect(await screen.findByText(/PARTIAL RESULTS/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RETRY" })).toBeInTheDocument();
  });

  it("keeps the nested Watch control independent from result selection", async () => {
    const nodeResult: GlobalSearchResult = {
      type: "node",
      id: "node-1",
      label: "Gateway Alpha",
      subtitle: "NODE / YOW",
      url: "/?tab=Nodes&nodeId=node-1",
      score: 220,
      matched: "node name",
      metadata: { publicKey: "aabbccddeeff0011" },
    };
    mockGetGlobalSearch.mockResolvedValue({ query: "ga", items: [nodeResult] });
    const { onSelect } = renderPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), { target: { value: "ga" } });

    await screen.findByText("Gateway Alpha");
    const watch = screen.getByRole("button", { name: "Add to My Nodes" });
    fireEvent.keyDown(watch, { key: "Enter" });
    fireEvent.click(watch);

    expect(onSelect).not.toHaveBeenCalled();
    expect(watch).toHaveAttribute("aria-pressed", "true");
  });

  it("announces and changes the active option from the combobox", () => {
    renderPalette();
    const input = screen.getByRole("combobox", { name: "Global search" });
    expect(input).toHaveAttribute("aria-activedescendant", "search-result-page-save-investigation");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "search-result-page-home");
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveAttribute("aria-activedescendant", "search-result-page-investigations");
  });
});
