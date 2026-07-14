import type { NetgraphLayoutMode, NetgraphQualityPreference } from "./netgraph-model";

const LAYOUT_KEY = "beacon.netgraph.layout.v2";
const QUALITY_KEY = "beacon.netgraph.quality.v1";
const LIVE_GUIDE_KEY = "beacon.netgraph.live-guide.v1";
const INTRO_SESSION_KEY = "beacon.netgraph.intro-complete.v1";

export function readNetgraphLayoutMode(): NetgraphLayoutMode {
  return readStorage(localStorageSafe(), LAYOUT_KEY) === "geo" ? "geo" : "galaxy";
}

export function writeNetgraphLayoutMode(mode: NetgraphLayoutMode): void {
  writeStorage(localStorageSafe(), LAYOUT_KEY, mode);
}

export function readNetgraphQualityPreference(): NetgraphQualityPreference {
  return readStorage(localStorageSafe(), QUALITY_KEY) === "low-power" ? "low-power" : "cinematic";
}

export function writeNetgraphQualityPreference(mode: NetgraphQualityPreference): void {
  writeStorage(localStorageSafe(), QUALITY_KEY, mode);
}

export function readNetgraphLiveGuideEnabled(): boolean {
  return readStorage(localStorageSafe(), LIVE_GUIDE_KEY) !== "off";
}

export function writeNetgraphLiveGuideEnabled(enabled: boolean): void {
  writeStorage(localStorageSafe(), LIVE_GUIDE_KEY, enabled ? "on" : "off");
}

export function netgraphIntroCompletedThisSession(): boolean {
  return readStorage(sessionStorageSafe(), INTRO_SESSION_KEY) === "1";
}

export function markNetgraphIntroCompletedThisSession(): void {
  writeStorage(sessionStorageSafe(), INTRO_SESSION_KEY, "1");
}

function localStorageSafe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sessionStorageSafe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStorage(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened/private contexts; defaults remain deterministic.
  }
}
