import type { ReactNode } from "react";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { EChart } from "./EChart";
import type { EChartsOption } from "./echarts-setup";

export interface StatsQueryState {
  data: unknown;
  dataUpdatedAt: number;
  error: unknown;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

function formatSyncTime(timestamp: number): string {
  return timestamp > 0
    ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "unknown";
}

// Background failures must not erase a useful cached snapshot. Tabs place this once above their
// content; charts and tables continue to render the query's retained data underneath it.
export function StatsQueryNotice({ queries }: { queries: StatsQueryState[] }) {
  const failed = queries.filter((query) => query.isError && query.data !== undefined);
  if (failed.length === 0) return null;
  const lastSuccess = Math.max(...failed.map((query) => query.dataUpdatedAt));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-warn/45 bg-warn/8 px-3 py-2 font-mono" role="status">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-warn">Cached analytics shown</div>
        <div className="text-[10px] text-text-muted">Refresh failed · last good sync {formatSyncTime(lastSuccess)}</div>
      </div>
      <button
        type="button"
        className="min-h-9 rounded-sm border border-warn/45 px-3 text-[10px] font-semibold uppercase tracking-wider text-warn hover:bg-warn/10"
        onClick={() => void Promise.allSettled(failed.map((query) => query.refetch()))}
      >
        Retry
      </button>
    </div>
  );
}

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
  if (values.length < 2) return <div className="stats-kpi-spacer mt-1.5 h-[20px]" />;
  const w = 120;
  const h = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 1 - ((v - min) / range) * (h - 2)}`)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="stats-kpi-spark mt-1.5" aria-hidden>
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
    <div className="stats-kpi-card rounded-sm border border-border bg-bg-surface px-2.5 py-2 md:px-3.5 md:py-3">
      <div className="flex items-center justify-between">
        <span className="stats-kpi-label font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted md:text-[10px]">{label}</span>
        {sublabel && <span className="stats-kpi-sublabel font-mono text-[9px] text-text-dim">{sublabel}</span>}
      </div>
      <div className="stats-kpi-value mt-0.5 font-mono text-lg font-bold tabular-nums text-text-bright md:text-2xl">{value}</div>
      {spark ? <Sparkline values={spark} color={accent} /> : <div className="stats-kpi-spacer mt-1 h-[14px] md:mt-1.5 md:h-[20px]" />}
    </div>
  );
}

function ChartState({
  title,
  subtitle,
  tone = "text-text-dim",
}: {
  title: string;
  subtitle: string;
  tone?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center font-mono">
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{title}</div>
      <div className="max-w-xs text-[10px] leading-relaxed text-text-dim">{subtitle}</div>
    </div>
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
  const showError = Boolean(isError && isEmpty !== false);
  return (
    <Card title={title} right={right} className={className}>
      <div style={{ height: resolvedHeight }}>
        {showError ? (
          <ChartState
            title="Chart data unavailable"
            subtitle="The stats endpoint did not respond. Try refreshing or changing the window."
            tone="text-danger"
          />
        ) : isLoading ? (
          <TerminalLoadingState label="QUERYING CHART" detail="PLEASE WAIT" className="h-full" />
        ) : isEmpty ? (
          <ChartState
            title="No matching telemetry"
            subtitle="This region and time window returned no series for the selected metric."
          />
        ) : (
          <EChart option={option} onEvents={onEvents} />
        )}
      </div>
    </Card>
  );
}
