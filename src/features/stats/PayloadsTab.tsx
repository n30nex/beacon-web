import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { useChartColors } from "./chartTheme";
import { useStatsPayloads, useStatsSummary } from "./useStats";
import { bucketTimelineOption, typeBarOption } from "./chartOptions";
import { ChartCard, StatCard } from "./cards";
import type { StatsRange } from "./types";

export function PayloadsTab({ range }: { range: StatsRange }) {
  const colors = useChartColors();
  const payloads = useStatsPayloads(range);
  const summary = useStatsSummary(range);

  const payloadTotals = useMemo(
    () => (payloads.data?.totals ?? []).map((p, i) => ({ name: p.payloadTypeName.toLowerCase(), value: p.count, color: colors.series[i % colors.series.length] ?? colors.primary })),
    [payloads.data?.totals, colors],
  );
  const routeTotals = useMemo(
    () => (payloads.data?.routeTotals ?? []).map((r, i) => ({ name: r.routeTypeName.toLowerCase(), value: r.count, color: colors.series[i % colors.series.length] ?? colors.secondary })),
    [payloads.data?.routeTotals, colors],
  );
  const payloadTotalCount = useMemo(() => payloadTotals.reduce((acc, p) => acc + p.value, 0), [payloadTotals]);
  const routeTotalCount = useMemo(() => routeTotals.reduce((acc, r) => acc + r.value, 0), [routeTotals]);

  const payloadTimeline = useMemo(
    () => (payloads.data?.payloadTimeline ?? []).map((p) => ({ t: p.t, name: p.payloadTypeName.toLowerCase(), value: p.count })),
    [payloads.data?.payloadTimeline],
  );
  const routeTimeline = useMemo(
    () => (payloads.data?.routeTimeline ?? []).map((r) => ({ t: r.t, name: r.routeTypeName.toLowerCase(), value: r.count })),
    [payloads.data?.routeTimeline],
  );

  const payloadOption = useMemo(() => typeBarOption(payloadTotals, colors), [payloadTotals, colors]);
  const routeOption = useMemo(() => typeBarOption(routeTotals, colors), [routeTotals, colors]);
  const payloadTimelineOption = useMemo(() => bucketTimelineOption(payloadTimeline, colors, { stacked: true, maxSeries: 6 }), [payloadTimeline, colors]);
  const routeTimelineOption = useMemo(() => bucketTimelineOption(routeTimeline, colors, { stacked: true, maxSeries: 5 }), [routeTimeline, colors]);

  const livePayload = summary.data?.live.payloadMix?.[0];
  const liveRoute = summary.data?.live.routeMix?.[0];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5 px-3 py-3 sm:px-4 sm:py-4">
      <div className="stats-kpi-grid grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        <StatCard label="Payload obs" sublabel={range} accent="var(--color-primary)" value={payloads.isLoading ? "--" : formatCount(payloadTotalCount)} />
        <StatCard label="Route obs" sublabel={range} accent="var(--color-secondary)" value={payloads.isLoading ? "--" : formatCount(routeTotalCount)} />
        <StatCard label="Live payload" sublabel="15m leader" accent="var(--color-green)" value={summary.isLoading ? "--" : (livePayload?.payloadTypeName ?? "--")} />
        <StatCard label="Live route" sublabel="15m leader" accent="var(--color-warn)" value={summary.isLoading ? "--" : (liveRoute?.routeTypeName ?? "--")} />
      </div>

      <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={<>Payload mix · {range}</>} height={230} option={payloadOption} isLoading={payloads.isLoading} isError={payloads.isError} isEmpty={payloadTotals.length === 0} />
        <ChartCard title={<>Route mix · {range}</>} height={230} option={routeOption} isLoading={payloads.isLoading} isError={payloads.isError} isEmpty={routeTotals.length === 0} />
      </div>

      <ChartCard
        title={<>Payload timeline · {payloads.data?.window.bucket ?? ""}</>}
        height={260}
        option={payloadTimelineOption}
        isLoading={payloads.isLoading}
        isError={payloads.isError}
        isEmpty={payloadTimeline.length === 0}
      />
      <ChartCard
        title={<>Route timeline · {payloads.data?.window.bucket ?? ""}</>}
        height={240}
        option={routeTimelineOption}
        isLoading={payloads.isLoading}
        isError={payloads.isError}
        isEmpty={routeTimeline.length === 0}
      />
    </div>
  );
}
