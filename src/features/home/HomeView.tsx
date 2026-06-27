import { type ReactNode } from "react";
import { NavIcon } from "../../components/NavIcon";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { QueryStatePanel } from "../../components/QueryStatePanel";
import { useRegion } from "../../hooks/useRegion";
import { useStatsHome } from "../stats/useStats";
import { useLiveOverview } from "../stats/useLiveStats";
import { formatCount, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { queryStateForError } from "../../lib/query-state";
import type { PageTab } from "../../lib/navigation";
import type { WsManager } from "../../api/ws-manager";

const COMMAND_GROUPS: { label: string; tabs: readonly PageTab[] }[] = [
  { label: "Monitor", tabs: ["Live", "Map", "Netgraph"] },
  { label: "Explore", tabs: ["Packets", "Nodes", "Observers"] },
  { label: "Network", tabs: ["Routes", "Traces", "Channels"] },
  { label: "System", tabs: ["Analytics", "System"] },
];

const ICON_FOR_TAB: Record<PageTab, Parameters<typeof NavIcon>[0]["name"]> = {
  Home: "home",
  Packets: "packets",
  Map: "map",
  Live: "live",
  Channels: "channels",
  Nodes: "nodes",
  Observers: "observers",
  Routes: "routes",
  Netgraph: "netgraph",
  Traces: "traces",
  Analytics: "analytics",
  System: "system",
};

function scopeLabel(iatas: string[] | undefined): string {
  if (!iatas || iatas.length === 0) return "ALL";
  if (iatas.length <= 3) return iatas.join(", ");
  return `${iatas.length} IATAS`;
}

function HeaderChip({ label, value, tone = "text-text-bright" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-sm border border-border-subtle bg-bg-base/55 px-2.5 py-1.5">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`truncate font-mono text-[11px] font-bold uppercase tracking-wide ${tone}`}>{value}</div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-h-[72px] rounded-sm border border-border bg-bg-surface px-3 py-2">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-text-bright md:text-2xl">{value}</div>
      {detail && <div className="truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">{detail}</div>}
    </div>
  );
}

function CommandButton({ tab, onNavigate }: { tab: PageTab; onNavigate: (tab: PageTab) => void }) {
  return (
    <button
      type="button"
      aria-label={tab}
      className="crt-panel inline-flex h-9 min-w-[6.25rem] items-center justify-center gap-1.5 rounded-sm border border-border bg-bg-base/55 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-primary/55 hover:bg-primary/8 hover:text-text-bright"
      onClick={() => onNavigate(tab)}
    >
      <NavIcon name={ICON_FOR_TAB[tab]} size={15} />
      <span>{tab}</span>
    </button>
  );
}

function CommandBar({ onNavigate }: { onNavigate: (tab: PageTab) => void }) {
  return (
    <section aria-label="Home commands" className="hidden rounded-sm border border-border bg-bg-surface p-3 md:block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">Command</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">Direct jump</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {COMMAND_GROUPS.map((group) => (
          <div key={group.label} className="min-w-0">
            <div className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">{group.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {group.tabs.map((tab) => (
                <CommandButton key={tab} tab={tab} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityButton({
  label,
  value,
  detail,
  tab,
  icon,
  tone = "text-text-bright",
  onNavigate,
}: {
  label: string;
  value: string;
  detail: string;
  tab: PageTab;
  icon: Parameters<typeof NavIcon>[0]["name"];
  tone?: string;
  onNavigate: (tab: PageTab) => void;
}) {
  return (
    <button
      type="button"
      className="grid min-h-[66px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-sm border border-border-subtle bg-bg-base/55 px-2.5 py-2 text-left transition-colors hover:border-primary/45 hover:bg-primary/7"
      onClick={() => onNavigate(tab)}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-sm border border-border-subtle bg-bg-surface ${tone}`}>
        <NavIcon name={icon} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">{label}</span>
        <span className={`block truncate font-mono text-sm font-bold tabular-nums ${tone}`}>{value}</span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">{detail}</span>
      </span>
    </button>
  );
}

function ActivityNow({
  livePackets,
  topNode,
  topObserver,
  topIata,
  onNavigate,
}: {
  livePackets: string;
  topNode: { label: string; detail: string } | null;
  topObserver: { label: string; detail: string } | null;
  topIata: { label: string; detail: string } | null;
  onNavigate: (tab: PageTab) => void;
}) {
  return (
    <section aria-label="Activity now" className="rounded-sm border border-border bg-bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">Activity Now</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-green">Live window</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <ActivityButton label="Live packets" value={livePackets} detail="last 15m" tab="Live" icon="live" tone="text-green" onNavigate={onNavigate} />
        <ActivityButton label="Top node" value={topNode?.label ?? "No node"} detail={topNode?.detail ?? "no recent observations"} tab="Nodes" icon="nodes" tone="text-primary" onNavigate={onNavigate} />
        <ActivityButton label="Top observer" value={topObserver?.label ?? "No observer"} detail={topObserver?.detail ?? "no recent observations"} tab="Observers" icon="observers" tone="text-secondary" onNavigate={onNavigate} />
        <ActivityButton label="Busiest IATA" value={topIata?.label ?? "No IATA"} detail={topIata?.detail ?? "no recent observations"} tab="Analytics" icon="analytics" tone="text-warn" onNavigate={onNavigate} />
      </div>
    </section>
  );
}

function EntityRow({ label, value, meta, onClick }: { label: string; value: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-sm border border-border-subtle bg-bg-base/55 px-2.5 py-2 text-left transition-colors hover:border-primary/45 hover:bg-primary/7"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-text-normal">{label}</span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">{meta}</span>
      </span>
      <span className="font-mono text-xs font-bold tabular-nums text-text-bright">{value}</span>
    </button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-bg-surface p-3">
      <h2 className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{title}</h2>
      {children}
    </section>
  );
}

export function HomeView({ wsManager, onNavigate }: { wsManager: WsManager; onNavigate: (tab: PageTab) => void }) {
  useLiveOverview(wsManager);
  const { iatas } = useRegion();
  const home = useStatsHome("24h");
  const data = home.data;
  const overview = data?.overview;
  const live = data?.live;

  const topNodes = data?.topNodes.slice(0, 5) ?? [];
  const topObservers = data?.topObservers.slice(0, 5) ?? [];
  const topIatas = data?.topIatas.slice(0, 6) ?? [];
  const topNode = topNodes[0];
  const topObserver = topObservers[0];
  const topIata = topIatas[0];
  const routeObservationCount = live?.routeMix.reduce((sum, row) => sum + row.count, 0);
  const windowLabel = overview?.windowHours ? `${overview.windowHours}h` : "24h";
  const updateLabel = home.dataUpdatedAt ? `${timeAgoMs(home.dataUpdatedAt)} ago` : "pending";
  const liveState = (live?.observationCount ?? 0) > 0 ? "ACTIVE" : "QUIET";
  const liveTone = liveState === "ACTIVE" ? "text-green" : "text-warn";
  const metrics = [
    { label: "Packets", value: formatCount(overview?.totalPackets), detail: windowLabel },
    { label: "Observations", value: formatCount(overview?.totalObservations), detail: windowLabel },
    { label: "IATAs", value: formatCount(overview?.activeIatas), detail: "active" },
    { label: "Observers", value: formatCount(overview?.activeObservers ?? live?.activeObservers), detail: "active" },
    { label: "Live", value: formatCount(live?.observationCount), detail: "last 15m" },
    { label: "Routes", value: formatCount(routeObservationCount), detail: "observed" },
  ];
  const topNodeActivity = topNode
    ? {
        label: sanitizeDisplayLabel(topNode.nodeName, topNode.nodeId.slice(0, 8)),
        detail: `${formatCount(topNode.observationCount)} obs / ${topNode.iata}`,
      }
    : null;
  const topObserverActivity = topObserver
    ? {
        label: sanitizeDisplayLabel(topObserver.displayName, topObserver.observerId.slice(0, 8)),
        detail: `${formatCount(topObserver.observationCount)} obs / ${topObserver.iata}`,
      }
    : null;
  const topIataActivity = topIata
    ? {
        label: topIata.iata,
        detail: `${formatCount(topIata.count)} obs`,
      }
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base p-3 md:p-4">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3">
        <header className="rounded-sm border border-border bg-bg-surface p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">Beacon Ops</div>
              <h1 className="font-mono text-lg font-semibold uppercase tracking-wider text-text-bright">Home</h1>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end">
              <HeaderChip label="Scope" value={scopeLabel(iatas)} />
              <HeaderChip label="Window" value={windowLabel} />
              <HeaderChip label="Live" value={liveState} tone={liveTone} />
              <HeaderChip label="Refresh" value={updateLabel} />
            </div>
          </div>
        </header>

        {home.isLoading && !data ? (
          <div className="min-h-[360px] rounded-sm border border-border bg-bg-surface">
            <TerminalLoadingState label="QUERYING HOME DATA" detail="PLEASE WAIT" className="h-full" />
          </div>
        ) : home.isError ? (
          <div className="rounded-sm border border-border bg-bg-surface">
            <QueryStatePanel
              {...queryStateForError(home.error, "home dashboard")}
              className="min-h-[320px]"
              onAction={() => void home.refetch()}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {metrics.map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
              <CommandBar onNavigate={onNavigate} />
              <ActivityNow
                livePackets={formatCount(live?.packetCount)}
                topNode={topNodeActivity}
                topObserver={topObserverActivity}
                topIata={topIataActivity}
                onNavigate={onNavigate}
              />
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_0.8fr]">
              <Panel title="Nodes">
                <div className="space-y-1.5">
                  {topNodes.length === 0 ? (
                    <div className="rounded-sm border border-border-subtle bg-bg-base/45 px-2.5 py-2 font-mono text-[11px] text-text-dim">No node activity in this window</div>
                  ) : (
                    topNodes.map((node) => (
                      <EntityRow
                        key={node.nodeId}
                        label={sanitizeDisplayLabel(node.nodeName, node.nodeId.slice(0, 8))}
                        value={formatCount(node.observationCount)}
                        meta={`${node.nodeTypeName} / ${node.iata} / ${timeAgoMs(node.lastHeard)} ago`}
                        onClick={() => onNavigate("Nodes")}
                      />
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="Observers">
                <div className="space-y-1.5">
                  {topObservers.length === 0 ? (
                    <div className="rounded-sm border border-border-subtle bg-bg-base/45 px-2.5 py-2 font-mono text-[11px] text-text-dim">No observer activity in this window</div>
                  ) : (
                    topObservers.map((observer) => (
                      <EntityRow
                        key={observer.observerId}
                        label={sanitizeDisplayLabel(observer.displayName, observer.observerId.slice(0, 8))}
                        value={formatCount(observer.observationCount)}
                        meta={`${observer.observerType ?? "observer"} / ${observer.iata}`}
                        onClick={() => onNavigate("Observers")}
                      />
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="IATAs">
                <div className="grid grid-cols-2 gap-1.5">
                  {topIatas.length === 0 ? (
                    <div className="col-span-2 rounded-sm border border-border-subtle bg-bg-base/45 px-2.5 py-2 font-mono text-[11px] text-text-dim">No IATA activity in this window</div>
                  ) : (
                    topIatas.map((iata) => (
                      <button
                        key={iata.iata}
                        type="button"
                        className="rounded-sm border border-border-subtle bg-bg-base/55 px-2.5 py-2 text-left hover:border-primary/45"
                        onClick={() => onNavigate("Analytics")}
                      >
                        <span className="block font-mono text-sm font-bold text-primary">{iata.iata}</span>
                        <span className="block font-mono text-[10px] text-text-dim">{formatCount(iata.count)} obs</span>
                      </button>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
