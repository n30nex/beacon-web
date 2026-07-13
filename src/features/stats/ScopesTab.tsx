import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useChartColors } from "./chartTheme";
import { useStatsSummary } from "./useStats";
import { leaderboardOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard, StatsQueryNotice } from "./cards";
import { aggregatePresets, formatPreset } from "./transforms";
import type { StatsRange } from "./types";

export function ScopesTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const summary = useStatsSummary(range);

  const scopeRows = useMemo(
    () => [...(summary.data?.scopes ?? [])].sort((a, b) => b.packetCount - a.packetCount),
    [summary.data?.scopes],
  );
  const scopeChartRows = useMemo(
    () => scopeRows.slice(0, 10).map((s, i) => ({ name: s.name, value: s.packetCount, color: colors.series[i % colors.series.length] ?? colors.primary })),
    [scopeRows, colors],
  );
  const scopeOption = useMemo(() => leaderboardOption(scopeChartRows, colors, 126), [scopeChartRows, colors]);

  const presetRows = useMemo(
    () => aggregatePresets(summary.data?.radioPresets ?? []).slice(0, 10).map((r, i) => ({ name: formatPreset(r.preset), value: r.value, color: colors.series[i % colors.series.length] ?? colors.primary })),
    [summary.data?.radioPresets, colors],
  );
  const presetOption = useMemo(() => leaderboardOption(presetRows, colors, 150), [presetRows, colors]);

  const presetSourceRows = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const row of summary.data?.radioPresets ?? []) {
      bySource.set(row.sourceType, (bySource.get(row.sourceType) ?? 0) + row.count);
    }
    return [...bySource.entries()].map(([name, value], i) => ({ name, value, color: colors.series[i % colors.series.length] ?? colors.secondary }));
  }, [summary.data?.radioPresets, colors]);
  const presetSourceOption = useMemo(() => typeBarOption(presetSourceRows, colors), [presetSourceRows, colors]);

  const scopeTotals = useMemo(
    () => scopeRows.reduce((acc, row) => ({ packets: acc.packets + row.packetCount, observers: acc.observers + row.observerCount, nodes: acc.nodes + row.nodeCount }), { packets: 0, observers: 0, nodes: 0 }),
    [scopeRows],
  );

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <StatsQueryNotice queries={[summary]} />
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Scopes" sublabel="configured" accent="var(--color-primary)" value={summary.isLoading ? "--" : formatCount(scopeRows.length)} />
        <StatCard label="Scope packets" sublabel="all time" accent="var(--color-green)" value={summary.isLoading ? "--" : formatCount(scopeTotals.packets)} />
        <StatCard label="Scope observers" sublabel="all time" accent="var(--color-secondary)" value={summary.isLoading ? "--" : formatCount(scopeTotals.observers)} />
        <StatCard label="Radio presets" sublabel="current" accent="var(--color-warn)" value={summary.isLoading ? "--" : formatCount(presetRows.length)} />
      </div>

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="Scope packet distribution" height={230} option={scopeOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={scopeChartRows.length === 0} />
        <ChartCard title="Radio preset distribution" height={230} option={presetOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={presetRows.length === 0} />
        <ChartCard title="Preset sources" height={210} option={presetSourceOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={presetSourceRows.length === 0} />

        <Card title="Scope table">
          {summary.isLoading ? (
            <TerminalLoadingState label="QUERYING SCOPES" detail="PLEASE WAIT" />
          ) : summary.isError && !summary.data ? (
            <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
          ) : scopeRows.length === 0 ? (
            <div className="py-6 text-center font-mono text-[11px] text-text-dim">No scope activity</div>
          ) : (
            <>
            <div className="grid gap-2 md:hidden">
              {scopeRows.map((s) => (
                <div key={s.name} className="rounded-sm border border-border-subtle bg-bg-base/45 p-2 font-mono">
                  <div className="truncate text-xs font-semibold text-text-bright">{s.name}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div><div className="text-text-dim">Packets</div><div className={s.packetCount === 0 ? "text-text-dim" : "text-text-bright"}>{formatCount(s.packetCount)}</div></div>
                    <div><div className="text-text-dim">Observers</div><div className={s.observerCount === 0 ? "text-text-dim" : "text-text-normal"}>{formatCount(s.observerCount)}</div></div>
                    <div><div className="text-text-dim">Nodes</div><div className={s.nodeCount === 0 ? "text-text-dim" : "text-text-normal"}>{formatCount(s.nodeCount)}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[460px] w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-text-muted">
                    <th className="pb-1.5 text-left font-semibold uppercase tracking-wider">Scope</th>
                    <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Packets</th>
                    <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Observers</th>
                    <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Nodes</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeRows.map((s) => (
                    <tr key={s.name} className="border-t border-border-subtle">
                      <td className="py-1.5 text-left text-text-normal">{s.name}</td>
                      <td className={`py-1.5 text-right tabular-nums ${s.packetCount === 0 ? "text-text-dim" : "text-text-bright"}`}>{formatCount(s.packetCount)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${s.observerCount === 0 ? "text-text-dim" : "text-text-normal"}`}>{formatCount(s.observerCount)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${s.nodeCount === 0 ? "text-text-dim" : "text-text-normal"}`}>{formatCount(s.nodeCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
