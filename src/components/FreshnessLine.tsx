import { useEffect, useState } from "react";

interface FreshnessLineProps {
  source: string;
  updatedAt?: number | null;
  fetching?: boolean;
  className?: string;
}

function useFreshnessClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function formatFreshnessAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export function FreshnessLine({ source, updatedAt, fetching, className = "" }: FreshnessLineProps) {
  const hasTimestamp = Boolean(updatedAt);
  const clock = useFreshnessClock(hasTimestamp);
  const ageMs = updatedAt ? Math.max(0, clock - updatedAt) : null;
  const stale = ageMs != null && ageMs > 5 * 60_000;
  const tone = fetching ? "text-text-muted" : stale ? "text-warn" : "text-text-dim";
  const label = updatedAt
    ? fetching
      ? `${source} refreshing / last ${formatFreshnessAge(ageMs ?? 0)} ago`
      : `${source} refreshed ${formatFreshnessAge(ageMs ?? 0)} ago`
    : fetching
      ? `${source} querying`
      : `${source} no refresh timestamp`;

  return (
    <div role="status" aria-live="polite" className={`mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${tone} ${className}`}>
      <span className={`size-1.5 rounded-full ${fetching ? "bg-text-muted" : stale ? "bg-warn" : "bg-green"}`} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
