import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IataChip } from "../../components/IataChip";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useChartColors } from "./chartTheme";
import { bucketTimelineOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useStatsHashAnalytics, useStatsHashPrefixLookup } from "./useStats";
import type { StatsHashAnalytics, StatsHashPrefixLookup, StatsRange } from "./types";

function pct(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function shortHash(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash;
}

function normalizePrefix(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

function isValidPrefix(value: string, hashSize?: number) {
  const prefix = normalizePrefix(value);
  return /^[0-9a-f]{1,8}$/.test(prefix) && (!hashSize || prefix.length <= hashSize * 2);
}

function iataChips(iatas: string[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {iatas.slice(0, 5).map((iata) => <IataChip key={iata}>{iata}</IataChip>)}
      {iatas.length > 5 && <span className="font-mono text-[10px] text-text-dim">+{iatas.length - 5}</span>}
    </div>
  );
}

function PacketButton({ packetHash, onOpen }: { packetHash: string; onOpen: (hash: string) => void }) {
  return (
    <button
      type="button"
      className="max-w-[150px] truncate rounded border border-border-subtle px-2 py-1 text-left font-mono text-[10px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10"
      title={packetHash}
      onClick={() => onOpen(packetHash)}
    >
      {shortHash(packetHash)}
    </button>
  );
}

function RiskTable({ data, onLookup }: { data?: StatsHashAnalytics; onLookup: (prefix: string, hashSize: number) => void }) {
  const rows = data?.riskyPrefixes ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING HASH PREFIXES" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No risky prefixes in this window</div>;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <button
            key={`${row.iata}:${row.hashSize}:${row.prefix}:mobile`}
            type="button"
            className="w-full rounded border border-border-subtle bg-bg-base/55 p-2 text-left font-mono transition-colors hover:border-primary/60 hover:bg-primary/8"
            onClick={() => onLookup(row.prefix, row.hashSize)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-primary">{row.prefix}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-dim">{row.hashSize}b / {row.iata}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
              <span><span className="text-text-dim">Nodes </span><span className="text-warn">{formatCount(row.nodeCount ?? row.packetCount)}</span></span>
              <span><span className="text-text-dim">Obs </span><span className="text-text-bright">{formatCount(row.observationCount)}</span></span>
              <span className="truncate text-text-muted">{formatAbsolute(row.lastHeard)}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[720px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Prefix</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Size</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATA</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Nodes</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Prefix hits</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last heard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.iata}:${row.hashSize}:${row.prefix}`} className="border-t border-border-subtle">
              <td className="py-2 pr-3">
                <button
                  type="button"
                  className="rounded border border-transparent px-1 py-0.5 font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10"
                  onClick={() => onLookup(row.prefix, row.hashSize)}
                >
                  {row.prefix}
                </button>
              </td>
              <td className="py-2 text-right tabular-nums text-text-normal">{row.hashSize}b</td>
              <td className="py-2 pl-3 text-text-bright">{row.iata}</td>
              <td className="py-2 text-right tabular-nums text-warn">{formatCount(row.nodeCount ?? row.packetCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.packetCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastHeard)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function CollisionMatrix({ data, onLookup }: { data?: StatsHashAnalytics; onLookup: (prefix: string, hashSize: number) => void }) {
  if (!data) return <TerminalLoadingState label="QUERYING COLLISION MATRIX" detail="PLEASE WAIT" />;
  const cells = data.collisionMatrix ?? [];
  if (cells.length === 0) return <div className="py-7 text-center font-mono text-[11px] text-text-dim">No collision-risk cells in this window</div>;

  const iataTotals = new Map<string, number>();
  const sizeTotals = new Map<number, number>();
  const cellByKey = new Map<string, (typeof cells)[number]>();
  for (const cell of cells) {
    iataTotals.set(cell.iata, (iataTotals.get(cell.iata) ?? 0) + cell.prefixCount);
    sizeTotals.set(cell.hashSize, (sizeTotals.get(cell.hashSize) ?? 0) + cell.prefixCount);
    cellByKey.set(`${cell.hashSize}:${cell.iata}`, cell);
  }
  const iatas = [...iataTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([iata]) => iata);
  const sizes = [...sizeTotals.keys()].sort((a, b) => a - b);
  const maxPrefixes = Math.max(1, ...cells.map((cell) => cell.prefixCount));
  const topPrefixByKey = new Map<string, StatsHashAnalytics["riskyPrefixes"][number]>();
  for (const row of data.riskyPrefixes ?? []) {
    const key = `${row.hashSize}:${row.iata}`;
    const current = topPrefixByKey.get(key);
    if (!current || row.packetCount > current.packetCount || (row.packetCount === current.packetCount && row.observationCount > current.observationCount)) {
      topPrefixByKey.set(key, row);
    }
  }

  const mobileRows = [...(data.riskyPrefixes ?? [])]
    .sort((a, b) => b.observationCount - a.observationCount || b.packetCount - a.packetCount)
    .slice(0, 12);

  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {mobileRows.map((row) => (
          <button
            key={`${row.iata}:${row.hashSize}:${row.prefix}:matrix-mobile`}
            type="button"
            className="rounded border border-border-subtle bg-bg-base/55 p-2 text-left font-mono transition-colors hover:border-primary/60 hover:bg-primary/8"
            onClick={() => onLookup(row.prefix, row.hashSize)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-warn">{row.prefix}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-dim">{row.iata} / {row.hashSize} byte</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
              <span className="text-text-muted">{formatCount(row.packetCount)} prefix hits</span>
              <span className="text-text-bright">{formatCount(row.observationCount)} obs</span>
            </div>
          </button>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <div
        className="grid min-w-[640px] gap-1 font-mono text-[10px]"
        style={{ gridTemplateColumns: `84px repeat(${iatas.length}, minmax(70px, 1fr))` }}
      >
        <div className="rounded border border-border-subtle bg-bg-base/70 px-2 py-1.5 font-semibold uppercase tracking-wider text-text-dim">Size</div>
        {iatas.map((iata) => (
          <div key={iata} className="rounded border border-border-subtle bg-bg-base/70 px-2 py-1.5 text-center font-semibold text-text-normal">
            {iata}
          </div>
        ))}
        {sizes.map((size) => (
          <div key={size} className="contents">
            <div className="rounded border border-border-subtle bg-bg-base/70 px-2 py-2 font-semibold text-text-bright">
              {size} byte
            </div>
            {iatas.map((iata) => {
              const key = `${size}:${iata}`;
              const cell = cellByKey.get(key);
              const topPrefix = topPrefixByKey.get(key);
              const strength = cell ? Math.max(0.16, Math.min(0.82, cell.prefixCount / maxPrefixes)) : 0;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!topPrefix}
                  className="min-h-[62px] rounded border px-2 py-1.5 text-left transition-colors disabled:cursor-default disabled:border-border-subtle disabled:bg-bg-base/35"
                  style={
                    cell
                      ? {
                          backgroundColor: `rgba(255, 176, 0, ${0.06 + strength * 0.24})`,
                          borderColor: `rgba(255, 176, 0, ${0.24 + strength * 0.48})`,
                          boxShadow: `inset 0 0 ${Math.round(10 + strength * 18)}px rgba(255, 176, 0, ${0.08 + strength * 0.16})`,
                        }
                      : undefined
                  }
                  title={
                    cell
                      ? `${iata} / ${size} byte: ${cell.prefixCount} risky prefixes, ${cell.nodeCount ?? cell.packetCount} nodes, ${cell.observationCount} observations`
                      : `${iata} / ${size} byte: no risky prefixes`
                  }
                  onClick={() => {
                    if (topPrefix) onLookup(topPrefix.prefix, topPrefix.hashSize);
                  }}
                >
                  {cell ? (
                    <div className="flex h-full flex-col justify-between gap-1">
                      <div className="text-[15px] font-bold leading-none tabular-nums text-warn">{formatCount(cell.prefixCount)}</div>
                      <div className="text-[9px] uppercase tracking-wider text-text-dim">prefixes</div>
                      <div className="flex items-center justify-between gap-2 text-[9px] text-text-muted">
                        <span>{formatCount(cell.nodeCount ?? cell.packetCount)} nodes</span>
                        <span>{formatCount(cell.observationCount)} obs</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-text-dim">.</div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </>
  );
}

function PrefixLookupPanel({
  data,
  isError,
  isLoading,
  onOpenPacket,
  prefix,
}: {
  data?: StatsHashPrefixLookup;
  isError: boolean;
  isLoading: boolean;
  onOpenPacket: (hash: string) => void;
  prefix: string;
}) {
  if (!prefix) {
    return <div className="py-7 text-center font-mono text-[11px] uppercase tracking-wider text-text-dim">Enter a path-hash prefix or click a risky prefix</div>;
  }
  if (isError) {
    return <div className="py-7 text-center font-mono text-[11px] text-danger">Failed to load prefix lookup</div>;
  }
  if (isLoading || !data) {
    return <TerminalLoadingState label="QUERYING PREFIX LOOKUP" detail="PLEASE WAIT" />;
  }
  if (data.items.length === 0) {
    return <div className="py-7 text-center font-mono text-[11px] text-text-dim">No packet hop hashes matched `{data.prefix}` in this window</div>;
  }
  return (
    <div className="space-y-3">
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-border-subtle bg-bg-base/50 p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">Packets</div>
          <div className="font-mono text-lg font-semibold text-text-bright">{formatCount(data.packetCount)}</div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/50 p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">Hop matches</div>
          <div className="font-mono text-lg font-semibold text-primary">{formatCount(data.matchCount)}</div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/50 p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">Observers</div>
          <div className="font-mono text-lg font-semibold text-text-bright">{formatCount(data.observerCount)}</div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/50 p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">IATAs</div>
          <div className="mt-1">{iataChips(data.iatas)}</div>
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {data.items.map((row) => (
          <div key={`${row.packetHash}:${row.pathHash}:${row.hopIndex}:mobile`} className="rounded border border-border-subtle bg-bg-base/55 p-2 font-mono">
            <div className="flex items-center justify-between gap-2">
              <PacketButton packetHash={row.packetHash} onOpen={onOpenPacket} />
              <span className="text-[10px] uppercase tracking-wider text-text-dim">hop {row.hopIndex + 1}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-primary">{row.pathHash}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
              <span>{row.payloadTypeName}</span>
              <span>{row.routeTypeName}</span>
              <span>{formatCount(row.observationCount)} obs</span>
              <span>{formatCount(row.observerCount)} observers</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {iataChips(row.iatas)}
              <span className="shrink-0 text-[10px] text-text-dim">{formatAbsolute(row.lastHeard)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[980px] w-full font-mono text-[11px]">
          <thead>
            <tr className="text-text-muted">
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Packet</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Path hash</th>
              <th className="pb-2 text-right font-semibold uppercase tracking-wider">Hop</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Payload</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Route</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATAs</th>
              <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
              <th className="pb-2 text-right font-semibold uppercase tracking-wider">Observers</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Latest observer</th>
              <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last heard</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={`${row.packetHash}:${row.pathHash}:${row.hopIndex}`} className="border-t border-border-subtle">
                <td className="py-2 pr-3"><PacketButton packetHash={row.packetHash} onOpen={onOpenPacket} /></td>
                <td className="py-2 pr-3 text-primary">{row.pathHash}</td>
                <td className="py-2 text-right tabular-nums text-text-normal">{row.hopIndex + 1}</td>
                <td className="py-2 pl-3 text-text-normal">{row.payloadTypeName}</td>
                <td className="py-2 text-text-normal">{row.routeTypeName}</td>
                <td className="py-2">{iataChips(row.iatas)}</td>
                <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
                <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.observerCount)}</td>
                <td className="max-w-[150px] truncate py-2 text-text-muted" title={row.latestObserver ?? row.latestObserverId ?? ""}>{row.latestObserver ?? row.latestObserverId?.slice(0, 8) ?? "-"}</td>
                <td className="py-2 text-text-muted">{formatAbsolute(row.lastHeard)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InconsistentTable({ data }: { data?: StatsHashAnalytics }) {
  const rows = data?.inconsistentPacketSamples ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING INCONSISTENT HASHES" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No inconsistent packet hash sizes in this window</div>;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div key={`${row.packetHash}:mobile`} className="rounded border border-border-subtle bg-bg-base/55 p-2 font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-primary" title={row.packetHash}>{shortHash(row.packetHash)}</span>
              <span className="text-[10px] text-text-dim">{formatAbsolute(row.lastHeard)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
              <span className="text-text-normal">{row.hashSizes.map((size) => `${size}b`).join(" / ")}</span>
              <span className="text-text-bright">{formatCount(row.observationCount)} obs</span>
            </div>
            <div className="mt-2">{iataChips(row.iatas)}</div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
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
    </>
  );
}

export function HashTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const [, setSearchParams] = useSearchParams();
  const [prefixDraft, setPrefixDraft] = useState("");
  const [lookupPrefix, setLookupPrefix] = useState("");
  const [lookupHashSize, setLookupHashSize] = useState<number | undefined>();
  const hashes = useStatsHashAnalytics(range, 25);
  const prefixLookup = useStatsHashPrefixLookup(range, lookupPrefix, lookupHashSize, 25);
  const data = hashes.data;
  const normalizedDraft = normalizePrefix(prefixDraft);
  const canLookup = isValidPrefix(prefixDraft, lookupHashSize);

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
  const handleRiskLookup = useCallback((prefix: string, hashSize: number) => {
    setPrefixDraft(prefix);
    setLookupPrefix(prefix);
    setLookupHashSize(hashSize);
  }, []);
  const handleOpenPacket = useCallback(
    (packetHash: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "Packets");
        next.set("hash", packetHash);
        return next;
      });
    },
    [setSearchParams],
  );

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Hash obs" sublabel={range} accent="var(--color-primary)" value={hashes.isLoading ? "--" : formatCount(data?.totalObservations)} />
        <StatCard label="Multibyte" sublabel={hashes.isLoading ? "observations" : pct(data?.multibyteObservations ?? 0, data?.totalObservations ?? 0)} accent="var(--color-green)" value={hashes.isLoading ? "--" : formatCount(data?.multibyteObservations)} />
        <StatCard label="Risk prefixes" sublabel="short-id" accent="var(--color-warn)" value={hashes.isLoading ? "--" : formatCount(data?.collisionPrefixCount)} />
        <StatCard label="Inconsistent" sublabel="packet sizes" accent="var(--color-danger)" value={hashes.isLoading ? "--" : formatCount(data?.inconsistentPacketCount)} />
      </div>

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={<>Hash size mix / {range}</>} height={230} option={sizeOption} isLoading={hashes.isLoading} isError={hashes.isError} isEmpty={sizeRows.length === 0} />
        <ChartCard title={<>Hash size timeline / {data?.window.bucket ?? ""}</>} height={230} option={timelineOption} isLoading={hashes.isLoading} isError={hashes.isError} isEmpty={timelineRows.length === 0} />
      </div>

      <Card
        title="Short-ID collision matrix"
        right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">IATA x hash size</span>}
      >
        {hashes.isError ? <div className="py-7 text-center font-mono text-[11px] text-danger">Failed to load</div> : <CollisionMatrix data={hashes.isLoading ? undefined : data} onLookup={handleRiskLookup} />}
      </Card>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Card title="Risky prefixes" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">active short IDs</span>}>
          {hashes.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <RiskTable data={hashes.isLoading ? undefined : data} onLookup={handleRiskLookup} />}
        </Card>
        <Card title="Inconsistent packet hash sizes" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">top 25</span>}>
          {hashes.isError ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <InconsistentTable data={hashes.isLoading ? undefined : data} />}
        </Card>
      </div>

      <Card
        title="Prefix lookup"
        right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{lookupPrefix ? `prefix ${lookupPrefix}` : "path hash tool"}</span>}
      >
        <form
          className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canLookup) setLookupPrefix(normalizedDraft);
          }}
        >
          <label className="min-w-0">
            <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">Path hash prefix</span>
            <input
              value={prefixDraft}
              onChange={(event) => setPrefixDraft(event.target.value)}
              placeholder="11 or aabb"
              className="h-9 w-full rounded border border-border-subtle bg-bg-base px-2 font-mono text-[12px] text-text-bright outline-none transition-colors placeholder:text-text-dim focus:border-primary"
            />
          </label>
          <label>
            <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">Hash size</span>
            <select
              value={lookupHashSize ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                setLookupHashSize(value > 0 ? value : undefined);
              }}
              className="h-9 w-full rounded border border-border-subtle bg-bg-base px-2 font-mono text-[12px] text-text-bright outline-none transition-colors focus:border-primary"
            >
              <option value={0}>Any</option>
              <option value={1}>1 byte</option>
              <option value={2}>2 byte</option>
              <option value={3}>3 byte</option>
              <option value={4}>4 byte</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!canLookup}
              className="h-9 w-full rounded border border-primary bg-primary/10 px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 disabled:border-border-subtle disabled:bg-bg-base disabled:text-text-dim"
            >
              Query
            </button>
          </div>
        </form>
        {!canLookup && prefixDraft.trim() && (
          <div className="mb-3 font-mono text-[10px] text-warn">Prefix must be 1-8 hex characters and fit the selected hash size.</div>
        )}
        <PrefixLookupPanel
          data={prefixLookup.data}
          isError={prefixLookup.isError}
          isLoading={prefixLookup.isLoading}
          onOpenPacket={handleOpenPacket}
          prefix={lookupPrefix}
        />
      </Card>
    </div>
  );
}
