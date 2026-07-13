import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGlobalSearch } from "../api/client";
import { useRegion } from "../hooks/useRegion";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { CloseButton } from "./CloseButton";
import { TerminalCursor, TerminalLoadingState } from "./TerminalLoader";
import type { GlobalSearchResult, GlobalSearchResultType } from "../types/api";
import { canonicalizeInvestigationPath } from "../features/investigations/storage";
import { WatchNodeButton } from "../features/investigations/WatchNodeButton";

interface GlobalSearchPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: GlobalSearchResult) => void;
}

const PAGE_RESULTS: GlobalSearchResult[] = [
  { type: "page", id: "home", label: "Home", subtitle: "Beacon data overview", url: "/?tab=Home", score: 300, matched: "page" },
  { type: "page", id: "live", label: "Live", subtitle: "Live packet operations map", url: "/?tab=Live", score: 299, matched: "page" },
  { type: "page", id: "map", label: "Map", subtitle: "Node map and route replay", url: "/?tab=Map", score: 298, matched: "page" },
  { type: "page", id: "packets", label: "Packets", subtitle: "Packet feed and analyzer", url: "/?tab=Packets", score: 297, matched: "page" },
  { type: "page", id: "channels", label: "Channels", subtitle: "Decoded channel messages", url: "/?tab=Channels", score: 296, matched: "page" },
  { type: "page", id: "nodes", label: "Nodes", subtitle: "Node directory", url: "/?tab=Nodes", score: 295, matched: "page" },
  { type: "page", id: "observers", label: "Observers", subtitle: "Observer fleet", url: "/?tab=Observers", score: 294, matched: "page" },
  { type: "page", id: "analytics", label: "Analytics", subtitle: "Mesh analytics and RF data", url: "/?tab=Analytics", score: 293, matched: "page" },
  { type: "page", id: "netgraph", label: "Netgraph", subtitle: "Experimental 3D route topology", url: "/?tab=Netgraph", score: 292, matched: "page" },
  { type: "page", id: "routes", label: "Routes", subtitle: "Known route catalogue", url: "/?tab=Routes", score: 291, matched: "page" },
  { type: "page", id: "traces", label: "Traces", subtitle: "Trace and ping series", url: "/?tab=Traces", score: 290, matched: "page" },
  { type: "page", id: "system", label: "System", subtitle: "API, readiness, broker, and live bus status", url: "/?tab=System", score: 289, matched: "page" },
  { type: "page", id: "investigations", label: "Investigations", subtitle: "Saved browser-local workspaces", url: "/?tab=Investigations", score: 288, matched: "page" },
];

const PAGE_ALIASES: Record<string, string> = {
  home: "dashboard summary",
  live: "console realtime",
  map: "geography",
  packets: "messages traffic",
  channels: "chat catalogue",
  nodes: "radios devices",
  observers: "gateways",
  analytics: "atlas stats statistics",
  netgraph: "network graph",
  routes: "paths",
  traces: "pings",
  system: "diagnostics health ready readiness slo",
  investigations: "saved workspace watchlist case",
};

const TYPE_LABEL: Record<GlobalSearchResultType, string> = {
  page: "PAGE",
  packet: "PKT",
  node: "NODE",
  observer: "OBS",
  channel: "CHAN",
  route: "ROUTE",
  trace: "TRACE",
};

const RECENT_SEARCHES_KEY = "beacon-global-search-recents";
const MAX_RECENT_SEARCHES = 6;

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function readRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(searches: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Private browsing / quota should not block search.
  }
}

function localPageResults(query: string): GlobalSearchResult[] {
  const needle = query.trim().toLowerCase();
  let source = "/?tab=Home";
  try {
    source = canonicalizeInvestigationPath(window.location.href);
    if (source.includes("tab=Investigations")) source = "/?tab=Home";
  } catch {
    // Keep the safe Home fallback.
  }
  const saveParams = new URLSearchParams({ tab: "Investigations", create: "1", source });
  const saveAction: GlobalSearchResult = {
    type: "page",
    id: "save-investigation",
    label: "Save Investigation",
    subtitle: "Capture the current URL workspace",
    url: `/?${saveParams.toString()}`,
    score: 400,
    matched: "action",
  };
  const values = [saveAction, ...PAGE_RESULTS];
  if (!needle) return values;
  return values.filter((item) => `${item.label} ${item.subtitle ?? ""} ${PAGE_ALIASES[item.id] ?? ""}`.toLowerCase().includes(needle));
}

function mergeSearchResults(local: GlobalSearchResult[], remote: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  return [...remote, ...local].filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function GlobalSearchPalette({ open, onClose, onSelect }: GlobalSearchPaletteProps) {
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const debounced = useDebounced(query.trim(), 180);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = "beacon-global-search-results";
  useFocusTrap(dialogRef);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const search = useQuery({
    queryKey: ["global-search", regionKey, debounced],
    queryFn: ({ signal }) => getGlobalSearch(iatas, { q: debounced, limit: 24 }, signal),
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
  });

  const items = useMemo(() => {
    const local = localPageResults(query);
    if (debounced.length < 2) return local;
    return mergeSearchResults(local, search.data?.items ?? []);
  }, [debounced.length, query, search.data?.items]);

  if (!open) return null;

  const safeSelectedIndex = items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);
  const selected = items[safeSelectedIndex];

  function choose(result: GlobalSearchResult | undefined) {
    if (!result) return;
    const trimmedQuery = query.trim();
    if (trimmedQuery.length >= 2) {
      const next = [trimmedQuery, ...recentSearches.filter((item) => item.toLowerCase() !== trimmedQuery.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(next);
      writeRecentSearches(next);
    }
    onSelect(result);
    setQuery("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-sepia fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global Beacon search"
        tabIndex={-1}
        className="crt-float-panel flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden border border-primary/45 bg-bg-surface shadow-[0_0_34px_rgba(var(--rgb-primary),0.22)]"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-primary">SEARCH</span>
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setSelectedIndex(0);
              }}
              placeholder="Search packets, nodes, observers, channels, routes, traces..."
              className="w-full bg-transparent py-1 pr-7 font-mono text-sm text-text-bright placeholder:text-text-dim focus:outline-none"
              aria-label="Global search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-activedescendant={selected ? `search-result-${selected.type}-${selected.id}` : undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedIndex((idx) => items.length === 0 ? 0 : (idx + 1) % items.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedIndex((idx) => items.length === 0 ? 0 : (idx - 1 + items.length) % items.length);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setSelectedIndex(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setSelectedIndex(Math.max(0, items.length - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(selected);
                }
              }}
            />
            <TerminalCursor className="absolute right-1 top-1/2 -translate-y-1/2" />
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <div className="border-b border-border-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">
          Ctrl+K / Enter select / Esc close
        </div>

        {query.trim().length === 0 && recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle px-3 py-2 font-mono text-[10px]">
            <span className="mr-1 uppercase tracking-wider text-text-dim">Recent</span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                className="rounded-sm border border-border bg-bg-raised/70 px-2 py-0.5 text-text-muted transition-colors hover:border-primary hover:text-text-normal"
                onClick={() => {
                  setQuery(term);
                  setSelectedIndex(0);
                }}
              >
                {term}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 overflow-y-auto p-2">
          {(search.isLoading || debounced !== query.trim()) && query.trim().length >= 2 && (
            <div className="mb-2 border border-primary/25 bg-primary/5 p-2">
              <TerminalLoadingState label="QUERYING REMOTE PROVIDERS" detail="LOCAL PAGE MATCHES REMAIN AVAILABLE" />
            </div>
          )}
          {(search.isError || search.data?.partial) && debounced.length >= 2 && (
            <div role="status" className="mb-2 flex items-center justify-between gap-2 border border-warn/45 bg-warn/8 px-2.5 py-2 font-mono text-[11px] text-warn">
              <span>PARTIAL RESULTS — ONE OR MORE SEARCH PROVIDERS ARE DEGRADED</span>
              <button type="button" className="min-h-11 shrink-0 border border-warn/50 px-3 text-[10px] font-semibold hover:bg-warn/10" onClick={() => void search.refetch()}>
                RETRY
              </button>
            </div>
          )}
          {items.length === 0 && !search.isLoading ? (
            <div className="p-4 font-mono text-[12px] text-text-dim">NO MATCHING SIGNALS</div>
          ) : (
            <div id={listboxId} role="listbox" aria-label="Search results" className="space-y-1">
              {items.map((item, index) => (
                <div
                  key={`${item.type}:${item.id}`}
                  className={`flex w-full items-center rounded-sm border transition-colors ${
                    index === safeSelectedIndex
                      ? "border-primary bg-primary/12 text-text-bright"
                      : "border-transparent text-text-muted hover:border-border hover:bg-bg-raised/60 hover:text-text-normal"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <button
                    id={`search-result-${item.type}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === safeSelectedIndex}
                    tabIndex={-1}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                    onClick={() => choose(item)}
                  >
                    <span className="w-12 shrink-0 rounded-sm border border-primary/35 bg-primary/8 px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-primary">
                      {TYPE_LABEL[item.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] font-semibold">{item.label}</span>
                      {item.subtitle && <span className="block truncate font-mono text-[11px] text-text-dim">{item.subtitle}</span>}
                    </span>
                    <span className="hidden shrink-0 font-mono text-[10px] uppercase text-text-dim sm:block">{item.matched ?? item.type}</span>
                  </button>
                  {item.type === "node" && typeof item.metadata?.publicKey === "string" && (
                    <WatchNodeButton compact publicKey={item.metadata.publicKey} nodeId={item.id} label={item.label} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
