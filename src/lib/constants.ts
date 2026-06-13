function resolveWsUrl(configuredUrl: string | undefined): string {
  const value = configuredUrl?.trim() || "/ws";
  if (/^wss?:\/\//i.test(value)) return value;
  if (typeof window === "undefined") return value;

  const url = new URL(value, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";
export const WS_URL = resolveWsUrl(import.meta.env.VITE_WS_URL);

export const LIVE_BUFFER_CAP = 500;
export const MAX_INFINITE_PAGES = 20;
export const DEFAULT_PAGE_SIZE = 50;

export const SCROLL_TOP_THRESHOLD_PX = 100;
export const SCROLL_BOTTOM_THRESHOLD_PX = 500;

export const WS_PING_INTERVAL_MS = 30_000;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30_000;
export const WS_RECONNECT_JITTER = 0.25;

// app tab names, in display order; the ?tab URL param is validated against this list
export const TABS = ["Live", "Packets", "Channels", "Map", "Nodes", "Observers", "Routes", "Traces", "Stats"] as const;
