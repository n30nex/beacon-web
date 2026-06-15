import { useMemo } from "react";
import { IataChip } from "../../components/IataChip";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { useChartColors } from "./chartTheme";
import { bucketTimelineOption, leaderboardOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useStatsSubpaths } from "./useStats";
import type { StatsRange, StatsSubpathEndpointPair, StatsSubpathRow, StatsSubpaths } from "./types";

function nodeLabel(name: string | null | undefined, fallback: string) {
  return sanitizeDisplayLabel(name, fallback.slice(0, 8));
}

function pathLabel(path: StatsSubpathRow) {
  return path.nodeNames.map((name, index) => nodeLabel(name, path.nodeIds[index] ?? String(index))).join(" -> ");
}

function hopText(nodeCount: number) {
  const hops = Math.max(1, nodeCount - 1);
  return `${hops} hop${hops === 1 ? "" : "s"}`;
}

function endpointLabel(pair: StatsSubpathEndpointPair) {
  return `${nodeLabel(pair.fromNodeName, pair.fromNodeId)} -> ${nodeLabel(pair.toNodeName, pair.toNodeId)}`;
}

function endpointRange(pair: StatsSubpathEndpointPair) {
  const minHops = Math.max(1, pair.minNodeCount - 1);
  const maxHops = Math.max(minHops, pair.maxNodeCount - 1);
  return minHops === maxHops ? `${minHops} hops` : `${minHops}-${maxHops} hops`;
}

function iataList(iatas: string[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {iatas.slice(0, 5).map((iata) => <IataChip key={iata}>{iata}</IataChip>)}
      {iatas.length > 5 && <span className="font-mono text-[10px] text-text-dim">+{iatas.length - 5}</span>}
    </div>
  );
}

function TopSubpathsTable({ data }: { data?: StatsSubpaths }) {
  const rows = data?.topSubpaths ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING SUBPATHS" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No repeated verified subpaths in this window</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Subpath</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATAs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Length</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Routes</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs pressure</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.nodeIds.join(":")}:${row.lastSeen}`} className="border-t border-border-subtle">
              <td className="max-w-[380px] py-2 pr-3 text-primary">
                <div className="truncate" title={pathLabel(row)}>{pathLabel(row)}</div>
              </td>
              <td className="py-2 pr-3">{iataList(row.iatas)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{hopText(row.nodeCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.routeCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointPairsTable({ data }: { data?: StatsSubpaths }) {
  const rows = data?.topEndpointPairs ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING ENDPOINT PAIRS" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No endpoint-pair pressure in this window</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[820px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">From</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">To</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATAs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Span</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Routes</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.fromNodeId}:${row.toNodeId}`} className="border-t border-border-subtle">
              <td className="py-2 pr-3 text-primary">{nodeLabel(row.fromNodeName, row.fromNodeId)}</td>
              <td className="py-2 pr-3 text-text-bright">{nodeLabel(row.toNodeName, row.toNodeId)}</td>
              <td className="py-2 pr-3">{iataList(row.iatas)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{endpointRange(row)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.routeCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PathsTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const subpaths = useStatsSubpaths(range, 25);
  const data = subpaths.data;

  const lengthRows = useMemo(
    () => (data?.lengthBuckets ?? []).map((row, index) => ({ name: hopText(row.nodeCount), value: row.subpathCount, color: colors.series[index % colors.series.length] ?? colors.primary })),
    [data?.lengthBuckets, colors],
  );
  const timelineRows = useMemo(
    () => (data?.timeline ?? []).map((row) => ({ t: row.t, name: hopText(row.nodeCount), value: row.observationCount })),
    [data?.timeline],
  );
  const endpointRows = useMemo(
    () =>
      (data?.topEndpointPairs ?? [])
        .slice(0, 10)
        .map((row, index) => ({ name: endpointLabel(row), value: row.observationCount, color: colors.series[index % colors.series.length] ?? colors.secondary })),
    [data?.topEndpointPairs, colors],
  );

  const lengthOption = useMemo(() => typeBarOption(lengthRows, colors), [lengthRows, colors]);
  const timelineOption = useMemo(() => bucketTimelineOption(timelineRows, colors, { stacked: true, maxSeries: 6 }), [timelineRows, colors]);
  const endpointOption = useMemo(() => leaderboardOption(endpointRows, colors, 180), [endpointRows, colors]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Routes" sublabel={range} accent="var(--color-primary)" value={subpaths.isLoading ? "--" : formatCount(data?.routeCount)} />
        <StatCard label="Subpaths" sublabel="verified segments" accent="var(--color-secondary)" value={subpaths.isLoading ? "--" : formatCount(data?.subpathCount)} />
        <StatCard label="Unique" sublabel="route patterns" accent="var(--color-green)" value={subpaths.isLoading ? "--" : formatCount(data?.uniqueSubpathCount)} />
        <StatCard label="Avg span" sublabel="nodes/segment" accent="var(--color-warn)" value={subpaths.isLoading ? "--" : (data?.averageNodeCount ?? 0).toFixed(1)} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
        <ChartCard title={<>Segment length / {range}</>} height={230} option={lengthOption} isLoading={subpaths.isLoading} isError={subpaths.isError} isEmpty={lengthRows.length === 0} />
        <ChartCard title={<>Subpath pressure / {data?.window.bucket ?? ""}</>} height={230} option={timelineOption} isLoading={subpaths.isLoading} isError={subpaths.isError} isEmpty={timelineRows.length === 0} />
        <ChartCard title="Endpoint pressure" height={230} option={endpointOption} isLoading={subpaths.isLoading} isError={subpaths.isError} isEmpty={endpointRows.length === 0} />
      </div>

      <Card title="Top repeated subpaths" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">verified known routes only</span>}>
        {subpaths.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <TopSubpathsTable data={subpaths.isLoading ? undefined : data} />}
      </Card>

      <Card title="Top endpoint pairs" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">source to destination pressure</span>}>
        {subpaths.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <EndpointPairsTable data={subpaths.isLoading ? undefined : data} />}
      </Card>
    </div>
  );
}
