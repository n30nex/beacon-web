// theme loading and CSS var injection

export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
}

export interface ModernDesignStyle {
  id: string;
  name: string;
  description: string;
  swatches: string[];
  vars: Record<string, string>;
}

export type DesignMode = "retro" | "modern";

export const DEFAULT_THEME_ID = "crt-amber";
export const DEFAULT_MODERN_STYLE_ID = "iphone-glass-dark";

const FALLBACK: Theme = {
  id: "crt-amber",
  name: "Default Amber CRT",
  vars: {
    "--palette-bg-base": "#090500",
    "--palette-bg-surface": "#120900",
    "--palette-bg-raised": "#1d1002",
    "--palette-border": "#5f3708",
    "--palette-border-subtle": "#332006",
    "--palette-primary": "#ffb000",
    "--palette-primary-dim": "#a96500",
    "--palette-secondary": "#42ff7c",
    "--palette-green": "#42ff7c",
    "--palette-danger": "#ff5f2e",
    "--palette-warn": "#ffd166",
    "--palette-text-bright": "#ffe9a8",
    "--palette-text-normal": "#ffc766",
    "--palette-text-muted": "#b97c24",
    "--palette-text-dim": "#6e4818",
    "--crt-phosphor": "#ffb000",
    "--crt-phosphor-soft": "#ff7a18",
    "--crt-glow": "0.72",
    "--crt-scanline-opacity": "0.34",
    "--crt-noise-opacity": "0.12",
    "--crt-curvature": "0.55",
    "--crt-flicker": "0.45",
  },
};

const MODERN_FALLBACK: ModernDesignStyle = {
  id: "iphone-glass-dark",
  name: "iPhone Glass Dark",
  description: "Black glass, frosted chrome, blue-violet signal light.",
  swatches: ["#f8fbff", "#7ab7ff", "#a78bfa", "#05070d"],
  vars: {
    "--palette-bg-base": "#05070d",
    "--palette-bg-surface": "#0c111d",
    "--palette-bg-raised": "#151c2b",
    "--palette-border": "#607190",
    "--palette-border-subtle": "#253044",
    "--palette-primary": "#7ab7ff",
    "--palette-primary-dim": "#416da8",
    "--palette-secondary": "#a78bfa",
    "--palette-green": "#54e1a6",
    "--palette-danger": "#ff6b8a",
    "--palette-warn": "#ffd76d",
    "--palette-text-bright": "#f8fbff",
    "--palette-text-normal": "#d6e2f2",
    "--palette-text-muted": "#91a1b8",
    "--palette-text-dim": "#7f8da3",
    "--crt-phosphor": "#7ab7ff",
    "--crt-phosphor-soft": "#a78bfa",
    "--crt-glow": "0",
    "--crt-scanline-opacity": "0",
    "--crt-noise-opacity": "0",
    "--crt-curvature": "0",
    "--crt-flicker": "0",
    "--modern-bg-a": "rgba(122, 183, 255, 0.34)",
    "--modern-bg-b": "rgba(167, 139, 250, 0.28)",
    "--modern-bg-c": "rgba(84, 225, 166, 0.16)",
    "--modern-glass-bg": "rgba(13, 19, 32, 0.54)",
    "--modern-glass-bg-strong": "rgba(17, 25, 41, 0.72)",
    "--modern-glass-border": "rgba(255, 255, 255, 0.17)",
    "--modern-glass-border-strong": "rgba(255, 255, 255, 0.28)",
    "--modern-glass-highlight": "rgba(255, 255, 255, 0.16)",
    "--modern-glass-blur": "14px",
    "--modern-glass-saturate": "1.22",
    "--modern-shadow-soft": "0 10px 28px rgba(0, 0, 0, 0.3)",
    "--modern-shadow-strong": "0 18px 48px rgba(0, 0, 0, 0.44)",
    "--modern-radius-sm": "6px",
    "--modern-radius-md": "8px",
    "--modern-radius-lg": "8px",
    "--modern-ambient-opacity": "0.45",
    "--modern-noise-opacity": "0.012",
  },
};

export async function loadThemes(): Promise<Theme[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}themes.json`);
    if (!res.ok) return [FALLBACK];
    const data: Theme[] = await res.json();
    return data.length > 0 ? data : [FALLBACK];
  } catch {
    return [FALLBACK];
  }
}

export async function loadModernDesigns(): Promise<ModernDesignStyle[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}modern-designs.json`);
    if (!res.ok) return [MODERN_FALLBACK];
    const data: ModernDesignStyle[] = await res.json();
    return data.length > 0 ? data : [MODERN_FALLBACK];
  } catch {
    return [MODERN_FALLBACK];
  }
}

// Rebuild the browser-tab favicon in the active primary color. A favicon file
// can't read the page's CSS vars, so we regenerate it as a data-URI on every
// theme apply (initial load + each switch) so the tab follows the theme.
function updateFavicon(primary: string, bg: string) {
  if (typeof document === "undefined") return;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">` +
    `<rect width="100" height="100" rx="14" fill="${bg}"/>` +
    `<path d="M0 8h100M0 18h100M0 28h100M0 38h100M0 48h100M0 58h100M0 68h100M0 78h100M0 88h100" stroke="${primary}" stroke-opacity=".12" stroke-width="2"/>` +
    `<polygon points="90,50 70,84.64 30,84.64 10,50 30,15.36 70,15.36" fill="none" stroke="${primary}" stroke-width="5" stroke-linejoin="round" opacity="0.28"/>` +
    `<polygon points="78,50 64,74.25 36,74.25 22,50 36,25.75 64,25.75" fill="none" stroke="${primary}" stroke-width="5" stroke-linejoin="round" opacity="0.62"/>` +
    `<polygon points="66,50 58,63.86 42,63.86 34,50 42,36.14 58,36.14" fill="none" stroke="${primary}" stroke-width="5" stroke-linejoin="round" opacity="1"/>` +
    `<circle cx="50" cy="50" r="7" fill="${primary}"/>` +
    `</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = href;
}

function parseColorToRgb(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    let hex = trimmed.slice(1);
    if (/^[\da-f]{3}$/i.test(hex)) {
      hex = hex.split("").map((part) => part + part).join("");
    }
    if (/^[\da-f]{6}$/i.test(hex)) {
      const n = Number.parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }
  const rgb = trimmed.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function setRgbVars(root: HTMLElement, vars: Record<string, string>) {
  const pairs = [
    ["--palette-primary", "--rgb-primary"],
    ["--palette-secondary", "--rgb-secondary"],
    ["--palette-green", "--rgb-green"],
    ["--palette-danger", "--rgb-danger"],
    ["--palette-warn", "--rgb-warn"],
  ] as const;
  for (const [source, target] of pairs) {
    const rgb = parseColorToRgb(vars[source] ?? "");
    if (rgb) root.style.setProperty(target, rgb.join(", "));
  }
}

function applyVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
  setRgbVars(root, vars);
}

export function applyDesignMode(mode: DesignMode) {
  document.documentElement.dataset.designMode = mode;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  applyVars(theme.vars);
  updateFavicon(theme.vars["--palette-primary"] ?? "#ffb000", theme.vars["--palette-bg-base"] ?? "#090500");
}

export function applyModernDesign(style: ModernDesignStyle) {
  const root = document.documentElement;
  root.dataset.modernStyle = style.id;
  applyVars(style.vars);
  updateFavicon(style.vars["--palette-primary"] ?? "#7ab7ff", style.vars["--palette-bg-base"] ?? "#05070d");
}
