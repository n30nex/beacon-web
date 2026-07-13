import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { IataChip } from "../../components/IataChip";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { formatAbsolute, formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { useChartColors } from "./chartTheme";
import { bucketTimelineOption, leaderboardOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard, StatsQueryNotice } from "./cards";
import { useStatsChannels } from "./useStats";
import type { StatsChannelRow, StatsChannels, StatsRange } from "./types";

function channelName(row: Pick<StatsChannelRow, "name" | "channelHash">) {
  return sanitizeDisplayLabel(row.name, row.channelHash.toUpperCase());
}

function keyStateLabel(value: string) {
  switch (value) {
    case "public":
      return "Public";
    case "hashtag":
      return "Hashtag";
    case "known":
      return "Known";
    default:
      return "Unknown";
  }
}

function keyStateClass(value: string) {
  switch (value) {
    case "public":
      return "text-green";
    case "hashtag":
      return "text-primary";
    case "known":
      return "text-secondary";
    default:
      return "text-warn";
  }
}

function ChannelLinkButton({ channelId }: { channelId?: number }) {
  const [, setSearchParams] = useSearchParams();
  if (!channelId) return null;
  return (
    <button
      type="button"
      className="rounded border border-border-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-primary hover:text-primary"
      onClick={() => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", "Channels");
          next.set("channelId", String(channelId));
          return next;
        });
      }}
    >
      Open
    </button>
  );
}

function TopChannelsTable({ data }: { data?: StatsChannels }) {
  const rows = data?.topChannels ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING CHANNELS" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No channel packets in this window</div>;
  return (
    <>
    <div className="grid gap-2 md:hidden">
      {rows.map((row) => (
        <div key={`${row.channelHash}:${row.channelId ?? "hash"}`} className="rounded-sm border border-border-subtle bg-bg-base/45 p-2 font-mono">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-primary">{channelName(row)}</div>
              <div className="text-[9px] uppercase tracking-wider text-text-dim">hash {row.channelHash.toUpperCase()}</div>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold uppercase ${keyStateClass(row.keyState)}`}>{keyStateLabel(row.keyState)}</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px]">
            <div><div className="text-text-dim">Msgs</div><div className="text-text-bright">{formatCount(row.messageCount)}</div></div>
            <div><div className="text-text-dim">Pkts</div><div className="text-text-normal">{formatCount(row.packetCount)}</div></div>
            <div><div className="text-text-dim">Obs</div><div className="text-text-bright">{formatCount(row.observationCount)}</div></div>
            <div><div className="text-text-dim">Obsrs</div><div className="text-text-normal">{formatCount(row.activeObservers)}</div></div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-text-muted">
            <span>{row.latestIata ? <IataChip>{row.latestIata}</IataChip> : "--"}</span>
            <span>{formatAbsolute(row.lastSeen)}</span>
            <ChannelLinkButton channelId={row.channelId} />
          </div>
        </div>
      ))}
    </div>
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[860px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Channel</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Key</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">IATA</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Msgs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Packets</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Observers</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last seen</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Drill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.channelHash}:${row.channelId ?? "hash"}`} className="border-t border-border-subtle">
              <td className="py-2 pr-3">
                <div className="truncate text-primary" title={channelName(row)}>{channelName(row)}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">hash {row.channelHash.toUpperCase()}</div>
              </td>
              <td className={`py-2 font-semibold ${keyStateClass(row.keyState)}`}>{keyStateLabel(row.keyState)}</td>
              <td className="py-2">{row.latestIata ? <IataChip>{row.latestIata}</IataChip> : <span className="text-text-dim">--</span>}</td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.messageCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.packetCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.activeObservers)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastSeen)}</td>
              <td className="py-2 text-right"><ChannelLinkButton channelId={row.channelId} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function TopSendersTable({ data }: { data?: StatsChannels }) {
  const rows = data?.topSenders ?? [];
  if (!data) return <TerminalLoadingState label="QUERYING SENDERS" detail="PLEASE WAIT" />;
  if (rows.length === 0) return <div className="py-6 text-center font-mono text-[11px] text-text-dim">No decoded senders in this window</div>;
  return (
    <>
    <div className="grid gap-2 md:hidden">
      {rows.map((row) => (
        <div key={`${row.channelId}:${row.senderName}:${row.senderPubkey ?? ""}`} className="rounded-sm border border-border-subtle bg-bg-base/45 p-2 font-mono">
          <div className="truncate text-xs font-semibold text-text-bright">{sanitizeDisplayLabel(row.senderName, "UNKNOWN")}</div>
          {row.senderPubkey && <div className="text-[9px] text-text-dim">{row.senderPubkey.slice(0, 12)}...</div>}
          <div className="mt-2 truncate text-[10px] text-primary">{sanitizeDisplayLabel(row.channelName, row.channelHash.toUpperCase())}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div><div className="text-text-dim">Msgs</div><div className="text-text-bright">{formatCount(row.messageCount)}</div></div>
            <div><div className="text-text-dim">Obs</div><div className="text-text-normal">{formatCount(row.observationCount)}</div></div>
            <div><div className="text-text-dim">Last</div><div className="truncate text-text-muted">{formatAbsolute(row.lastSeen)}</div></div>
          </div>
          <div className="mt-2 flex justify-end"><ChannelLinkButton channelId={row.channelId} /></div>
        </div>
      ))}
    </div>
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[720px] w-full font-mono text-[11px]">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Sender</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Channel</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Msgs</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Obs</th>
            <th className="pb-2 text-left font-semibold uppercase tracking-wider">Last seen</th>
            <th className="pb-2 text-right font-semibold uppercase tracking-wider">Drill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.channelId}:${row.senderName}:${row.senderPubkey ?? ""}`} className="border-t border-border-subtle">
              <td className="py-2 pr-3">
                <div className="truncate text-text-bright">{sanitizeDisplayLabel(row.senderName, "UNKNOWN")}</div>
                {row.senderPubkey && <div className="text-[10px] text-text-dim">{row.senderPubkey.slice(0, 12)}...</div>}
              </td>
              <td className="py-2 pr-3">
                <div className="truncate text-primary">{sanitizeDisplayLabel(row.channelName, row.channelHash.toUpperCase())}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">hash {row.channelHash.toUpperCase()}</div>
              </td>
              <td className="py-2 text-right tabular-nums text-text-bright">{formatCount(row.messageCount)}</td>
              <td className="py-2 text-right tabular-nums text-text-normal">{formatCount(row.observationCount)}</td>
              <td className="py-2 text-text-muted">{formatAbsolute(row.lastSeen)}</td>
              <td className="py-2 text-right"><ChannelLinkButton channelId={row.channelId} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function ChannelsTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const channels = useStatsChannels(range, 25);
  const data = channels.data;

  const keyRows = useMemo(
    () => (data?.keyMix ?? []).map((row, index) => ({ name: keyStateLabel(row.keyState), value: row.observationCount, color: colors.series[index % colors.series.length] ?? colors.primary })),
    [data?.keyMix, colors],
  );
  const timelineRows = useMemo(
    () => (data?.timeline ?? []).map((row) => ({ t: row.t, name: keyStateLabel(row.keyState), value: row.observationCount })),
    [data?.timeline],
  );
  const iataRows = useMemo(
    () => (data?.topIatas ?? []).map((row, index) => ({ name: row.iata, value: row.observationCount, color: colors.series[index % colors.series.length] ?? colors.secondary })),
    [data?.topIatas, colors],
  );
  const keyOption = useMemo(() => typeBarOption(keyRows, colors), [keyRows, colors]);
  const timelineOption = useMemo(() => bucketTimelineOption(timelineRows, colors, { stacked: true, maxSeries: 4 }), [timelineRows, colors]);
  const iataOption = useMemo(() => leaderboardOption(iataRows, colors, 74), [iataRows, colors]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <StatsQueryNotice queries={[channels]} />
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Channels" sublabel={range} accent="var(--color-primary)" value={channels.isLoading ? "--" : formatCount(data?.totalChannels)} />
        <StatCard label="Decoded msgs" sublabel="known keys" accent="var(--color-green)" value={channels.isLoading ? "--" : formatCount(data?.messageCount)} />
        <StatCard label="Channel obs" sublabel="all keys" accent="var(--color-secondary)" value={channels.isLoading ? "--" : formatCount(data?.observationCount)} />
        <StatCard label="Unknown keys" sublabel={`${data?.knownChannels ?? 0} known`} accent="var(--color-warn)" value={channels.isLoading ? "--" : formatCount(data?.unknownChannels)} />
      </div>

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <ChartCard title={<>Key-state mix / {range}</>} height={230} option={keyOption} isLoading={channels.isLoading} isError={channels.isError} isEmpty={keyRows.length === 0} />
        <ChartCard title={<>IATA channel load / {range}</>} height={230} option={iataOption} isLoading={channels.isLoading} isError={channels.isError} isEmpty={iataRows.length === 0} />
        <Card title="Channel key state" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">active hashes</span>}>
          {channels.isLoading ? (
            <TerminalLoadingState label="QUERYING KEY STATES" detail="PLEASE WAIT" />
          ) : channels.isError && !data ? (
            <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div>
          ) : (
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <Metric label="Public" value={data?.publicChannels ?? 0} color="text-green" />
              <Metric label="Hashtag" value={data?.hashtagChannels ?? 0} color="text-primary" />
              <Metric label="Known" value={data?.knownChannels ?? 0} color="text-secondary" />
              <Metric label="Unknown" value={data?.unknownChannels ?? 0} color="text-warn" />
            </div>
          )}
        </Card>
      </div>

      <ChartCard title={<>Channel activity timeline / {data?.window.bucket ?? ""}</>} height={260} option={timelineOption} isLoading={channels.isLoading} isError={channels.isError} isEmpty={timelineRows.length === 0} />

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Card title="Top channels" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">packets + messages</span>}>
          {channels.isError && !data ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <TopChannelsTable data={channels.isLoading ? undefined : data} />}
        </Card>
        <Card title="Top decoded senders" right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">known-key channels</span>}>
          {channels.isError && !data ? <div className="py-6 text-center font-mono text-[11px] text-danger">Failed to load</div> : <TopSendersTable data={channels.isLoading ? undefined : data} />}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-base/35 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{formatCount(value)}</div>
    </div>
  );
}
