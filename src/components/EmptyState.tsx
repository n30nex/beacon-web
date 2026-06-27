import { BeaconLogo } from "./BeaconLogo";

// shared empty/placeholder state: faint on-brand beacon mark + message

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  className?: string;
  diagnostic?: string;
  onAction?: () => void;
  role?: "status" | "alert";
  tone?: "neutral" | "info" | "warning" | "danger";
}

const toneClass = {
  neutral: "text-border",
  info: "text-primary",
  warning: "text-warn",
  danger: "text-danger",
};

export function EmptyState({
  actionLabel,
  className = "",
  diagnostic,
  onAction,
  role = "status",
  subtitle,
  title,
  tone = "neutral",
}: EmptyStateProps) {
  return (
    <div
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`flex flex-col items-center justify-center gap-3 flex-1 h-full min-h-[12rem] py-12 text-center select-none ${className}`}
      role={role}
    >
      <BeaconLogo size={36} className={toneClass[tone]} />
      <div className="flex max-w-md flex-col gap-1 px-4">
        <span className="text-text-muted text-sm font-mono tracking-wide">{title}</span>
        {subtitle && <span className="text-text-dim text-xs font-mono leading-relaxed">{subtitle}</span>}
        {diagnostic && <span className="text-text-dim/80 text-[10px] font-mono uppercase tracking-wider">{diagnostic}</span>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          className="min-h-9 rounded-sm border border-primary/45 bg-primary/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/15 hover:text-text-bright"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
