import { EmptyState } from "./EmptyState";
import type { QueryStateCopy } from "../lib/query-state";

interface QueryStatePanelProps extends QueryStateCopy {
  className?: string;
  onAction?: () => void;
}

export function QueryStatePanel({
  actionLabel,
  className,
  diagnostic,
  kind,
  onAction,
  subtitle,
  title,
  tone,
}: QueryStatePanelProps) {
  const urgent = kind === "degraded" || kind === "rate-limited" || kind === "error";
  return (
    <EmptyState
      actionLabel={actionLabel}
      className={className}
      diagnostic={diagnostic}
      onAction={onAction}
      role={urgent ? "alert" : "status"}
      subtitle={subtitle}
      title={title}
      tone={tone}
    />
  );
}
