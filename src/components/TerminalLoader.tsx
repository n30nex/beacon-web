import type { ReactNode } from "react";

type TerminalTone = "loading" | "waiting" | "degraded" | "ready";

const TONE_CLASS: Record<TerminalTone, string> = {
  loading: "text-primary",
  waiting: "text-text-muted",
  degraded: "text-warn",
  ready: "text-green",
};

interface TerminalSpinnerProps {
  className?: string;
}

export function TerminalSpinner({ className = "" }: TerminalSpinnerProps) {
  return (
    <span className={`terminal-spinner ${className}`} aria-hidden="true">
      <span>/</span>
      <span>-</span>
      <span>{"\\"}</span>
      <span>|</span>
    </span>
  );
}

export function TerminalCursor({ className = "" }: { className?: string }) {
  return <span className={`terminal-cursor ${className}`} aria-hidden="true" />;
}

export function TerminalProgress({ value, className = "" }: { value?: number; className?: string }) {
  const width = value == null ? undefined : `${Math.max(0, Math.min(100, value))}%`;
  return (
    <span className={`terminal-progress ${className}`} aria-hidden="true">
      <span className="terminal-progress-fill" style={width ? { width } : undefined} />
    </span>
  );
}

interface TerminalLoadingStateProps {
  label?: ReactNode;
  detail?: ReactNode;
  tone?: TerminalTone;
  compact?: boolean;
  className?: string;
}

export function TerminalLoadingState({
  label = "QUERYING DATA",
  detail = "PLEASE WAIT",
  tone = "loading",
  compact = false,
  className = "",
}: TerminalLoadingStateProps) {
  const toneClass = TONE_CLASS[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`terminal-loading-state ${compact ? "terminal-loading-state-compact" : ""} ${toneClass} ${className}`}
    >
      <div className="terminal-loading-line">
        <TerminalSpinner />
        <span className="terminal-loading-label">{label}</span>
        <TerminalCursor />
      </div>
      {!compact && detail && <div className="terminal-loading-detail">{detail}</div>}
      {!compact && <TerminalProgress />}
    </div>
  );
}

export function TerminalSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="terminal-skeleton-rows" role="status" aria-live="polite" aria-label="QUERYING ROWS">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="terminal-skeleton-row" style={{ animationDelay: `${i * 85}ms` }}>
          <span className="terminal-skeleton-prompt">{String(i + 1).padStart(2, "0")}</span>
          <span className="terminal-skeleton-bar" style={{ width: `${88 - (i % 4) * 12}%` }} />
          <TerminalCursor className={i === 0 ? "" : "opacity-0"} />
        </div>
      ))}
    </div>
  );
}
