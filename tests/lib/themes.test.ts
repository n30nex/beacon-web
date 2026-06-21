import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODERN_STYLE_ID,
  applyDesignMode,
  applyModernDesign,
  applyTheme,
  loadModernDesigns,
  type ModernDesignStyle,
  type Theme,
} from "../../src/lib/themes";

const theme: Theme = {
  id: "crt-test",
  name: "CRT Test",
  vars: {
    "--palette-bg-base": "#010203",
    "--palette-primary": "#112233",
    "--palette-secondary": "#445566",
    "--palette-green": "#778899",
    "--palette-danger": "#aa1122",
    "--palette-warn": "#bbcc44",
  },
};

const modernStyle: ModernDesignStyle = {
  id: "glass-test",
  name: "Glass Test",
  description: "A test glass style.",
  swatches: ["#010203", "#aabbcc"],
  vars: {
    "--palette-bg-base": "#030405",
    "--palette-primary": "#010203",
    "--palette-secondary": "#0a0b0c",
    "--palette-green": "#112233",
    "--palette-danger": "#445566",
    "--palette-warn": "#778899",
    "--modern-glass-bg": "rgba(1, 2, 3, 0.5)",
  },
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-design-mode");
  document.documentElement.removeAttribute("data-modern-style");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.querySelector('link[rel="icon"]')?.remove();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme application", () => {
  it("falls back to the default modern design when the catalog cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const styles = await loadModernDesigns();

    expect(styles).toHaveLength(1);
    expect(styles[0]?.id).toBe(DEFAULT_MODERN_STYLE_ID);
  });

  it("applies modern design vars, root attributes, rgb helper vars, and favicon", () => {
    applyDesignMode("modern");
    applyModernDesign(modernStyle);

    expect(document.documentElement.dataset.designMode).toBe("modern");
    expect(document.documentElement.dataset.modernStyle).toBe("glass-test");
    expect(document.documentElement.style.getPropertyValue("--palette-primary")).toBe("#010203");
    expect(document.documentElement.style.getPropertyValue("--rgb-primary")).toBe("1, 2, 3");
    expect(document.querySelector('link[rel="icon"]')).toBeInTheDocument();
  });

  it("applies retro theme vars and rgb helper vars without clearing modern style identity", () => {
    document.documentElement.dataset.modernStyle = "glass-test";
    applyDesignMode("retro");
    applyTheme(theme);

    expect(document.documentElement.dataset.designMode).toBe("retro");
    expect(document.documentElement.dataset.theme).toBe("crt-test");
    expect(document.documentElement.dataset.modernStyle).toBe("glass-test");
    expect(document.documentElement.style.getPropertyValue("--rgb-secondary")).toBe("68, 85, 102");
  });
});
