import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_MAP_APPEARANCE_SETTINGS,
  MAP_CONTRAST_STORAGE_KEY,
  MAP_GLOW_STORAGE_KEY,
  MAP_RELIEF_STORAGE_KEY,
  MAP_TINT_STORAGE_KEY,
  persistMapAppearanceSettings,
  readMapAppearanceSettings,
  resolveMapVisualProfile,
} from "../../../src/features/map/appearance";

const THEME = {
  "--palette-primary": "#33ff66",
  "--palette-primary-dim": "#13a438",
  "--palette-secondary": "#8dffb0",
  "--palette-green": "#33ff66",
  "--palette-danger": "#ff4f4f",
  "--palette-warn": "#d6ff66",
  "--palette-text-bright": "#d5ffdb",
  "--palette-text-normal": "#8dff9d",
  "--palette-text-muted": "#3bbd58",
  "--palette-text-dim": "#267239",
  "--palette-bg-base": "#020701",
  "--palette-bg-surface": "#061106",
  "--palette-bg-raised": "#0c1b0b",
  "--palette-border": "#1f6f2e",
  "--palette-border-subtle": "#103719",
};

beforeEach(() => {
  localStorage.clear();
});

describe("map appearance profiles", () => {
  it("uses theme tint by default on the dark basemap", () => {
    const profile = resolveMapVisualProfile("dark", DEFAULT_MAP_APPEARANCE_SETTINGS, THEME);
    expect(profile.id).toBe("dark");
    expect(profile.effectiveTint).toBe("theme");
    expect(profile.vars["--map-primary"]).toBe("#33ff66");
  });

  it("uses neutral high contrast by default on light basemaps", () => {
    const profile = resolveMapVisualProfile("positron", DEFAULT_MAP_APPEARANCE_SETTINGS, THEME);
    expect(profile.id).toBe("light");
    expect(profile.effectiveTint).toBe("neutral");
    expect(profile.effectiveContrast).toBe("high");
    expect(profile.vars["--map-primary"]).not.toBe("#33ff66");
  });

  it("maps relief settings to stronger or softer terrain", () => {
    const soft = resolveMapVisualProfile("dark", { ...DEFAULT_MAP_APPEARANCE_SETTINGS, relief: "soft" }, THEME);
    const normal = resolveMapVisualProfile("dark", DEFAULT_MAP_APPEARANCE_SETTINGS, THEME);
    const strong = resolveMapVisualProfile("dark", { ...DEFAULT_MAP_APPEARANCE_SETTINGS, relief: "strong" }, THEME);
    expect(soft.terrainExaggeration).toBeLessThan(normal.terrainExaggeration);
    expect(strong.terrainExaggeration).toBeGreaterThan(normal.terrainExaggeration);
  });

  it("persists and restores appearance settings", () => {
    persistMapAppearanceSettings({ contrast: "soft", tint: "theme", glow: "boosted", relief: "strong" });
    expect(localStorage.getItem(MAP_CONTRAST_STORAGE_KEY)).toBe("soft");
    expect(localStorage.getItem(MAP_TINT_STORAGE_KEY)).toBe("theme");
    expect(localStorage.getItem(MAP_GLOW_STORAGE_KEY)).toBe("boosted");
    expect(localStorage.getItem(MAP_RELIEF_STORAGE_KEY)).toBe("strong");
    expect(readMapAppearanceSettings()).toEqual({ contrast: "soft", tint: "theme", glow: "boosted", relief: "strong" });
  });
});
