import { useEffect, useRef, useState } from "react";
import { formatExactCount } from "../../lib/formatters";
import "./live-metric.css";

type PulsePhase = "idle" | "a" | "b";

export interface LiveMetricValueProps {
  metric: string;
  value: number | null | undefined;
  pulseRevision?: number;
  pulseEnabled?: boolean;
  tone?: string;
  className?: string;
}

function canCompare(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function LiveMetricValue({
  metric,
  value,
  pulseRevision,
  pulseEnabled = true,
  tone,
  className,
}: LiveMetricValueProps) {
  const previousValue = useRef(value);
  const [pulsePhase, setPulsePhase] = useState<PulsePhase>("idle");

  useEffect(() => {
    const previous = previousValue.current;
    previousValue.current = value;

    if (pulseEnabled && canCompare(previous) && canCompare(value) && value > previous) {
      setPulsePhase((phase) => (phase === "a" ? "b" : "a"));
    }
  }, [pulseEnabled, pulseRevision, value]);

  return (
    <span
      className={["home-live-metric-value", tone, className].filter(Boolean).join(" ")}
      data-live-metric={metric}
      data-pulse-phase={pulsePhase}
      data-pulse-revision={pulseRevision}
    >
      {formatExactCount(value)}
    </span>
  );
}
