import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapSettingsPanel } from "../../../src/features/map/MapSettingsPanel";
import { DEFAULT_MAP_APPEARANCE_SETTINGS } from "../../../src/features/map/appearance";

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /max-width/.test(query) ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderPanel() {
  return render(
    <MapSettingsPanel
      appearanceSettings={DEFAULT_MAP_APPEARANCE_SETTINGS}
      clustered={false}
      onAppearanceChange={() => {}}
      onClusteredChange={() => {}}
      onStyleChange={() => {}}
      onTopographyChange={() => {}}
      onTypeChange={() => {}}
      styleId="dark"
      topographyEnabled
      typeFilter=""
    />,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("MapSettingsPanel mobile", () => {
  it("starts closed on mobile even when the desktop panel was persisted open", () => {
    setMobile(true);
    localStorage.setItem("beacon-map-settings-desktop-open", "true");
    renderPanel();

    expect(screen.queryByRole("dialog", { name: "Map settings" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open map settings" }));
    expect(screen.getByRole("dialog", { name: "Map settings" })).toBeInTheDocument();
    expect(screen.getByText("Map Tiles")).toBeInTheDocument();
  });

  it("keeps the desktop panel preference on desktop", () => {
    setMobile(false);
    localStorage.setItem("beacon-map-settings-desktop-open", "false");
    renderPanel();

    expect(screen.getByRole("button", { name: /Map Settings/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Map Tiles")).not.toBeInTheDocument();
  });
});
