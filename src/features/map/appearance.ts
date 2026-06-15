import {
  MAP_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION,
  resolveMapStyle,
} from "./types";

export type MapContrastMode = "auto" | "high" | "soft";
export type MapTintMode = "profile" | "theme" | "neutral";
export type MapGlowMode = "normal" | "reduced" | "boosted";
export type MapReliefMode = "normal" | "strong" | "soft";

export interface MapAppearanceSettings {
  contrast: MapContrastMode;
  tint: MapTintMode;
  glow: MapGlowMode;
  relief: MapReliefMode;
}

export interface MapVisualProfile {
  id: "dark" | "liberty" | "light";
  key: string;
  name: string;
  isDark: boolean;
  effectiveTint: Exclude<MapTintMode, "profile">;
  effectiveContrast: Exclude<MapContrastMode, "auto"> | "normal";
  glow: MapGlowMode;
  relief: MapReliefMode;
  terrainExaggeration: number;
  hillshadeExaggeration: number;
  hillshadeShadowColor: string;
  hillshadeHighlightColor: string;
  vars: Record<string, string>;
}

export const MAP_CONTRAST_STORAGE_KEY = "beacon-map-contrast";
export const MAP_TINT_STORAGE_KEY = "beacon-map-tint";
export const MAP_GLOW_STORAGE_KEY = "beacon-map-glow";
export const MAP_RELIEF_STORAGE_KEY = "beacon-map-relief";

export const DEFAULT_MAP_APPEARANCE_SETTINGS: MapAppearanceSettings = {
  contrast: "auto",
  tint: "profile",
  glow: "normal",
  relief: "normal",
};

type ThemeVars = Record<string, string | undefined>;
type RGB = [number, number, number];

const NEUTRAL = {
  primary: "#f5c451",
  primaryDim: "#b98520",
  secondary: "#52d9c7",
  green: "#68e58a",
  warn: "#ffd166",
  danger: "#ff7063",
  textBright: "#fff4cf",
  textNormal: "#f0cc7a",
  textMuted: "#b99a5c",
  textDim: "#7d6a43",
  bgBase: "#060707",
  bgSurface: "#10100d",
  bgRaised: "#181510",
  border: "#6d5828",
  borderSubtle: "#38301f",
};

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function readMapAppearanceSettings(): MapAppearanceSettings {
  return {
    contrast: stored(MAP_CONTRAST_STORAGE_KEY, ["auto", "high", "soft"] as const, "auto"),
    tint: stored(MAP_TINT_STORAGE_KEY, ["profile", "theme", "neutral"] as const, "profile"),
    glow: stored(MAP_GLOW_STORAGE_KEY, ["normal", "reduced", "boosted"] as const, "normal"),
    relief: stored(MAP_RELIEF_STORAGE_KEY, ["normal", "strong", "soft"] as const, "normal"),
  };
}

export function persistMapAppearanceSettings(settings: MapAppearanceSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MAP_CONTRAST_STORAGE_KEY, settings.contrast);
  localStorage.setItem(MAP_TINT_STORAGE_KEY, settings.tint);
  localStorage.setItem(MAP_GLOW_STORAGE_KEY, settings.glow);
  localStorage.setItem(MAP_RELIEF_STORAGE_KEY, settings.relief);
}

function readRootThemeVars(): ThemeVars {
  if (typeof document === "undefined") return {};
  const styles = getComputedStyle(document.documentElement);
  const names = [
    "--palette-primary",
    "--palette-primary-dim",
    "--palette-secondary",
    "--palette-green",
    "--palette-danger",
    "--palette-warn",
    "--palette-text-bright",
    "--palette-text-normal",
    "--palette-text-muted",
    "--palette-text-dim",
    "--palette-bg-base",
    "--palette-bg-surface",
    "--palette-bg-raised",
    "--palette-border",
    "--palette-border-subtle",
    "--crt-phosphor",
    "--crt-phosphor-soft",
  ];
  return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]));
}

function pick(vars: ThemeVars, name: string, fallback: string): string {
  return vars[name]?.trim() || fallback;
}

function hexToRgb(color: string): RGB {
  const hex = color.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) {
    return hex.split("").map((part) => Number.parseInt(part + part, 16)) as RGB;
  }
  if (/^[\da-f]{6}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  const rgb = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [255, 176, 0];
}

function rgba(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mix(a: string, b: string, amount = 0.5): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `rgb(${m(ar, br)}, ${m(ag, bg)}, ${m(ab, bb)})`;
}

function paletteForTint(tint: Exclude<MapTintMode, "profile">, themeVars: ThemeVars) {
  if (tint === "neutral") return NEUTRAL;
  return {
    primary: pick(themeVars, "--palette-primary", NEUTRAL.primary),
    primaryDim: pick(themeVars, "--palette-primary-dim", NEUTRAL.primaryDim),
    secondary: pick(themeVars, "--palette-secondary", NEUTRAL.secondary),
    green: pick(themeVars, "--palette-green", NEUTRAL.green),
    warn: pick(themeVars, "--palette-warn", NEUTRAL.warn),
    danger: pick(themeVars, "--palette-danger", NEUTRAL.danger),
    textBright: pick(themeVars, "--palette-text-bright", NEUTRAL.textBright),
    textNormal: pick(themeVars, "--palette-text-normal", NEUTRAL.textNormal),
    textMuted: pick(themeVars, "--palette-text-muted", NEUTRAL.textMuted),
    textDim: pick(themeVars, "--palette-text-dim", NEUTRAL.textDim),
    bgBase: pick(themeVars, "--palette-bg-base", NEUTRAL.bgBase),
    bgSurface: pick(themeVars, "--palette-bg-surface", NEUTRAL.bgSurface),
    bgRaised: pick(themeVars, "--palette-bg-raised", NEUTRAL.bgRaised),
    border: pick(themeVars, "--palette-border", NEUTRAL.border),
    borderSubtle: pick(themeVars, "--palette-border-subtle", NEUTRAL.borderSubtle),
  };
}

function profileId(styleId: string): MapVisualProfile["id"] {
  if (styleId === "liberty") return "liberty";
  if (styleId === "positron") return "light";
  return "dark";
}

function terrainForRelief(relief: MapReliefMode): number {
  if (relief === "strong") return MAP_TERRAIN_EXAGGERATION * 1.35;
  if (relief === "soft") return TERRAIN_EXAGGERATION;
  return MAP_TERRAIN_EXAGGERATION;
}

export function resolveMapVisualProfile(
  styleId: string,
  settings: MapAppearanceSettings = DEFAULT_MAP_APPEARANCE_SETTINGS,
  themeVars: ThemeVars = readRootThemeVars(),
): MapVisualProfile {
  const style = resolveMapStyle(styleId);
  const id = profileId(style.id);
  const effectiveTint = settings.tint === "profile" ? (id === "dark" ? "theme" : "neutral") : settings.tint;
  const effectiveContrast = settings.contrast === "auto" ? (id === "dark" ? "normal" : "high") : settings.contrast;
  const palette = paletteForTint(effectiveTint, themeVars);
  const high = effectiveContrast === "high";
  const soft = effectiveContrast === "soft";
  const glowFactor = settings.glow === "boosted" ? 1.34 : settings.glow === "reduced" ? 0.58 : id === "dark" ? 1.08 : 0.82;
  const panelAlpha = id === "dark" ? (soft ? 0.68 : 0.78) : high ? 0.9 : 0.82;
  const controlAlpha = id === "dark" ? 0.88 : high ? 0.94 : 0.86;
  const borderAlpha = high ? 0.72 : soft ? 0.38 : 0.55;
  const routeGlowOpacity = String((id === "dark" ? 0.36 : high ? 0.5 : 0.28) * glowFactor);
  const routeLineOpacity = String(id === "dark" ? 0.92 : high ? 0.98 : 0.86);
  const textOnMap = id === "dark" ? palette.textBright : "#061012";
  const haloOnMap = id === "dark" ? "rgba(0,0,0,0.92)" : high ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.84)";
  const backplate = id === "dark" ? rgba(palette.bgBase, 0.94) : "rgba(3, 5, 6, 0.92)";
  const canvasFilter =
    id === "dark"
      ? `sepia(${effectiveTint === "theme" ? 0.28 : 0.14}) saturate(1.18) contrast(${high ? 1.2 : 1.1}) brightness(${soft ? 0.88 : 0.82}) drop-shadow(0 0 ${Math.round(8 * glowFactor)}px ${rgba(palette.primary, 0.16)})`
      : id === "liberty"
        ? `saturate(${effectiveTint === "theme" ? 1.04 : 0.92}) contrast(${high ? 1.12 : 1.04}) brightness(${high ? 0.88 : 0.94}) drop-shadow(0 0 ${Math.round(5 * glowFactor)}px ${rgba(palette.primary, 0.1)})`
        : `saturate(${effectiveTint === "theme" ? 1 : 0.86}) contrast(${high ? 1.18 : 1.08}) brightness(${high ? 0.82 : 0.9}) drop-shadow(0 0 ${Math.round(4 * glowFactor)}px ${rgba(palette.primary, 0.08)})`;

  const hillshadeExaggeration = settings.relief === "strong" ? 0.84 : settings.relief === "soft" ? 0.36 : id === "dark" ? 0.58 : 0.66;
  const hillshadeShadowColor = id === "dark" ? "#000000" : "#161616";
  const hillshadeHighlightColor = id === "dark" ? mix(palette.primary, "#ffffff", 0.16) : "#ffffff";
  const panelBg = id === "dark" ? rgba(palette.bgSurface, panelAlpha) : `rgba(5, 7, 8, ${panelAlpha})`;
  const panelRaised = id === "dark" ? rgba(palette.bgRaised, Math.min(0.96, panelAlpha + 0.08)) : `rgba(10, 12, 13, ${Math.min(0.96, panelAlpha + 0.04)})`;

  return {
    id,
    key: `${id}:${settings.contrast}:${settings.tint}:${settings.glow}:${settings.relief}:${effectiveTint}`,
    name: style.name,
    isDark: style.dark,
    effectiveTint,
    effectiveContrast,
    glow: settings.glow,
    relief: settings.relief,
    terrainExaggeration: terrainForRelief(settings.relief),
    hillshadeExaggeration,
    hillshadeShadowColor,
    hillshadeHighlightColor,
    vars: {
      "--map-primary": palette.primary,
      "--map-primary-dim": palette.primaryDim,
      "--map-secondary": palette.secondary,
      "--map-green": palette.green,
      "--map-warn": palette.warn,
      "--map-danger": palette.danger,
      "--map-text-bright": id === "dark" ? palette.textBright : "#fff6d5",
      "--map-text-normal": id === "dark" ? palette.textNormal : "#ead08d",
      "--map-text-muted": id === "dark" ? palette.textMuted : "#bda46f",
      "--map-text-dim": id === "dark" ? palette.textDim : "#827453",
      "--map-panel-bg": panelBg,
      "--map-panel-bg-raised": panelRaised,
      "--map-panel-border": rgba(palette.primary, borderAlpha),
      "--map-panel-border-subtle": rgba(palette.primaryDim, soft ? 0.26 : 0.42),
      "--map-panel-shadow": `0 0 ${Math.round((id === "dark" ? 18 : 12) * glowFactor)}px ${rgba(palette.primary, id === "dark" ? 0.18 : 0.12)}`,
      "--map-control-bg": id === "dark" ? rgba(palette.bgRaised, controlAlpha) : `rgba(7, 8, 9, ${controlAlpha})`,
      "--map-control-hover": rgba(palette.primary, high ? 0.18 : 0.12),
      "--map-canvas-filter": canvasFilter,
      "--map-node-label": textOnMap,
      "--map-node-label-halo": haloOnMap,
      "--map-node-backplate": backplate,
      "--map-node-companion": palette.primary,
      "--map-node-repeater": palette.secondary,
      "--map-node-room": palette.green,
      "--map-node-sensor": palette.warn,
      "--map-observer": palette.secondary,
      "--map-cluster-text": "#fff7cc",
      "--map-spider-leg": id === "dark" ? rgba(palette.textDim, 0.92) : "rgba(20,22,24,0.88)",
      "--map-route-primary": palette.primary,
      "--map-route-secondary": palette.secondary,
      "--map-route-green": palette.green,
      "--map-route-glow-opacity": routeGlowOpacity,
      "--map-route-line-opacity": routeLineOpacity,
      "--map-route-glow-width": String(id === "dark" ? 10 : high ? 13 : 9),
      "--map-route-line-width": String(id === "dark" ? 2.4 : high ? 3 : 2.2),
      "--map-live-heat-core": palette.primary,
      "--map-live-heat-mid": effectiveTint === "theme" ? pick(themeVars, "--crt-phosphor-soft", palette.primaryDim) : palette.warn,
      "--map-live-heat-edge": palette.secondary,
      "--map-glow-factor": String(glowFactor),
      "--map-hillshade-exaggeration": String(hillshadeExaggeration),
      "--map-hillshade-shadow-color": hillshadeShadowColor,
      "--map-hillshade-highlight-color": hillshadeHighlightColor,
    },
  };
}

export function mapVisualProfileStyle(profile: MapVisualProfile): Record<string, string> {
  return profile.vars;
}
