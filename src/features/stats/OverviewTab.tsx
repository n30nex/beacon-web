import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { useChartColors, type ChartColors } from "./chartTheme";
import { useStatsHome } from "./useStats";
import { leaderboardOption, typeBarOption } from "./chartOptions";
import { ChartCard, StatCard, StatsQueryNotice } from "./cards";
import { useLiveOverview } from "./useLiveStats";
import type { WsManager } from "../../api/ws-manager";
import type { StatsRange } from "./types";

function nodeTypeColor(typeName: string, c: ChartColors): string {
  switch (typeName) {
    case "companion": return c.primary;
    case "repeater": return c.green;
    case "room_server": return c.secondary;
    case "sensor": return c.warn;
    default: return c.primaryDim;
  }
}

interface OverviewTabProps {
  range: StatsRange;
  onSelectObserver: (observerId: string) => void;
  wsManager: WsManager;
}

// The overview deliberately uses the compact /stats/home aggregate. Mounting this tab must issue one
// database-heavy request, not Summary plus several component endpoints in parallel.
export function OverviewTab({ range, onSelectObserver, wsManager }: OverviewTabProps) {
  const colors = useChartColors();
  useLiveOverview(wsManager);
  const home = useStatsHome(range);
  const data = home.data;

  const nodeRows = useMemo(
    () => (data?.topNodes ?? []).map((node) => ({
      name: sanitizeDisplayLabel(node.nodeName, node.nodeId.slice(0, 8)),
      value: node.observationCount,
      color: nodeTypeColor(node.nodeTypeName, colors),
    })),
    [data?.topNodes, colors],
  );
  const nodesOption = useMemo(() => leaderboardOption(nodeRows, colors), [nodeRows, colors]);

  const topIatas = useMemo(
    () => (data?.topIatas ?? []).map((row) => ({ name: row.iata, value: row.count, color: colors.primary })),
    [data?.topIatas, colors],
  );
  const iataOption = useMemo(() => leaderboardOption(topIatas, colors, 72), [topIatas, colors]);

  const observers = useMemo(
    () => (data?.topObservers ?? []).map((observer) => ({
      name: sanitizeDisplayLabel(observer.displayName, observer.observerId.slice(0, 8)),
      value: observer.observationCount,
      color: colors.secondary,
    })),
    [data?.topObservers, colors],
  );
  const observerIds = useMemo(() => (data?.topObservers ?? []).map((observer) => observer.observerId), [data?.topObservers]);
  const observersOption = useMemo(() => leaderboardOption(observers, colors), [observers, colors]);
  const observerEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const index = (params as { dataIndex?: number }).dataIndex;
        if (index != null && observerIds[index]) onSelectObserver(observerIds[index]);
      },
    }),
    [observerIds, onSelectObserver],
  );

  const livePayloads = useMemo(
    () => (data?.live.payloadMix ?? []).map((row, index) => ({
      name: row.payloadTypeName.toLowerCase(),
      value: row.count,
      color: colors.series[index % colors.series.length] ?? colors.green,
    })),
    [data?.live.payloadMix, colors],
  );
  const payloadOption = useMemo(() => typeBarOption(livePayloads, colors), [livePayloads, colors]);
  const liveRoutes = useMemo(
    () => (data?.live.routeMix ?? []).map((row, index) => ({
      name: row.routeTypeName.toLowerCase(),
      value: row.count,
      color: colors.series[index % colors.series.length] ?? colors.warn,
    })),
    [data?.live.routeMix, colors],
  );
  const routeOption = useMemo(() => typeBarOption(liveRoutes, colors), [liveRoutes, colors]);

  const overview = data?.overview;
  const live = data?.live;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <StatsQueryNotice queries={[home]} />

      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3" role="region" aria-label="Analytics key performance indicators" tabIndex={0}>
        <StatCard label="Packets" sublabel={range} accent="var(--color-primary)" value={home.isLoading ? "--" : formatCount(overview?.totalPackets)} />
        <StatCard label="Observations" sublabel={range} accent="var(--color-green)" value={home.isLoading ? "--" : formatCount(overview?.totalObservations)} />
        <StatCard label="Observers" sublabel={range} accent="var(--color-secondary)" value={home.isLoading ? "--" : formatCount(overview?.activeObservers)} />
        <StatCard label="Active IATAs" sublabel={range} accent="var(--color-primary)" value={home.isLoading ? "--" : formatCount(overview?.activeIatas)} />
        <StatCard label="Live packets" sublabel="15m" accent="var(--color-warn)" value={home.isLoading ? "--" : formatCount(live?.packetCount)} />
        <StatCard label="Live observations" sublabel="15m" accent="var(--color-green)" value={home.isLoading ? "--" : formatCount(live?.observationCount)} />
        <StatCard label="Live observers" sublabel="15m" accent="var(--color-secondary)" value={home.isLoading ? "--" : formatCount(live?.activeObservers)} />
        <StatCard label="Window" sublabel="server aggregate" accent="var(--color-primary)" value={overview?.windowHours ? `${overview.windowHours}h` : range} />
      </div>

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2" role="region" aria-label="Analytics charts" tabIndex={0}>
        <ChartCard title="Top IATAs" height={210} option={iataOption} isLoading={home.isLoading} isError={home.isError} isEmpty={topIatas.length === 0} />
        <ChartCard title="Top observers" height={210} option={observersOption} isLoading={home.isLoading} isError={home.isError} isEmpty={observers.length === 0} onEvents={observerEvents} />
        <ChartCard title="Top nodes" height={210} option={nodesOption} isLoading={home.isLoading} isError={home.isError} isEmpty={nodeRows.length === 0} />
        <ChartCard title="Live payload mix · 15m" height={210} option={payloadOption} isLoading={home.isLoading} isError={home.isError} isEmpty={livePayloads.length === 0} />
        <ChartCard title="Live route mix · 15m" height={210} option={routeOption} isLoading={home.isLoading} isError={home.isError} isEmpty={liveRoutes.length === 0} className="lg:col-span-2" />
      </div>
    </div>
  );
}
