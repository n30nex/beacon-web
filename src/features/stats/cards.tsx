import type { ReactNode } from "react";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { EChart } from "./EChart";
import type { EChartsOption } from "./echarts-setup";

// Titled surface card matching the app's panel language.
export function Card({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-sm border border-border bg-bg-surface p-2.5 md:p-3.5 ${className ?? ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2 md:mb-2.5">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="mt-1.5 h-[20px]" />;
  const w = 120;
  const h = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 1 - ((v - min) / range) * (h - 2)}`)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1.5" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

// KPI tile: label, big mono value, optional sparkline + sub-label.
export function StatCard({
  label,
  value,
  accent,
  spark,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  accent: string; // CSS color for the sparkline, e.g. "var(--color-primary)"
  spark?: number[];
  sublabel?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-bg-surface px-2.5 py-2 md:px-3.5 md:py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted md:text-[10px]">{label}</span>
        {sublabel && <span className="font-mono text-[9px] text-text-dim">{sublabel}</span>}
      </div>
      <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-text-bright md:text-2xl">{value}</div>
      {spark ? <Sparkline values={spark} color={accent} /> : <div className="mt-1 h-[14px] md:mt-1.5 md:h-[20px]" />}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-dim">{children}</div>
  );
}

// Card whose body is a fixed-height ECharts chart, with loading/empty/error states.
export function ChartCard({
  title,
  right,
  height = 200,
  option,
  isLoading,
  isEmpty,
  isError,
  onEvents,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  height?: number;
  option: EChartsOption;
  isLoading?: boolean;
  isEmpty?: boolean;
  isError?: boolean;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const resolvedHeight = isMobile ? Math.min(220, Math.max(180, height)) : height;
  return (
    <Card title={title} right={right} className={className}>
      <div style={{ height: resolvedHeight }}>
        {isError ? (
          <Centered>Failed to load</Centered>
        ) : isLoading ? (
          <TerminalLoadingState label="QUERYING CHART" detail="PLEASE WAIT" className="h-full" />
        ) : isEmpty ? (
          <Centered>No data</Centered>
        ) : (
          <EChart option={option} onEvents={onEvents} />
        )}
      </div>
    </Card>
  );
}
