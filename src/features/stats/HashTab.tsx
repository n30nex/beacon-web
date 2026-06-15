import { useMemo } from "react";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useChartColors } from "./chartTheme";
import { bucketTimelineOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useStatsHashAnalytics } from "./useStats";
import type { StatsHashAnalytics, StatsRange } from "./types";

function pct(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function shortHash(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash;
}

function RiskTable({ data }: { data?: StatsHashAnalytics }) {
  const rows = data?.riskyPrefixes ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING HASH PREFIXES" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No risky prefixes in this window</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Prefix</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Size</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATA</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Packets</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Observers</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last heard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.iata}:${row.hashSize}:${row.prefix}`} className="border-t border-border-subtle">
              <td className="py-2 pr-3 text-primary">{row.prefix}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{row.hashSize}b</td>
              <td className="py-2 pl-3 text-text-bright">{row.iata}</td>
              <td className="py-2 text-right tabular-nums text-warn">{formatCount(row.packetCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.observerCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastHeard)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InconsistentTable({ data }: { data?: StatsHashAnalytics }) {
  const rows = data?.inconsistentPacketSamples ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING INCONSISTENT HASHES" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No inconsistent packet hash sizes in this window</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Packet</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Sizes</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATAs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last heard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.packetHash} className="border-t border-border-subtle">
              <td className="py-2 pr-3 text-primary" title={row.packetHash}>{shortHash(row.packetHash)}</td>
              <td className="py-2 text-text-normal">{row.hashSizes.map((size) => `${size}b`).join(" / ")}</td>
              <td className="py-2 text-text-normal">{row.iatas.join(", ")}</td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastHeard)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HashTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const hashes = useStatsHashAnalytics(range, 25);
  const data = hashes.data;

  const sizeRows = useMemo(
    () => (data?.sizeMix ?? []).map((row, index) => ({ name: `${row.hashSize} byte`, value: row.observationCount, color: colors.series[index % colors.series.length] ?? colors.primary })),
    [data?.sizeMix, colors],
  );
  const timelineRows = useMemo(
    () => (data?.timeline ?? []).map((row) => ({ t: row.t, name: `${row.hashSize} byte`, value: row.observationCount })),
    [data?.timeline],
  );
  const sizeOption = useMemo(() => typeBarOption(sizeRows, colors), [sizeRows, colors]);
  const timelineOption = useMemo(() => bucketTimelineOption(timelineRows, colors, { stacked: true, maxSeries: 6 }), [timelineRows, colors]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Hash obs" sublabel={range} accent="var(--color-primary)" value={hashes.isLoading ? "--" : formatCount(data?.totalObservations)} />
        <StatCard label="Multibyte" sublabel={hashes.isLoading ? "observations" : pct(data?.multibyteObservations ?? 0, data?.totalObservations ?? 0)} accent="var(--color-green)" value={hashes.isLoading ? "--" : formatCount(data?.multibyteObservations)} />
        <StatCard label="Risk prefixes" sublabel="multi-packet" accent="var(--color-warn)" value={hashes.isLoading ? "--" : formatCount(data?.collisionPrefixCount)} />
        <StatCard label="Inconsistent" sublabel="packet sizes" accent="var(--color-danger)" value={hashes.isLoading ? "--" : formatCount(data?.inconsistentPacketCount)} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={<>Hash size mix / {range}</>} height={230} option={sizeOption} isLoading={hashes.isLoading} isError={hashes.isError} isEmpty={sizeRows.length === 0} />
        <ChartCard title={<>Hash size timeline / {data?.window.bucket ?? ""}</>} height={230} option={timelineOption} isLoading={hashes.isLoading} isError={hashes.isError} isEmpty={timelineRows.length === 0} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Card title="Risky prefixes" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">top 25</span>}>
          {hashes.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <RiskTable data={hashes.isLoading ? undefined : data} />}
        </Card>
        <Card title="Inconsistent packet hash sizes" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">top 25</span>}>
          {hashes.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <InconsistentTable data={hashes.isLoading ? undefined : data} />}
        </Card>
      </div>
    </div>
  );
}
