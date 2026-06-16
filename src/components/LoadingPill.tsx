import { TerminalCursor, TerminalProgress, TerminalSpinner } from "./TerminalLoader";

interface LoadingPillProps {
  loading: boolean;
  error?: boolean;
  count: number; // rows loaded so far
  noun: string; // plural entity name, e.g. "nodes" / "observers"
  position?: string; // corner placement (the parent must be `relative`)
}

// Small floating terminal status pill shared by maps and entity tables while pages stream in.
// Renders nothing when idle.
export function LoadingPill({ loading, error, count, noun, position = "bottom-3 left-3" }: LoadingPillProps) {
  if (!loading && !error) return null;
  const tone = loading ? "text-text-muted" : "text-danger";
  const label = loading
    ? `QUERYING ${noun.toUpperCase()}... (${count})`
    : count > 0
      ? `Some ${noun} failed to load (${count} shown)`
      : `Failed to load ${noun}`;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`loading-pill absolute ${position} z-10 flex max-w-[calc(100vw-1rem)] flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 font-mono text-[11px] shadow-lg ${tone}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {loading ? <TerminalSpinner /> : <span className="size-1.5 rounded-full bg-danger" aria-hidden />}
        <span className="truncate uppercase tracking-[0.08em]">{label}</span>
        {loading && <TerminalCursor />}
      </span>
      {loading && <TerminalProgress className="loading-pill-progress" />}
    </div>
  );
}
