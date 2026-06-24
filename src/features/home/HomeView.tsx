import { useMemo, type ReactNode } from "react";
import { NavIcon } from "../../components/NavIcon";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useStatsHome } from "../stats/useStats";
import { useLiveOverview } from "../stats/useLiveStats";
import { formatCount, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import type { PageTab } from "../../lib/navigation";
import type { WsManager } from "../../api/ws-manager";

const HOME_SHORTCUTS: PageTab[] = ["Packets", "Map", "Live", "Channels", "Nodes", "Observers", "Analytics", "Netgraph", "Routes", "Traces", "System"];

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

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-sm border border-border bg-bg-surface px-3 py-2.5">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-bright">{value}</div>
      {detail && <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">{detail}</div>}
    </div>
  );
}

function ShortcutButton({ tab, onNavigate }: { tab: PageTab; onNavigate: (tab: PageTab) => void }) {
  return (
    <button
      type="button"
      aria-label={tab}
      className="crt-panel flex aspect-square min-h-20 flex-col items-center justify-center gap-2 rounded-sm border border-border bg-bg-surface text-text-muted transition-colors hover:border-primary/55 hover:bg-primary/8 hover:text-text-bright"
      onClick={() => onNavigate(tab)}
    >
      <NavIcon name={ICON_FOR_TAB[tab]} size={26} />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">{tab}</span>
    </button>
  );
}

function EntityRow({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-sm border border-border-subtle bg-bg-base/55 px-2.5 py-2">
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-text-normal">{label}</span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-text-dim">{meta}</span>
      </span>
      <span className="font-mono text-xs font-bold tabular-nums text-text-bright">{value}</span>
    </div>
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
  const home = useStatsHome("24h");
  const data = home.data;
  const overview = data?.overview;
  const live = data?.live;

  const metrics = useMemo(
    () => [
      { label: "Packets", value: formatCount(overview?.totalPackets), detail: "24h" },
      { label: "Observations", value: formatCount(overview?.totalObservations), detail: "24h" },
      { label: "IATAs", value: formatCount(overview?.activeIatas), detail: "active" },
      { label: "Observers", value: formatCount(overview?.activeObservers ?? live?.activeObservers), detail: "active" },
      { label: "Live", value: formatCount(live?.observationCount), detail: "last 15m" },
      { label: "Routes", value: formatCount(live?.routeMix.reduce((sum, row) => sum + row.count, 0)), detail: "observed" },
    ],
    [live?.activeObservers, live?.observationCount, live?.routeMix, overview?.activeIatas, overview?.activeObservers, overview?.totalObservations, overview?.totalPackets],
  );

  const topNodes = data?.topNodes.slice(0, 5) ?? [];
  const topObservers = data?.topObservers.slice(0, 5) ?? [];
  const topIatas = data?.topIatas.slice(0, 6) ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base p-3 md:p-4">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3">
        <header className="flex flex-col gap-1 rounded-sm border border-border bg-bg-surface p-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">Beacon</div>
          <h1 className="font-mono text-lg font-semibold uppercase tracking-wider text-text-bright">Home</h1>
        </header>

        {home.isLoading && !data ? (
          <div className="min-h-[360px] rounded-sm border border-border bg-bg-surface">
            <TerminalLoadingState label="QUERYING HOME DATA" detail="PLEASE WAIT" className="h-full" />
          </div>
        ) : home.isError ? (
          <div className="rounded-sm border border-border bg-bg-surface p-6 font-mono text-sm text-danger">
            Home data unavailable.
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {metrics.map((metric) => (
                <MetricCard key={metric.label} {...metric} />
              ))}
            </div>

            <div className="hidden gap-2 md:grid md:grid-cols-5 lg:grid-cols-10">
              {HOME_SHORTCUTS.map((tab) => (
                <ShortcutButton key={tab} tab={tab} onNavigate={onNavigate} />
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_0.8fr]">
              <Panel title="Nodes">
                <div className="space-y-1.5">
                  {topNodes.length === 0 ? (
                    <div className="font-mono text-[11px] text-text-dim">No data</div>
                  ) : (
                    topNodes.map((node) => (
                      <EntityRow
                        key={node.nodeId}
                        label={sanitizeDisplayLabel(node.nodeName, node.nodeId.slice(0, 8))}
                        value={formatCount(node.observationCount)}
                        meta={`${node.nodeTypeName} / ${node.iata} / ${timeAgoMs(node.lastHeard)} ago`}
                      />
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="Observers">
                <div className="space-y-1.5">
                  {topObservers.length === 0 ? (
                    <div className="font-mono text-[11px] text-text-dim">No data</div>
                  ) : (
                    topObservers.map((observer) => (
                      <EntityRow
                        key={observer.observerId}
                        label={sanitizeDisplayLabel(observer.displayName, observer.observerId.slice(0, 8))}
                        value={formatCount(observer.observationCount)}
                        meta={`${observer.observerType ?? "observer"} / ${observer.iata}`}
                      />
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="IATAs">
                <div className="grid grid-cols-2 gap-1.5">
                  {topIatas.length === 0 ? (
                    <div className="font-mono text-[11px] text-text-dim">No data</div>
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
