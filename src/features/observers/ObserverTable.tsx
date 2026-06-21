import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getObserversPage, getBrokers } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { useCoalescedInfinitePatch } from "../../hooks/useCoalescedInfinitePatch";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { formatHex, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { formatCount } from "../../lib/formatters";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { ObserverDetailPanel } from "./ObserverDetailPanel";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { patchObserverSummary } from "./observer-updates";
import { deriveObserverStatus } from "./observer-status";
import { Card, StatCard } from "../stats/cards";
import { useStatsObserverHealth } from "../stats/useStats";
import type { StatsRange } from "../stats/types";
import type { ObserverSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

const observerId = (o: ObserverSummary) => o.id; // stable id accessor for the paged hook's dedup
const observerStatusKey = (d: WsObserverStatus["data"]) => d.observerId; // one update per observer per frame
const STATS_RANGES: StatsRange[] = ["24h", "7d", "30d"];

function rangeFromParam(value: string | null): StatsRange {
  return value === "7d" || value === "30d" ? value : "24h";
}

interface ObserverTableProps {
  wsManager: WsManager;
  selectedObserverId: string | null;
  onSelectObserver: (id: string | null) => void;
  onAnalyzePacket?: (hash: string) => void;
  onViewStats?: (observerId: string) => void;
}

const COLUMNS: Column<ObserverSummary>[] = [
  {
    header: "Name",
    sortValue: (obs) => sanitizeDisplayLabel(obs.displayName, formatHex(obs.id)),
    cell: (obs) => {
      const label = sanitizeDisplayLabel(obs.displayName, formatHex(obs.id));
      const hasName = Boolean(obs.displayName && label !== formatHex(obs.id));
      return (
        <div className="flex items-center gap-2">
          <span className={`crt-glow-dot w-1.5 h-1.5 rounded-full shrink-0 ${deriveObserverStatus(obs) === "online" ? "bg-green text-green" : "bg-text-dim/30 text-text-dim"}`} />
          <span className={`truncate ${hasName ? "text-text-normal" : "text-text-dim italic"}`}>
            {label}
          </span>
        </div>
      );
    },
  },
  {
    header: "Type",
    className: "text-text-muted",
    sortValue: (obs) => obs.observerType ?? null,
    cell: (obs) => obs.observerType ?? "—",
  },
  {
    header: "Radio",
    className: "text-text-muted",
    sortValue: (obs) => formatRadio(obs.radio) ?? null,
    cell: (obs) => formatRadio(obs.radio) ?? "—",
  },
  {
    header: "IATA",
    className: "text-text-normal",
    sortValue: (obs) => obs.iata,
    cell: (obs) => obs.iata,
  },
  {
    header: "Status",
    sortValue: (obs) => deriveObserverStatus(obs),
    cell: (obs) => {
      const status = deriveObserverStatus(obs);
      return <Badge variant={status === "online" ? "live" : "offline"}>{status}</Badge>;
    },
  },
];

function renderObserverCard(obs: ObserverSummary) {
  const status = deriveObserverStatus(obs);
  const label = sanitizeDisplayLabel(obs.displayName, formatHex(obs.id));
  const hasName = Boolean(obs.displayName && label !== formatHex(obs.id));
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className={`crt-glow-dot w-1.5 h-1.5 rounded-full shrink-0 ${status === "online" ? "bg-green text-green" : "bg-text-dim/30 text-text-dim"}`} />
          <span className={`flex-1 min-w-0 truncate ${hasName ? "text-text-normal" : "text-text-dim italic"}`}>
            {label}
          </span>
        </div>
        <span className="shrink-0">
          <Badge variant={status === "online" ? "live" : "offline"}>{status}</Badge>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span className="text-text-normal">{obs.iata}</span>
        <span>· {obs.observerType ?? "—"}</span>
        <span>· {formatRadio(obs.radio) ?? "—"}</span>
      </div>
    </div>
  );
}

function RangeToggle({ range, onChange }: { range: StatsRange; onChange: (range: StatsRange) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-bg-base p-0.5">
      {STATS_RANGES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            value === range ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-normal"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function ObserverOpsHeader({ range, onRangeChange }: { range: StatsRange; onRangeChange: (range: StatsRange) => void }) {
  const health = useStatsObserverHealth(range, 80);
  const summary = health.data?.summary;
  const worst = useMemo(
    () => [...(health.data?.items ?? [])].sort((a, b) => a.healthScore - b.healthScore || b.observationCount - a.observationCount).slice(0, 5),
    [health.data?.items],
  );

  return (
    <div className="border-b border-border-subtle bg-bg-base/80 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">Observer Operations</div>
          <div className="font-mono text-[10px] text-text-dim">health, RF freshness, and forwarding pressure</div>
        </div>
        <RangeToggle range={range} onChange={onRangeChange} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Observers" sublabel={range} accent="var(--color-primary)" value={health.isLoading ? "--" : formatCount(summary?.totalObservers)} />
        <StatCard label="Stale" sublabel="quiet" accent="var(--color-warn)" value={health.isLoading ? "--" : formatCount(summary?.staleObservers)} />
        <StatCard label="No telemetry" sublabel="blind" accent="var(--color-secondary)" value={health.isLoading ? "--" : formatCount(summary?.noTelemetry)} />
        <StatCard label="Noise" sublabel="high" accent="var(--color-danger)" value={health.isLoading ? "--" : formatCount(summary?.highNoise)} />
        <StatCard label="Airtime" sublabel="busy" accent="var(--color-warn)" value={health.isLoading ? "--" : formatCount(summary?.highAirtime)} />
        <Card title="Worst health" className="col-span-2 md:col-span-4 xl:col-span-1">
          {health.isLoading ? (
            <TerminalLoadingState label="QUERYING OBSERVERS" detail="PLEASE WAIT" className="py-1" />
          ) : worst.length === 0 ? (
            <div className="font-mono text-[11px] text-text-dim">No flagged observers</div>
          ) : (
            <div className="flex flex-col gap-1">
              {worst.slice(0, 3).map((row) => (
                <div key={row.observerId} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                  <span className="min-w-0 truncate text-text-normal">{sanitizeDisplayLabel(row.displayName, row.observerId.slice(0, 8))}</span>
                  <span className={row.healthScore < 60 ? "text-danger" : row.healthScore < 80 ? "text-warn" : "text-green"}>
                    {row.healthScore}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ObserverTable({ wsManager, selectedObserverId, onSelectObserver, onAnalyzePacket, onViewStats }: ObserverTableProps) {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = rangeFromParam(searchParams.get("range"));
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState(""); // "" = Any; applied client-side over the loaded set

  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: getBrokers,
    staleTime: 60_000,
  });

  const brokerNames = useMemo(
    () => brokers?.map((b) => b.name) ?? [],
    [brokers],
  );

  const queryKey = useMemo(
    () => ["observers", regionKey, statusFilter, typeFilter, brokerFilter, search, searchField],
    [regionKey, statusFilter, typeFilter, brokerFilter, search, searchField],
  );

  // page the region's observers 50 at a time (filters stay server-side, in the query key); rows
  // stream in as each batch lands. Loads once per filter set — WS status events keep them live.
  const { items: observers, loadedCount, isPaging, isError, isLoading } = useInfinitePages<ObserverSummary>({
    queryKey,
    queryFn: (cursor) =>
      getObserversPage(iatas, {
        cursor,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        broker: brokerFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
      }),
    getId: observerId,
    keepPrevious: true,
  });

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const obs of observers) {
      if (obs.observerType) types.add(obs.observerType);
    }
    return [...types].sort();
  }, [observers]);

  // scope options are the configured scopes; the filter itself is applied client-side on obs.scopes
  const scopeOptions = useScopes();

  const displayObservers = useMemo(
    () => (scopeFilter ? observers.filter((o) => o.scopes?.includes(scopeFilter)) : observers),
    [observers, scopeFilter],
  );

  const setRange = useCallback(
    (nextRange: StatsRange) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("range", nextRange);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // patch the live status into the paged cache (mirrors NodeTable). A brand-new observer not on any
  // loaded page isn't pulled in here — it surfaces on the next reload/region switch (see the
  // beacon-docs ticket about carrying the full summary in WS events for true live insertion).
  // refresh the open observer's detail panel live; this side effect runs per event (not coalesced)
  const onObserverStatus = useCallback(
    (data: WsObserverStatus["data"]) => {
      if (selectedObserverId === data.observerId) {
        queryClient.invalidateQueries({ queryKey: ["observer", data.observerId] });
      }
    },
    [queryClient, selectedObserverId],
  );
  // cache patches are coalesced per frame so a status burst is one items rebuild + one table render
  useWsObserverStatusHandler(
    wsManager,
    useCoalescedInfinitePatch<ObserverSummary, WsObserverStatus["data"]>(queryKey, observerStatusKey, patchObserverSummary, onObserverStatus),
  );

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex flex-col flex-1 min-w-0">
        <ObserverOpsHeader range={range} onRangeChange={setRange} />

        <ObserverFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          brokerFilter={brokerFilter}
          onBrokerChange={setBrokerFilter}
          brokerOptions={brokerNames}
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <DataTable
          columns={COLUMNS}
          rows={displayObservers}
          rowKey={(o) => o.id}
          selectedKey={selectedObserverId}
          onSelect={onSelectObserver}
          isLoading={isLoading}
          emptyLabel="No observers"
          defaultSort={{ header: "Name" }}
          renderCard={renderObserverCard}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="observers" position="bottom-3 right-3" />
      </div>

      {selectedObserverId && (
        <ObserverDetailPanel
          observerId={selectedObserverId}
          range={range}
          onClose={() => onSelectObserver(null)}
          onAnalyzePacket={onAnalyzePacket}
          onViewStats={onViewStats}
        />
      )}
    </div>
  );
}
