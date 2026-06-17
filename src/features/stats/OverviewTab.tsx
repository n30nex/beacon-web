import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { useChartColors, type ChartColors } from "./chartTheme";
import { useStatsSummary, useStatsObservations } from "./useStats";
import { observationsAreaOption, leaderboardOption, typeBarOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useLiveOverview } from "./useLiveStats";
import { aggregatePresets, formatPreset } from "./transforms";
import type { WsManager } from "../../api/ws-manager";
import type { ObservationPoint, StatsRange } from "./types";

function aggregateByHour(points: ObservationPoint[]) {
  const byHour = new Map<number, { hour: number; observationCount: number; uniquePackets: number; activeObservers: number }>();
  for (const p of points) {
    const cur = byHour.get(p.hour) ?? { hour: p.hour, observationCount: 0, uniquePackets: 0, activeObservers: 0 };
    cur.observationCount += p.observationCount;
    cur.uniquePackets += p.uniquePackets;
    cur.activeObservers += p.activeObservers;
    byHour.set(p.hour, cur);
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

function nodeTypeColor(typeName: string, c: ChartColors): string {
  switch (typeName) {
    case "companion": return c.primary;
    case "repeater": return c.green;
    case "room_server": return c.secondary;
    case "sensor": return c.warn;
    default: return c.primaryDim;
  }
}

function HealthAlerts({
  stale,
  noTelemetry,
  highNoise,
  highAirtime,
  receiveErrors,
}: {
  stale: number;
  noTelemetry: number;
  highNoise: number;
  highAirtime: number;
  receiveErrors: number;
}) {
  const rows = [
    ["Stale observers", stale, "text-warn"],
    ["No telemetry", noTelemetry, "text-text-muted"],
    ["High noise", highNoise, "text-danger"],
    ["High airtime", highAirtime, "text-danger"],
    ["Receive errors", receiveErrors, "text-danger"],
  ] as const;
  return (
    <Card title="Health alerts">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center justify-between rounded border border-border-subtle bg-bg-base/50 px-2.5 py-2 font-mono">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
            <span className={`text-lg font-bold tabular-nums ${value > 0 ? color : "text-green"}`}>{formatCount(value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface OverviewTabProps {
  range: StatsRange;
  onSelectObserver: (observerId: string) => void;
  wsManager: WsManager;
}

export function OverviewTab({ range, onSelectObserver, wsManager }: OverviewTabProps) {
  const colors = useChartColors();
  useLiveOverview(wsManager);
  const summary = useStatsSummary(range);
  const observations = useStatsObservations(range);

  const obs = useMemo(() => aggregateByHour(observations.data ?? []), [observations.data]);
  const obsOption = useMemo(() => observationsAreaOption(obs, colors), [obs, colors]);
  const obsSpark = useMemo(() => obs.slice(-24).map((p) => p.observationCount), [obs]);
  const observerSpark = useMemo(() => obs.slice(-24).map((p) => p.activeObservers), [obs]);

  const data = summary.data;
  const nodeRows = useMemo(
    () =>
      (data?.topNodes ?? []).map((n) => ({
        name: sanitizeDisplayLabel(n.nodeName, n.nodeId.slice(0, 8)),
        value: n.observationCount,
        color: nodeTypeColor(n.nodeTypeName, colors),
      })),
    [data?.topNodes, colors],
  );
  const nodesOption = useMemo(() => leaderboardOption(nodeRows, colors), [nodeRows, colors]);

  const topIatas = useMemo(
    () => (data?.topIatas ?? []).map((r) => ({ name: r.iata, value: r.count, color: colors.primary })),
    [data?.topIatas, colors],
  );
  const iataOption = useMemo(() => leaderboardOption(topIatas, colors, 72), [topIatas, colors]);

  const nodeTypes = useMemo(
    () => (data?.nodeTypes ?? []).map((n) => ({ name: n.nodeTypeName, value: n.count, color: nodeTypeColor(n.nodeTypeName, colors) })),
    [data?.nodeTypes, colors],
  );
  const nodeTypesOption = useMemo(() => typeBarOption(nodeTypes, colors), [nodeTypes, colors]);

  const observers = useMemo(
    () => (data?.topObservers ?? []).map((o) => ({ name: sanitizeDisplayLabel(o.displayName, o.observerId.slice(0, 8)), value: o.observationCount, color: colors.secondary })),
    [data?.topObservers, colors],
  );
  const observerIds = useMemo(() => (data?.topObservers ?? []).map((o) => o.observerId), [data?.topObservers]);
  const observersOption = useMemo(() => leaderboardOption(observers, colors), [observers, colors]);
  const observerEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const idx = (params as { dataIndex?: number }).dataIndex;
        if (idx != null && observerIds[idx]) onSelectObserver(observerIds[idx]);
      },
    }),
    [observerIds, onSelectObserver],
  );

  const presetRows = useMemo(
    () => aggregatePresets(data?.radioPresets ?? []).slice(0, 8).map((r) => ({ name: formatPreset(r.preset), value: r.value, color: colors.primary })),
    [data?.radioPresets, colors],
  );
  const presetsOption = useMemo(() => leaderboardOption(presetRows, colors, 150), [presetRows, colors]);

  const ov = data?.overview;
  const live = data?.live;
  const health = data?.health;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Packets" sublabel={range} accent="var(--color-primary)" value={summary.isLoading ? "--" : formatCount(ov?.totalPackets)} />
        <StatCard label="Observations" sublabel={range} accent="var(--color-green)" value={summary.isLoading ? "--" : formatCount(ov?.totalObservations)} spark={obsSpark} />
        <StatCard label="Observers" sublabel={range} accent="var(--color-secondary)" value={summary.isLoading ? "--" : formatCount(ov?.activeObservers)} spark={observerSpark} />
        <StatCard label="Live now" sublabel="15m" accent="var(--color-warn)" value={summary.isLoading ? "--" : formatCount(live?.observationCount)} />
        <StatCard label="Active IATAs" sublabel={range} accent="var(--color-primary)" value={summary.isLoading ? "--" : formatCount(ov?.activeIatas)} />
        <StatCard label="Stale" sublabel="observers" accent="var(--color-warn)" value={summary.isLoading ? "--" : formatCount(health?.staleObservers)} />
        <StatCard label="RF flags" sublabel="noise/air" accent="var(--color-danger)" value={summary.isLoading ? "--" : formatCount((health?.highNoise ?? 0) + (health?.highAirtime ?? 0))} />
        <StatCard label="No telemetry" sublabel="observers" accent="var(--color-secondary)" value={summary.isLoading ? "--" : formatCount(health?.noTelemetry)} />
      </div>

      <ChartCard
        title={<>Observations · {range}</>}
        height={210}
        option={obsOption}
        isLoading={observations.isLoading}
        isError={observations.isError}
        isEmpty={obs.length === 0}
      />

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="Top IATAs" height={210} option={iataOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={topIatas.length === 0} />
        <ChartCard title="Node types" height={210} option={nodeTypesOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={nodeTypes.length === 0} />
        <ChartCard title="Top observers" height={210} option={observersOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={observers.length === 0} onEvents={observerEvents} />
        <ChartCard title="Top nodes" height={210} option={nodesOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={nodeRows.length === 0} />
        <HealthAlerts
          stale={health?.staleObservers ?? 0}
          noTelemetry={health?.noTelemetry ?? 0}
          highNoise={health?.highNoise ?? 0}
          highAirtime={health?.highAirtime ?? 0}
          receiveErrors={health?.receiveErrors ?? 0}
        />
        <ChartCard title="Radio presets" height={210} option={presetsOption} isLoading={summary.isLoading} isError={summary.isError} isEmpty={presetRows.length === 0} />
      </div>
    </div>
  );
}
