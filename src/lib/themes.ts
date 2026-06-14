// theme loading and CSS var injection

export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
}

export const DEFAULT_THEME_ID = "crt-amber";

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

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  updateFavicon(theme.vars["--palette-primary"] ?? "#ffb000", theme.vars["--palette-bg-base"] ?? "#090500");
}
