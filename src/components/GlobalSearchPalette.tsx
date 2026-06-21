import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGlobalSearch } from "../api/client";
import { useRegion } from "../hooks/useRegion";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { CloseButton } from "./CloseButton";
import { TerminalCursor, TerminalLoadingState } from "./TerminalLoader";
import type { GlobalSearchResult, GlobalSearchResultType } from "../types/api";

interface GlobalSearchPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: GlobalSearchResult) => void;
}

const PAGE_RESULTS: GlobalSearchResult[] = [
  { type: "page", id: "atlas", label: "Atlas", subtitle: "Regional mesh atlas", url: "/?tab=Atlas", score: 300, matched: "page" },
  { type: "page", id: "live", label: "Live", subtitle: "Live packet operations map", url: "/?tab=Live", score: 299, matched: "page" },
  { type: "page", id: "packets", label: "Packets", subtitle: "Packet feed and analyzer", url: "/?tab=Packets", score: 298, matched: "page" },
  { type: "page", id: "channels", label: "Channels", subtitle: "Decoded channel messages", url: "/?tab=Channels", score: 297, matched: "page" },
  { type: "page", id: "map", label: "Map", subtitle: "Node map and route replay", url: "/?tab=Map", score: 296, matched: "page" },
  { type: "page", id: "nodes", label: "Nodes", subtitle: "Node directory", url: "/?tab=Nodes", score: 295, matched: "page" },
  { type: "page", id: "observers", label: "Observers", subtitle: "Observer fleet", url: "/?tab=Observers", score: 294, matched: "page" },
  { type: "page", id: "routes", label: "Routes", subtitle: "Known route catalogue", url: "/?tab=Routes", score: 293, matched: "page" },
  { type: "page", id: "traces", label: "Traces", subtitle: "Trace and ping series", url: "/?tab=Traces", score: 292, matched: "page" },
  { type: "page", id: "stats", label: "Stats", subtitle: "Analytics and RF health", url: "/?tab=Stats", score: 291, matched: "page" },
];

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
  if (!needle) return PAGE_RESULTS;
  return PAGE_RESULTS.filter((item) => `${item.label} ${item.subtitle ?? ""}`.toLowerCase().includes(needle));
}

export function GlobalSearchPalette({ open, onClose, onSelect }: GlobalSearchPaletteProps) {
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const debounced = useDebounced(query.trim(), 180);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const search = useQuery({
    queryKey: ["global-search", regionKey, debounced],
    queryFn: () => getGlobalSearch(iatas, { q: debounced, limit: 24 }),
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
  });

  const items = useMemo(
    () => (debounced.length >= 2 ? (search.data?.items ?? []) : localPageResults(query)),
    [debounced.length, query, search.data?.items],
  );

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
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((idx) => Math.min(items.length - 1, idx + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((idx) => Math.max(0, idx - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(selected);
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
          {search.isLoading && debounced.length >= 2 ? (
            <TerminalLoadingState label="QUERYING GLOBAL INDEX" detail="PLEASE WAIT" />
          ) : search.isError ? (
            <div className="p-4 font-mono text-[12px] text-danger">SEARCH BUS DEGRADED</div>
          ) : items.length === 0 ? (
            <div className="p-4 font-mono text-[12px] text-text-dim">NO MATCHING SIGNALS</div>
          ) : (
            <div role="listbox" aria-label="Search results" className="space-y-1">
              {items.map((item, index) => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === safeSelectedIndex}
                  className={`flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors ${
                    index === safeSelectedIndex
                      ? "border-primary bg-primary/12 text-text-bright"
                      : "border-transparent text-text-muted hover:border-border hover:bg-bg-raised/60 hover:text-text-normal"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
