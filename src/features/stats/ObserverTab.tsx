import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { IataChip } from "../../components/IataChip";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { formatBattery, formatCount, formatUptime, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useChartColors } from "./chartTheme";
import { useStatsObserverCompare, useStatsObserverHealth } from "./useStats";
import { useObserver, useObserverTelemetry } from "./useTelemetry";
import { useTick } from "../../hooks/useTick";
import { deriveObserverStatus } from "../observers/observer-status";
import { airtimeOption, batteryOption, noiseFloorOption, observerCompareTimelineOption, queueOption, receiveErrorsOption } from "./chartOptions";
import { Card, ChartCard } from "./cards";
import { hasTelemetry } from "./transforms";
import { useLiveObserver } from "./useLiveStats";
import type { WsManager } from "../../api/ws-manager";
import type { Observer } from "../observers/types";
import type { StatsObserverCompareItem, StatsObserverHealth, StatsRange } from "./types";

function compactFlags(row?: StatsObserverHealth): string[] {
  if (!row) return [];
  const out: string[] = [];
  if (row.flags.stale) out.push("stale");
  if (row.flags.lowBattery) out.push("batt");
  if (row.flags.highNoise) out.push("noise");
  if (row.flags.highAirtime) out.push("air");
  if (row.flags.queueBacklog) out.push("queue");
  if (row.flags.receiveErrors) out.push("err");
  if (row.flags.noTelemetry) out.push("no tel");
  return out;
}

function ObserverList({
  range,
  selectedId,
  onSelect,
  compareMode,
  compareIds,
  onSetCompareMode,
  onToggleCompareId,
}: {
  range: StatsRange;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compareMode: boolean;
  compareIds: string[];
  onSetCompareMode: (enabled: boolean) => void;
  onToggleCompareId: (id: string) => void;
}) {
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  // debounce so the server-side lookup fires once per pause, not once per keystroke
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const searching = q.length > 0;

  // default: observer-health rows by activity (with flags + activity bar). Searching swaps to a server-side
  // name lookup across ALL observers in the region, not just the loaded top rows.
  const health = useStatsObserverHealth(range, 80);
  const max = useMemo(() => Math.max(1, ...(health.data?.items ?? []).map((o) => o.observationCount)), [health.data?.items]);

  const search = useQuery({
    queryKey: ["observer-search", regionKey, q],
    queryFn: () => getObserversPage(iatas, { name: q, limit: 50 }),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  type Row = { id: string; name: string; count?: number; iata?: string; online?: boolean; score?: number; flags?: string[]; telemetryAt?: number };
  const rows: Row[] = searching
    ? (search.data?.items ?? []).map((o) => ({ id: o.id, name: sanitizeDisplayLabel(o.displayName, o.id.slice(0, 8)), iata: o.iata, online: o.status === "online" }))
    : (health.data?.items ?? []).map((o) => ({
        id: o.observerId,
        name: sanitizeDisplayLabel(o.displayName, o.observerId.slice(0, 8)),
        count: o.observationCount,
        iata: o.iata,
        online: o.status === "online",
        score: o.healthScore,
        flags: compactFlags(o),
        telemetryAt: o.telemetryAt,
      }));

  const loading = searching ? search.isLoading : health.isLoading;

  return (
    <Card
      title="Observers"
      right={
        <button
          type="button"
          className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            compareMode ? "border-primary bg-primary/12 text-primary" : "border-border bg-bg-base text-text-muted hover:border-primary hover:text-text-normal"
          }`}
          onClick={() => onSetCompareMode(!compareMode)}
          aria-pressed={compareMode}
        >
          Compare
        </button>
      }
      className="w-full"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search observers…"
        className="mb-2 w-full rounded border border-border bg-bg-base px-2 py-1 font-mono text-[12px] text-text-normal placeholder:text-text-dim"
      />
      <div className="flex flex-col gap-0.5">
        {loading && <TerminalLoadingState label={searching ? "SEARCHING OBSERVERS" : "QUERYING OBSERVERS"} detail="PLEASE WAIT" />}
        {searching && search.isError && (
          <div className="py-6 text-center font-mono text-[11px] text-danger">Search failed</div>
        )}
        {!loading && !(searching && search.isError) && rows.length === 0 && (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">{searching ? "No matches" : "No observers"}</div>
        )}
        {rows.map((r) => {
          const active = r.id === selectedId;
          const compared = compareIds.includes(r.id);
          const compareDisabled = compareMode && !compared && compareIds.length >= 6;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                if (compareMode) onToggleCompareId(r.id);
                else onSelect(r.id);
              }}
              disabled={compareDisabled}
              className={`relative overflow-hidden rounded border-l-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                compared ? "border-secondary bg-secondary/10" : active ? "border-primary bg-primary/10" : "border-transparent hover:bg-primary/8"
              } ${compareDisabled ? "opacity-45" : ""}`}
              aria-pressed={compareMode ? compared : active}
            >
              {compareMode && (
                <span className={`absolute right-2 top-2 h-3 w-3 border ${compared ? "border-secondary bg-secondary shadow-[0_0_8px_rgba(var(--rgb-secondary),0.45)]" : "border-border bg-bg-base"}`} aria-hidden />
              )}
              {r.count != null && (
                <div
                  className="absolute inset-y-0 left-0 bg-secondary/10"
                  style={{ width: `${(r.count / max) * 100}%` }}
                  aria-hidden
                />
              )}
              <div className="relative flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className={`block truncate font-mono text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{r.name}</span>
                  {!searching && (
                    <span className="mt-0.5 flex flex-wrap gap-1 font-mono text-[9px] uppercase tracking-wider text-text-dim">
                      {(r.flags ?? []).slice(0, 4).map((f) => (
                        <span key={f} className="rounded border border-border-subtle px-1 py-px">{f}</span>
                      ))}
                      {r.telemetryAt && <span>{timeAgoMs(r.telemetryAt)}</span>}
                    </span>
                  )}
                </span>
                {r.count != null ? (
                  <span className="flex shrink-0 flex-col items-end font-mono text-[11px] tabular-nums text-text-muted">
                    <span>{formatCount(r.count)}</span>
                    {r.score != null && <span className={r.score < 60 ? "text-danger" : r.score < 80 ? "text-warn" : "text-green"}>{r.score}</span>}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-text-muted">
                    {r.iata}
                    <span className={`crt-glow-dot h-1.5 w-1.5 rounded-full ${r.online ? "bg-green text-green" : "bg-text-dim/30 text-text-dim"}`} aria-hidden />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ObserverHeader({ observer }: { observer: Observer }) {
  useTick(); // keep the recency-derived status badge fresh
  const status = deriveObserverStatus(observer);
  const observerLabel = sanitizeDisplayLabel(observer.displayName, observer.id.slice(0, 8));
  const radio = [
    observer.radioFreqMhz && `${observer.radioFreqMhz} MHz`,
    observer.radioSf && `SF${observer.radioSf}`,
    observer.radioBwKhz && `${observer.radioBwKhz} kHz`,
    observer.radioCr && `CR 4/${observer.radioCr}`,
  ].filter(Boolean) as string[];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="text-text-bright normal-case">{observerLabel}</span>
          <Badge variant={status === "online" ? "live" : "offline"}>{status}</Badge>
          {observer.observerType && <Badge variant="default">{observer.observerType}</Badge>}
        </span>
      }
      right={
        <span className="rounded-sm bg-primary/6 px-1.5 py-px font-mono text-[12px] font-semibold text-primary">{observer.iata}</span>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 font-mono text-[12px]">
        <Metric label="Battery" value={observer.batteryLevel != null ? formatBattery(observer.batteryLevel) : "—"} />
        <Metric label="Uptime" value={observer.uptimeSeconds != null ? formatUptime(observer.uptimeSeconds) : "—"} />
        <Metric label="Observations" value={observer.observationCount.toLocaleString()} />
        {radio.length > 0 && <Metric label="Radio" value={radio.join(" · ")} />}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-text-dim">{label} </span>
      <span className="text-text-normal">{value}</span>
    </span>
  );
}

function compareLabel(item: StatsObserverCompareItem) {
  return sanitizeDisplayLabel(item.displayName, item.observerId.slice(0, 8));
}

function mixLabel(items: ({ payloadTypeName: string; count: number } | { routeTypeName: string; count: number })[]) {
  const first = items[0];
  if (!first) return "-";
  const label = "payloadTypeName" in first ? first.payloadTypeName : first.routeTypeName;
  return `${label} ${formatCount(first.count)}`;
}

function CompareBar({ label, value, max, detail }: { label: string; value: number; max: number; detail?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className="text-text-dim">{label}</span>
        <span className="text-text-muted">{formatCount(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-border/50">
        <div className="h-full bg-primary shadow-[0_0_8px_rgba(var(--rgb-primary),0.45)]" style={{ width: `${Math.max(6, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
      {detail && <div className="mt-1 truncate font-mono text-[10px] text-text-dim">{detail}</div>}
    </div>
  );
}

function ObserverComparePanel({ range, observerIds, onSelectObserver }: { range: StatsRange; observerIds: string[]; onSelectObserver: (id: string) => void }) {
  const colors = useChartColors();
  const compare = useStatsObserverCompare(range, observerIds);
  const items = useMemo(() => compare.data?.items ?? [], [compare.data?.items]);
  const series = useMemo(() => compare.data?.series ?? [], [compare.data?.series]);
  const maxObs = Math.max(1, ...items.map((item) => item.observationCount));
  const maxPackets = Math.max(1, ...items.map((item) => item.packetCount));
  const bucketCount = new Set(series.map((point) => point.t)).size;
  const timeline = useMemo(
    () => observerCompareTimelineOption(series, items, colors),
    [series, items, colors],
  );

  if (observerIds.length < 2) {
    return (
      <Card title="Observer Compare">
        <EmptyState title="Select two observers" subtitle="Enable Compare and pick 2 to 6 observers from the list" />
      </Card>
    );
  }

  if (compare.isLoading) {
    return (
      <Card title="Observer Compare">
        <TerminalLoadingState label="QUERYING OBSERVER COMPARE" detail="PLEASE WAIT" />
      </Card>
    );
  }

  if (compare.isError) {
    return (
      <Card title="Observer Compare">
        <EmptyState title="Compare failed" subtitle="The observer comparison endpoint did not respond" />
      </Card>
    );
  }

  return (
    <Card
      title="Observer Compare"
      right={<span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{items.length} obs / {bucketCount} buckets</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">
        <span>Shared IATAs</span>
        {(compare.data?.sharedIatas.length ?? 0) > 0 ? (
          compare.data!.sharedIatas.map((iata) => <IataChip key={iata}>{iata}</IataChip>)
        ) : (
          <span className="text-text-muted">none in window</span>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="No compare data" subtitle="Selected observers have no matching activity in this region/window" />
      ) : (
        <div className="space-y-3">
          <ChartCard
            title="Observation Timeline"
            height={190}
            option={timeline}
            isEmpty={series.length === 0}
          />
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {items.map((item) => (
              <button
                key={item.observerId}
                type="button"
                className="rounded border border-border bg-bg-base p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/8"
                onClick={() => onSelectObserver(item.observerId)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] font-semibold text-primary">{compareLabel(item)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      {item.iata && <IataChip>{item.iata}</IataChip>}
                      {item.observerType && <span>{item.observerType}</span>}
                    </span>
                  </span>
                  <span className={`font-mono text-lg font-semibold ${item.healthScore < 60 ? "text-danger" : item.healthScore < 80 ? "text-warn" : "text-green"}`}>
                    {item.healthScore}
                  </span>
                </div>
                <div className="space-y-2">
                  <CompareBar label="Observations" value={item.observationCount} max={maxObs} detail={`${formatCount(item.packetCount)} packets`} />
                  <CompareBar label="Packets" value={item.packetCount} max={maxPackets} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                  <Metric label="Payload" value={mixLabel(item.payloadMix)} />
                  <Metric label="Route" value={mixLabel(item.routeMix)} />
                  <Metric label="Noise" value={item.avgNoiseFloorDb == null ? "-" : `${item.avgNoiseFloorDb.toFixed(1)} dB`} />
                  <Metric label="Airtime" value={item.avgAirtimeTxPct == null && item.avgAirtimeRxPct == null ? "-" : `${item.avgAirtimeTxPct?.toFixed(0) ?? "-"} / ${item.avgAirtimeRxPct?.toFixed(0) ?? "-"}%`} />
                  <Metric label="Battery" value={item.avgBatteryMv == null ? "-" : `${item.avgBatteryMv} mV`} />
                  <Metric label="Errors" value={formatCount(item.receiveErrorsSum)} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

interface ObserverTabProps {
  compareIds: string[];
  compareMode: boolean;
  onCompareChange: (enabled: boolean, ids: string[]) => void;
  range: StatsRange;
  selectedObserverId: string | null;
  onSelectObserver: (observerId: string) => void;
  wsManager: WsManager;
}

export function ObserverTab({ compareIds, compareMode, onCompareChange, range, selectedObserverId, onSelectObserver, wsManager }: ObserverTabProps) {
  const colors = useChartColors();
  useLiveObserver(wsManager, selectedObserverId, range);
  const health = useStatsObserverHealth(range, 80);
  const observer = useObserver(selectedObserverId);
  const telemetry = useObserverTelemetry(selectedObserverId, range);
  const seededCompareIds = useMemo(() => {
    if (compareIds.length >= 2) return compareIds;
    const ids: string[] = [];
    const add = (id: string | null | undefined) => {
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(selectedObserverId);
    for (const row of health.data?.items ?? []) {
      add(row.observerId);
      if (ids.length >= 2) break;
    }
    return ids;
  }, [compareIds, health.data?.items, selectedObserverId]);
  const activeCompareIds = compareMode ? seededCompareIds : compareIds;

  // default to the busiest observer once the list loads and nothing is selected
  useEffect(() => {
    if (selectedObserverId) return;
    const first = health.data?.items?.[0];
    if (first) onSelectObserver(first.observerId);
  }, [selectedObserverId, health.data?.items, onSelectObserver]);

  function handleSetCompareMode(enabled: boolean) {
    if (!enabled) {
      onCompareChange(false, []);
      return;
    }
    onCompareChange(true, seededCompareIds);
  }

  function handleToggleCompareId(id: string) {
    const base = compareIds.length > 0 ? compareIds : activeCompareIds;
    if (base.includes(id)) {
      onCompareChange(true, base.filter((existing) => existing !== id));
      return;
    }
    if (base.length >= 6) return;
    onCompareChange(true, [...base, id]);
  }

  const points = useMemo(() => telemetry.data?.points ?? [], [telemetry.data]);
  const airtime = useMemo(() => airtimeOption(points, colors), [points, colors]);
  const battery = useMemo(() => batteryOption(points, colors), [points, colors]);
  const noise = useMemo(() => noiseFloorOption(points, colors), [points, colors]);
  const queue = useMemo(() => queueOption(points, colors), [points, colors]);
  const recvErrors = useMemo(() => receiveErrorsOption(points, colors), [points, colors]);

  // Bots / MQTT bridges report status but no device telemetry — show one clear empty state rather
  // than five flat-zero charts. When some telemetry exists, gate each chart on its own metric.
  const ready = !telemetry.isLoading && !telemetry.isError;
  const noTelemetry = ready && !hasTelemetry(points);
  // a chart is empty when none of its metric(s) have a non-null value across the window
  const missing = (...accessors: ((p: (typeof points)[number]) => number | null)[]) =>
    ready && !points.some((p) => accessors.some((a) => a(p) != null));

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-2 py-2 sm:gap-3.5 sm:px-4 sm:py-4 lg:flex-row">
      <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[260px]">
        <ObserverList
          range={range}
          selectedId={selectedObserverId}
          onSelect={onSelectObserver}
          compareMode={compareMode}
          compareIds={activeCompareIds}
          onSetCompareMode={handleSetCompareMode}
          onToggleCompareId={handleToggleCompareId}
        />
      </div>

      <div className="order-1 flex min-w-0 flex-1 flex-col gap-3 lg:order-2 lg:gap-3.5">
        {compareMode ? (
          <ObserverComparePanel range={range} observerIds={activeCompareIds} onSelectObserver={onSelectObserver} />
        ) : !selectedObserverId ? (
          <Card title="Telemetry">
            <EmptyState title="Select an observer" subtitle="Pick an observer to view its telemetry" />
          </Card>
        ) : (
          <>
            {observer.data && <ObserverHeader observer={observer.data} />}
            {noTelemetry ? (
              <Card title="Telemetry">
                <EmptyState title="No telemetry reported" subtitle="This observer publishes status but no device telemetry" />
              </Card>
            ) : (
              <>
                <ChartCard
                  title={<>Airtime TX / RX · {range}</>}
                  height={180}
                  option={airtime}
                  isLoading={telemetry.isLoading}
                  isError={telemetry.isError}
                  isEmpty={missing((p) => p.airtimeTxPct, (p) => p.airtimeRxPct)}
                />
                <div className="stats-chart-rail grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                  <ChartCard title="Battery" height={168} option={battery} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.batteryMv)} />
                  <ChartCard title="Noise floor" height={168} option={noise} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.noiseFloorDb)} />
                  <ChartCard title="Queue length" height={168} option={queue} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.queueLength)} />
                  <ChartCard title="Receive errors" height={168} option={recvErrors} isLoading={telemetry.isLoading} isError={telemetry.isError} isEmpty={missing((p) => p.receiveErrors)} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
