import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { IataChip } from "../../components/IataChip";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { useChartColors } from "./chartTheme";
import { leaderboardOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useStatsTopology } from "./useStats";
import type { StatsRange, StatsTopologyPath } from "./types";

function nodeLabel(name: string | null | undefined, fallback: string) {
  return sanitizeDisplayLabel(name, fallback.slice(0, 8));
}

function pathLabel(path: StatsTopologyPath) {
  return path.nodeNames.map((name, index) => nodeLabel(name, path.nodeIds[index] ?? String(index))).join(" -> ");
}

function RouteButton({ routeId }: { routeId: number }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      className="rounded border border-border-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
      onClick={() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", "Map");
          next.set("routeId", String(routeId));
          next.set("routeReplay", "1");
          return next;
        });
      }}
    >
      Map
    </button>
  );
}

export function TopologyTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const topology = useStatsTopology(range, 25);
  const data = topology.data;

  const hopRows = useMemo(
    () => (data?.hopBuckets ?? []).map((row, index) => ({ name: `${row.hopCount} hop`, value: row.routeCount, color: colors.series[index % colors.series.length] ?? colors.primary })),
    [data?.hopBuckets, colors],
  );
  const repeaterRows = useMemo(
    () =>
      (data?.topRepeaters ?? [])
        .slice(0, 12)
        .map((row, index) => ({ name: nodeLabel(row.nodeName, row.nodeId), value: row.observationCount, color: colors.series[index % colors.series.length] ?? colors.secondary })),
    [data?.topRepeaters, colors],
  );
  const hopOption = useMemo(() => typeBarOption(hopRows, colors), [hopRows, colors]);
  const repeaterOption = useMemo(() => leaderboardOption(repeaterRows, colors, 130), [repeaterRows, colors]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Routes" sublabel={range} accent="var(--color-primary)" value={topology.isLoading ? "--" : formatCount(data?.routeCount)} />
        <StatCard label="Route obs" sublabel="verified" accent="var(--color-secondary)" value={topology.isLoading ? "--" : formatCount(data?.observationCount)} />
        <StatCard label="IATAs" sublabel="with routes" accent="var(--color-green)" value={topology.isLoading ? "--" : formatCount(data?.activeIatas)} />
        <StatCard label="Avg hops" sublabel="known routes" accent="var(--color-warn)" value={topology.isLoading ? "--" : (data?.averageHopCount ?? 0).toFixed(1)} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={<>Hop distribution / {range}</>} height={230} option={hopOption} isLoading={topology.isLoading} isError={topology.isError} isEmpty={hopRows.length === 0} />
        <ChartCard title="Top verified-route nodes" height={230} option={repeaterOption} isLoading={topology.isLoading} isError={topology.isError} isEmpty={repeaterRows.length === 0} />
      </div>

      <Card title="Top adjacent pairs" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">verified only</span>}>
        {topology.isLoading ? (
          <TerminalLoadingState label="QUERYING TOPOLOGY PAIRS" detail="PLEASE WAIT" />
        ) : topology.isError ? (
          <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
        ) : (data?.topPairs ?? []).length === 0 ? (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">No verified route pairs in this window</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full font-mono text-[11px]">
              <thead>
                <tr className="text-text-muted">
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">From</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">To</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATA</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Routes</th>
                  <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
                  <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPairs ?? []).map((row) => (
                  <tr key={`${row.iata}:${row.fromNodeId}:${row.toNodeId}`} className="border-t border-border-subtle">
                    <td className="py-2 pr-3 text-primary">{nodeLabel(row.fromNodeName, row.fromNodeId)}</td>
                    <td className="py-2 pr-3 text-text-bright">{nodeLabel(row.toNodeName, row.toNodeId)}</td>
                    <td className="py-2">{row.iata && <IataChip>{row.iata}</IataChip>}</td>
                    <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.routeCount)}</td>
                    <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
                    <td className="py-2 text-text-muted">{formatAbsolute(row.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Best verified paths" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">route replay links</span>}>
        {topology.isLoading ? (
          <TerminalLoadingState label="QUERYING VERIFIED PATHS" detail="PLEASE WAIT" />
        ) : topology.isError ? (
          <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
        ) : (data?.bestPaths ?? []).length === 0 ? (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">No verified paths in this window</div>
        ) : (
          <div className="flex flex-col gap-2">
            {(data?.bestPaths ?? []).map((path) => (
              <div key={path.routeId} className="rounded border border-border-subtle bg-bg-base/45 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[12px] text-text-bright" title={pathLabel(path)}>{pathLabel(path)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      <IataChip>{path.iata}</IataChip>
                      <span>{path.hopCount} hops</span>
                      <span>{formatCount(path.observationCount)} obs</span>
                      <span>{formatAbsolute(path.lastSeen)}</span>
                    </div>
                  </div>
                  <RouteButton routeId={path.routeId} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
