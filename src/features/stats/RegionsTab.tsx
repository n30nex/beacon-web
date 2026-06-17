import { useMemo, useState } from "react";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useChartColors } from "./chartTheme";
import { useStatsRegions } from "./useStats";
import { bucketTimelineOption, leaderboardOption } from "./chartOptions";
import { Card, ChartCard } from "./cards";
import type { StatsRange, StatsRegionRow } from "./types";

type SortKey = "observationCount" | "packetCount" | "activeObservers" | "activeNodes" | "lastHeard";

function valueOf(row: StatsRegionRow, key: SortKey): number {
  return row[key] ?? 0;
}

function DrillButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  );
}

interface RegionsTabProps {
  range: StatsRange;
  onDrill: (targetTab: string, iata?: string) => void;
}

export function RegionsTab({ range, onDrill }: RegionsTabProps) {
  const colors = useChartColors();
  const regions = useStatsRegions(range);
  const [sortKey, setSortKey] = useState<SortKey>("observationCount");

  const rows = useMemo(
    () => [...(regions.data?.items ?? [])].sort((a, b) => valueOf(b, sortKey) - valueOf(a, sortKey)),
    [regions.data?.items, sortKey],
  );

  const topIataRows = useMemo(
    () => rows.slice(0, 12).map((r, i) => ({ name: r.iata, value: r.observationCount, color: colors.series[i % colors.series.length] ?? colors.primary })),
    [rows, colors],
  );
  const topIataOption = useMemo(() => leaderboardOption(topIataRows, colors, 72), [topIataRows, colors]);

  const timelineRows = useMemo(
    () =>
      rows.slice(0, 8).flatMap((r) =>
        r.trend.map((p) => ({
          t: p.t,
          name: r.iata,
          value: p.observationCount,
        })),
      ),
    [rows],
  );
  const timelineOption = useMemo(() => bucketTimelineOption(timelineRows, colors, { maxSeries: 8 }), [timelineRows, colors]);

  const sortLabels: { key: SortKey; label: string }[] = [
    { key: "observationCount", label: "Obs" },
    { key: "packetCount", label: "Packets" },
    { key: "activeObservers", label: "Observers" },
    { key: "activeNodes", label: "Nodes" },
    { key: "lastHeard", label: "Last" },
  ];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={<>Regional observations · {range}</>} height={230} option={timelineOption} isLoading={regions.isLoading} isError={regions.isError} isEmpty={timelineRows.length === 0} />
        <ChartCard title="Top IATAs" height={230} option={topIataOption} isLoading={regions.isLoading} isError={regions.isError} isEmpty={topIataRows.length === 0} />
      </div>

      <Card
        title="IATA comparison"
        right={
          <div className="flex max-w-[60vw] gap-1 overflow-x-auto">
            {sortLabels.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                  sortKey === s.key ? "border-primary bg-primary/10 text-primary" : "border-border-subtle text-text-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      >
        {regions.isLoading ? (
          <TerminalLoadingState label="QUERYING REGIONS" detail="PLEASE WAIT" />
        ) : regions.isError ? (
          <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">No regional activity in this window</div>
        ) : (
          <>
          <div className="grid gap-2 md:hidden">
            {rows.map((r) => (
              <div key={r.iata} className="rounded-sm border border-border-subtle bg-bg-base/45 p-2 font-mono">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-text-bright">{r.iata}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">{r.lastHeard ? formatAbsolute(r.lastHeard) : "--"}</div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px]">
                  <div><div className="text-text-dim">Obs</div><div className="text-text-bright">{formatCount(r.observationCount)}</div></div>
                  <div><div className="text-text-dim">Pkts</div><div className="text-text-normal">{formatCount(r.packetCount)}</div></div>
                  <div><div className="text-text-dim">Obsrs</div><div className="text-text-normal">{formatCount(r.activeObservers)}</div></div>
                  <div><div className="text-text-dim">Nodes</div><div className="text-text-normal">{formatCount(r.activeNodes)}</div></div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-text-muted">
                  <div className="truncate">Payload: <span className="text-text-normal">{r.topPayloadTypeName || "--"}</span></div>
                  <div className="truncate">Route: <span className="text-text-normal">{r.topRouteTypeName || "--"}</span></div>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <DrillButton onClick={() => onDrill("Live", r.iata)}>Live</DrillButton>
                  <DrillButton onClick={() => onDrill("Map", r.iata)}>Map</DrillButton>
                  <DrillButton onClick={() => onDrill("Nodes", r.iata)}>Nodes</DrillButton>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[880px] w-full font-mono text-[11px]">
              <thead>
                <tr className="text-text-muted">
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATA</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Packets</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Observers</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Nodes</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">Top payload</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">Top route</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last heard</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Drill</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.iata} className="border-t border-border-subtle">
                    <td className="py-2 pr-3 text-text-bright">{r.iata}</td>
                    <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(r.observationCount)}</td>
                    <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(r.packetCount)}</td>
                    <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(r.activeObservers)}</td>
                    <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(r.activeNodes)}</td>
                    <td className="py-2 pl-3 text-text-normal">{r.topPayloadTypeName || "--"}</td>
                    <td className="py-2 text-text-normal">{r.topRouteTypeName || "--"}</td>
                    <td className="py-2 text-text-muted">{r.lastHeard ? formatAbsolute(r.lastHeard) : "--"}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1.5">
                        <DrillButton onClick={() => onDrill("Live", r.iata)}>Live</DrillButton>
                        <DrillButton onClick={() => onDrill("Map", r.iata)}>Map</DrillButton>
                        <DrillButton onClick={() => onDrill("Nodes", r.iata)}>Nodes</DrillButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
