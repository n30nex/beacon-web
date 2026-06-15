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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      <div className="overflow-x-auto">
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
