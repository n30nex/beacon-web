import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useChartColors } from "./chartTheme";
import { useStatsRFHealth } from "./useStats";
import { leaderboardOption, rfMetricOption } from "./chartOptions";
import { Card, ChartCard, StatCard, StatsQueryNotice } from "./cards";
import type { StatsObserverHealth, StatsRange } from "./types";

function FlagPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span className={`rounded border px-1.5 py-px text-[9px] uppercase tracking-wider ${active ? "border-danger/50 bg-danger/10 text-danger" : "border-border-subtle text-text-dim"}`}>
      {label}
    </span>
  );
}

function OffenderRow({ item, onSelectObserver }: { item: StatsObserverHealth; onSelectObserver: (id: string) => void }) {
  const label = sanitizeDisplayLabel(item.displayName, item.observerId.slice(0, 8));
  const flags = [
    ["stale", item.flags.stale],
    ["batt", item.flags.lowBattery],
    ["noise", item.flags.highNoise],
    ["air", item.flags.highAirtime],
    ["queue", item.flags.queueBacklog],
    ["err", item.flags.receiveErrors],
    ["no tel", item.flags.noTelemetry],
  ] as const;
  return (
    <button
      type="button"
      onClick={() => onSelectObserver(item.observerId)}
      className="w-full border-t border-border-subtle px-1 py-2 text-left transition-colors hover:bg-primary/6"
    >
      <div className="flex items-center justify-between gap-3 font-mono">
        <div className="min-w-0">
          <div className="truncate text-[12px] text-text-bright">{label}</div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">{item.iata || "UNKNOWN"} · {item.status}</div>
        </div>
        <div className={`shrink-0 text-lg font-bold tabular-nums ${item.healthScore < 60 ? "text-danger" : item.healthScore < 80 ? "text-warn" : "text-green"}`}>
          {item.healthScore}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 font-mono">
        {flags.filter(([, active]) => active).map(([flag]) => (
          <FlagPill key={flag} label={flag} active />
        ))}
      </div>
    </button>
  );
}

export function RFHealthTab({ range, onSelectObserver }: { range: StatsRange; onSelectObserver: (observerId: string) => void }) {
  const colors = useChartColors();
  const rf = useStatsRFHealth(range);
  const summary = rf.data?.summary;

  const iataRows = useMemo(
    () => (rf.data?.byIata ?? []).map((r, i) => ({ name: r.iata, value: Math.max(0, 100 - r.healthScore), color: colors.series[i % colors.series.length] ?? colors.danger })),
    [rf.data?.byIata, colors],
  );
  const iataOption = useMemo(() => leaderboardOption(iataRows, colors, 74), [iataRows, colors]);
  const noiseOption = useMemo(
    () => rfMetricOption((rf.data?.series ?? []).map((p) => ({ t: p.t, iata: p.iata, value: p.noiseFloorDb ?? null })), colors, "Noise floor"),
    [rf.data?.series, colors],
  );
  const airtimeOption = useMemo(
    () => rfMetricOption((rf.data?.series ?? []).map((p) => ({ t: p.t, iata: p.iata, value: Math.max(p.airtimeTxPct ?? 0, p.airtimeRxPct ?? 0) || null })), colors, "Airtime"),
    [rf.data?.series, colors],
  );
  const queueOption = useMemo(
    () => rfMetricOption((rf.data?.series ?? []).map((p) => ({ t: p.t, iata: p.iata, value: p.queueLength ?? null })), colors, "Queue"),
    [rf.data?.series, colors],
  );
  const errorsOption = useMemo(
    () => rfMetricOption((rf.data?.series ?? []).map((p) => ({ t: p.t, iata: p.iata, value: p.receiveErrors ?? null })), colors, "Receive errors"),
    [rf.data?.series, colors],
  );

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <StatsQueryNotice queries={[rf]} />
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Observers" sublabel={range} accent="var(--color-primary)" value={rf.isLoading ? "--" : formatCount(summary?.totalObservers)} />
        <StatCard label="Stale" sublabel="offline/freshness" accent="var(--color-warn)" value={rf.isLoading ? "--" : formatCount(summary?.staleObservers)} />
        <StatCard label="RF degraded" sublabel="noise/air/queue" accent="var(--color-danger)" value={rf.isLoading ? "--" : formatCount((summary?.highNoise ?? 0) + (summary?.highAirtime ?? 0) + (summary?.queueBacklog ?? 0))} />
        <StatCard label="No telemetry" sublabel="status only" accent="var(--color-secondary)" value={rf.isLoading ? "--" : formatCount(summary?.noTelemetry)} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <ChartCard title="IATA degradation score" height={220} option={iataOption} isLoading={rf.isLoading} isError={rf.isError} isEmpty={iataRows.length === 0} />
          <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <ChartCard title="Noise floor" height={190} option={noiseOption} isLoading={rf.isLoading} isError={rf.isError} isEmpty={(rf.data?.series ?? []).length === 0} />
            <ChartCard title="Airtime pressure" height={190} option={airtimeOption} isLoading={rf.isLoading} isError={rf.isError} isEmpty={(rf.data?.series ?? []).length === 0} />
            <ChartCard title="Queue backlog" height={190} option={queueOption} isLoading={rf.isLoading} isError={rf.isError} isEmpty={(rf.data?.series ?? []).length === 0} />
            <ChartCard title="Receive errors" height={190} option={errorsOption} isLoading={rf.isLoading} isError={rf.isError} isEmpty={(rf.data?.series ?? []).length === 0} />
          </div>
        </div>

        <Card title="Top offenders">
          {rf.isLoading ? (
            <TerminalLoadingState label="QUERYING RF HEALTH" detail="PLEASE WAIT" />
          ) : rf.isError && !rf.data ? (
            <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
          ) : (rf.data?.topOffenders ?? []).length === 0 ? (
            <div className="py-6 text-center font-mono text-[11px] text-text-dim">No degraded observers</div>
          ) : (
            <div className="-mt-2">
              {(rf.data?.topOffenders ?? []).map((item) => (
                <OffenderRow key={item.observerId} item={item} onSelectObserver={onSelectObserver} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
