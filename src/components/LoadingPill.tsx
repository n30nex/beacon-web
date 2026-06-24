import { useEffect, useState } from "react";
import { TerminalCursor, TerminalProgress, TerminalSpinner } from "./TerminalLoader";

interface LoadingPillProps {
  loading: boolean;
  error?: boolean;
  count: number; // rows loaded so far
  noun: string; // plural entity name, e.g. "nodes" / "observers"
  position?: string; // corner placement (the parent must be `relative`)
  showFreshness?: boolean;
  updatedAt?: number | null;
  now?: number;
}

function useClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

// Small floating terminal status pill shared by maps and entity tables while pages stream in.
// Renders nothing when idle unless a caller opts into the compact freshness readout.
export function LoadingPill({
  loading,
  error,
  count,
  noun,
  position = "bottom-3 left-3",
  showFreshness,
  updatedAt,
  now,
}: LoadingPillProps) {
  const clock = useClock(Boolean(showFreshness && !loading && !error && !now));
  const currentNow = now ?? clock;
  const showIdleFreshness = Boolean(showFreshness && !loading && !error);
  if (!loading && !error && !showIdleFreshness) return null;

  const ageMs = updatedAt ? Math.max(0, currentNow - updatedAt) : null;
  const stale = ageMs != null && ageMs > 5 * 60_000;
  const tone = loading ? "text-text-muted" : error ? "text-danger" : stale ? "text-warn" : "text-text-dim";
  const label = loading
    ? `QUERYING ${noun.toUpperCase()}... (${count})`
    : error
      ? count > 0
        ? `Some ${noun} failed to load (${count} shown)`
        : `Failed to load ${noun}`
      : updatedAt
        ? `${count} ${noun} loaded / refreshed ${formatAge(ageMs ?? 0)} ago`
        : `${count} ${noun} loaded / no refresh timestamp`;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`loading-pill absolute ${position} z-10 flex max-w-[calc(100vw-1rem)] flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 font-mono text-[11px] shadow-lg ${tone}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {loading ? (
          <TerminalSpinner />
        ) : error ? (
          <span className="size-1.5 rounded-full bg-danger" aria-hidden />
        ) : (
          <span className={`size-1.5 rounded-full ${stale ? "bg-warn" : "bg-green"}`} aria-hidden />
        )}
        <span className="truncate uppercase tracking-[0.08em]">{label}</span>
        {loading && <TerminalCursor />}
      </span>
      {loading && <TerminalProgress className="loading-pill-progress" />}
    </div>
  );
}
