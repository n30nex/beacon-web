import { useCallback, useSyncExternalStore } from "react";

// One MediaQueryList per distinct query, shared across every hook instance. matchMedia() parses the
// query string and allocates a live MQL object; getSnapshot runs on every render of every consumer
// (and there can be one per row in a long list), so parsing/allocating there was pure waste. The
// cached MQL's `.matches` is kept live by the browser, so reading it is allocation-free and O(1).
const mqlCache = new Map<string, MediaQueryList>();
let cachedMatchMedia: typeof window.matchMedia | null = null;
function getMql(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  // Real browsers never reassign window.matchMedia, but tests remock it per-case — drop the cache
  // when its identity changes so a stale MQL from a prior mock can't leak across.
  if (window.matchMedia !== cachedMatchMedia) {
    cachedMatchMedia = window.matchMedia;
    mqlCache.clear();
  }
  let mql = mqlCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mqlCache.set(query, mql);
  }
  return mql;
}

// Tracks a CSS media query. useSyncExternalStore so the first render reads the real value (no
// desktop→mobile flash). No matchMedia (SSR/tests) → false, keeping the desktop layout as default.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = getMql(query);
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => getMql(query)?.matches ?? false, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// Layout boundary: below Tailwind's `md` (768px), so 767px matches the CSS `md:` boundary exactly.
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");

// Interaction modality (hover-to-reveal vs tap-to-toggle), not width: a wide touch device must still
// tap, or hover-driven popovers dismiss before they can be reached.
export const useHasHover = () => useMediaQuery("(hover: hover)");
