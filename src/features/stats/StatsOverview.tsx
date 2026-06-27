import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import "../shared/responsive-panels.css";
import type { WsManager } from "../../api/ws-manager";
import { StatsSubHeader } from "./StatsSubHeader";
import { OverviewTab } from "./OverviewTab";
import { RegionsTab } from "./RegionsTab";
import { PayloadsTab } from "./PayloadsTab";
import { HashTab } from "./HashTab";
import { TopologyTab } from "./TopologyTab";
import { PathsTab } from "./PathsTab";
import { ChannelsTab } from "./ChannelsTab";
import { RFHealthTab } from "./RFHealthTab";
import { ObserverTab } from "./ObserverTab";
import { ScopesTab } from "./ScopesTab";
import type { StatsRange, StatsTab } from "./types";

const TABS: StatsTab[] = ["overview", "regions", "payloads", "hash", "topology", "paths", "channels", "rf", "observers", "scopes"];
const RANGES: StatsRange[] = ["24h", "7d", "30d"];

const asTab = (v: string | null): StatsTab => (TABS.includes(v as StatsTab) ? (v as StatsTab) : "overview");
const asRange = (v: string | null): StatsRange => (RANGES.includes(v as StatsRange) ? (v as StatsRange) : "24h");
const parseCompareIds = (v: string | null): string[] =>
  (v ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, 6);

interface StatsOverviewProps {
  wsManager: WsManager;
}

// Stats page shell: a sub-header bar (Mesh / Observer pills + range + live dot) over the active
// sub-tab. Sub-tab, range, and selected observer live in the URL (?statsTab/?range/?observerId) so the
// view is shareable; replace:true keeps it out of history. Queries are cached, so switching is instant.
export function StatsOverview({ wsManager }: StatsOverviewProps) {
  const [params, setParams] = useSearchParams();
  const tab = asTab(params.get("statsTab"));
  const range = asRange(params.get("range"));
  const observerId = params.get("observerId");
  const compareMode = params.get("compare") === "1";
  const compareIds = parseCompareIds(params.get("compareIds"));

  const patch = useCallback(
    (updates: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v == null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const handleTab = useCallback((t: StatsTab) => patch({ statsTab: t }), [patch]);
  const handleRange = useCallback((r: StatsRange) => patch({ range: r }), [patch]);
  const handleSelectObserver = useCallback((id: string) => patch({ statsTab: "observers", observerId: id }), [patch]);
  const handleObserverCompareChange = useCallback(
    (enabled: boolean, ids: string[]) => {
      const nextIds = ids.filter((id, index) => id && ids.indexOf(id) === index).slice(0, 6);
      patch({
        statsTab: "observers",
        compare: enabled ? "1" : null,
        compareIds: enabled && nextIds.length > 0 ? nextIds.join(",") : null,
      });
    },
    [patch],
  );
  const handleDrill = useCallback(
    (targetTab: string, iata?: string) => {
      patch({ tab: targetTab, iata: iata ?? null });
    },
    [patch],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border bg-bg-surface px-3 py-2 md:px-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">Beacon Analytics</div>
            <h1 className="m-0 font-mono text-lg font-semibold uppercase tracking-wider text-text-bright">Analytics</h1>
          </div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {tab} / {range}
          </div>
        </div>
      </header>
      <StatsSubHeader tab={tab} onTabChange={handleTab} range={range} onRangeChange={handleRange} wsManager={wsManager} />
      <div aria-label="Analytics dashboard panels" className="min-h-0 flex-1 overflow-y-auto" role="region" tabIndex={0}>
        {tab === "overview" && <OverviewTab range={range} onSelectObserver={handleSelectObserver} wsManager={wsManager} />}
        {tab === "regions" && <RegionsTab range={range} onDrill={handleDrill} />}
        {tab === "payloads" && <PayloadsTab range={range} />}
        {tab === "hash" && <HashTab range={range} />}
        {tab === "topology" && <TopologyTab range={range} />}
        {tab === "paths" && <PathsTab range={range} />}
        {tab === "channels" && <ChannelsTab range={range} />}
        {tab === "rf" && <RFHealthTab range={range} onSelectObserver={handleSelectObserver} />}
        {tab === "observers" && (
          <ObserverTab
            compareIds={compareIds}
            compareMode={compareMode}
            onCompareChange={handleObserverCompareChange}
            range={range}
            selectedObserverId={observerId}
            onSelectObserver={handleSelectObserver}
            wsManager={wsManager}
          />
        )}
        {tab === "scopes" && <ScopesTab range={range} />}
      </div>
    </div>
  );
}
