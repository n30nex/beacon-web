// Browser-local, versioned saved workspaces. Only canonical routing state is
// stored; packet bodies, decrypted content, credentials, and arbitrary query
// parameters are rejected by construction.

export const SAVED_INVESTIGATIONS_KEY = "beacon.saved-investigations.v1";
export const WATCHLIST_KEY = "beacon.watchlist.v1";

export interface SavedInvestigationV1 {
  version: 1;
  id: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
}

export interface WatchlistV1 {
  version: 1;
  publicKey: string;
  lastKnownUuid?: string;
  label?: string;
  createdAt: number;
  updatedAt: number;
}

const ROUTE_KEYS = new Set([
  "tab", "regions", "iatas", "hash", "nodeId", "observerId", "channelId", "routeId", "routeReplay",
  "mapFocus", "traceTag", "traceType", "statsTab", "compare", "compareIds", "range", "q", "sf", "types", "routes",
  "obs", "scope", "status", "nodeType", "paths", "traces", "oq", "osf", "observerStatus", "observerType", "observerBroker", "observerScope", "cq", "csf", "channelKey", "channelHashtag", "routeFrom", "routeTo", "routeIatas", "broker", "preset", "bucket", "since", "until",
]);

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readArray<T>(key: string, validate: (value: unknown) => value is T): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(validate)) throw new Error("invalid storage schema");
    return parsed;
  } catch {
    try {
      localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
      localStorage.removeItem(key);
    } catch {
      // Storage may be read-only; returning an empty safe state is sufficient.
    }
    return [];
  }
}

function writeArray<T>(key: string, values: T[]) {
  localStorage.setItem(key, JSON.stringify(values));
  window.dispatchEvent(new CustomEvent("beacon-local-state", { detail: { key } }));
}

function isInvestigation(value: unknown): value is SavedInvestigationV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedInvestigationV1>;
  return item.version === 1 && typeof item.id === "string" && typeof item.name === "string" && typeof item.path === "string" && Number.isFinite(item.createdAt) && Number.isFinite(item.updatedAt);
}

function isWatch(value: unknown): value is WatchlistV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WatchlistV1>;
  return item.version === 1 && typeof item.publicKey === "string" && Number.isFinite(item.createdAt) && Number.isFinite(item.updatedAt);
}

export function canonicalizeInvestigationPath(input: string | URL): string {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("investigation links must remain same-origin");
  const canonical = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!ROUTE_KEYS.has(key)) continue;
    const trimmed = value.trim();
    if (trimmed.length > 500) continue;
    canonical.append(key, trimmed);
  }
  const legacyTab = canonical.get("tab");
  if (legacyTab === "Atlas") canonical.set("tab", "Home");
  if (legacyTab === "Stats") canonical.set("tab", "Analytics");
  if (legacyTab === "Runtime") canonical.set("tab", "System");
  canonical.delete("module");
  canonical.sort();
  return `${url.pathname || "/"}${canonical.size > 0 ? `?${canonical.toString()}` : ""}`;
}

export function readSavedInvestigations(): SavedInvestigationV1[] {
  return readArray(SAVED_INVESTIGATIONS_KEY, isInvestigation).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createSavedInvestigation(name: string, path: string): SavedInvestigationV1 {
  const now = Date.now();
  const item: SavedInvestigationV1 = { version: 1, id: newId(), name: name.trim() || "Untitled investigation", path: canonicalizeInvestigationPath(path), createdAt: now, updatedAt: now };
  writeArray(SAVED_INVESTIGATIONS_KEY, [item, ...readSavedInvestigations()]);
  return item;
}

export function renameSavedInvestigation(id: string, name: string) {
  writeArray(SAVED_INVESTIGATIONS_KEY, readSavedInvestigations().map((item) => item.id === id ? { ...item, name: name.trim() || item.name, updatedAt: Date.now() } : item));
}

export function deleteSavedInvestigation(id: string) {
  writeArray(SAVED_INVESTIGATIONS_KEY, readSavedInvestigations().filter((item) => item.id !== id));
}

export function importSavedInvestigations(json: string): SavedInvestigationV1[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every(isInvestigation)) throw new Error("unsupported investigation export");
  const existing = readSavedInvestigations();
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of parsed) {
    byId.set(item.id, { ...item, version: 1, name: item.name.trim() || "Untitled investigation", path: canonicalizeInvestigationPath(item.path), updatedAt: Number(item.updatedAt) || Date.now() });
  }
  const items = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  writeArray(SAVED_INVESTIGATIONS_KEY, items);
  return items;
}

export function readWatchlist(): WatchlistV1[] {
  return readArray(WATCHLIST_KEY, isWatch).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertWatchlistNode(publicKey: string, lastKnownUuid?: string, label?: string): WatchlistV1 {
  const key = publicKey.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (key.length < 8) throw new Error("node public key is invalid");
  const items = readWatchlist();
  const existing = items.find((item) => item.publicKey === key);
  const now = Date.now();
  const next: WatchlistV1 = existing
    ? { ...existing, lastKnownUuid: lastKnownUuid ?? existing.lastKnownUuid, label: label?.trim() || existing.label, updatedAt: now }
    : { version: 1, publicKey: key, lastKnownUuid, label: label?.trim() || undefined, createdAt: now, updatedAt: now };
  writeArray(WATCHLIST_KEY, [next, ...items.filter((item) => item.publicKey !== key)]);
  return next;
}

export function removeWatchlistNode(publicKey: string) {
  const key = publicKey.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  writeArray(WATCHLIST_KEY, readWatchlist().filter((item) => item.publicKey !== key));
}
