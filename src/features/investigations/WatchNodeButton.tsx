import { removeWatchlistNode, upsertWatchlistNode } from "./storage";
import { useWatchlist } from "./useLocalInvestigations";

export function WatchNodeButton({ publicKey, nodeId, label, compact = false }: { publicKey: string; nodeId?: string; label?: string; compact?: boolean }) {
  const [watchlist, refresh] = useWatchlist();
  const normalized = publicKey.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  const watched = watchlist.some((item) => item.publicKey === normalized);
  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? "Remove from My Nodes" : "Add to My Nodes"}
      title={watched ? "Remove from My Nodes" : "Add to My Nodes"}
      className={`${compact ? "h-11 w-11" : "min-h-11 px-3"} inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-mono text-[10px] font-semibold uppercase ${watched ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-text-muted hover:border-primary/40 hover:text-text-normal"}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (watched) removeWatchlistNode(normalized);
        else upsertWatchlistNode(normalized, nodeId, label);
        refresh();
      }}
    >
      <span aria-hidden="true">{watched ? "★" : "☆"}</span>
      {!compact && <span>{watched ? "My Node" : "Watch"}</span>}
    </button>
  );
}
