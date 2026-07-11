import { useCallback, useEffect, useState } from "react";
import { readSavedInvestigations, readWatchlist, type SavedInvestigationV1, type WatchlistV1 } from "./storage";

function useLocalState<T>(key: string, read: () => T): [T, () => void] {
  const [value, setValue] = useState(read);
  const refresh = useCallback(() => setValue(read()), [read]);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === key) refresh();
    };
    window.addEventListener("beacon-local-state", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("beacon-local-state", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [key, refresh]);
  return [value, refresh];
}

export function useSavedInvestigations(): [SavedInvestigationV1[], () => void] {
  return useLocalState("beacon.saved-investigations.v1", readSavedInvestigations);
}

export function useWatchlist(): [WatchlistV1[], () => void] {
  return useLocalState("beacon.watchlist.v1", readWatchlist);
}
