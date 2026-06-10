import type { WsManager } from "../../api/ws-manager";
import { useWsStatus } from "../../hooks/useWsStatus";
import { Segmented } from "./Segmented";
import type { StatsRange, StatsTab } from "./types";

function MeshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="3" cy="3" r="1.6" />
      <circle cx="11" cy="4" r="1.6" />
      <circle cx="7" cy="11" r="1.6" />
      <path d="M4.3 3.6 9.7 4.4M3.6 4.4 6.4 9.6M10.4 5.4 7.7 9.7" strokeOpacity="0.7" />
    </svg>
  );
}

function ObserverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="7" cy="9.5" r="1.4" />
      <path d="M7 8V4M4.5 6.5a3.5 3.5 0 0 1 5 0M2.7 4.7a6 6 0 0 1 8.6 0" strokeOpacity="0.85" />
    </svg>
  );
}

const TAB_OPTIONS = [
  { value: "mesh", label: "Mesh", icon: <MeshIcon /> },
  { value: "observer", label: "Observer", icon: <ObserverIcon /> },
];

const RANGE_OPTIONS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

interface Props {
  tab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  wsManager: WsManager;
}

export function StatsSubHeader({ tab, onTabChange, range, onRangeChange, wsManager }: Props) {
  const { status } = useWsStatus(wsManager);
  const live = status === "connected";
  const connecting = status === "connecting";
  const dotColor = live ? "bg-green" : connecting ? "bg-warn" : "bg-text-dim";
  const label = live ? "LIVE" : connecting ? "LIVE" : "OFFLINE";
  const labelColor = live ? "text-green" : connecting ? "text-warn" : "text-text-dim";

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-surface px-4 py-2.5">
      <Segmented
        options={TAB_OPTIONS}
        value={tab}
        onChange={(v) => onTabChange(v as StatsTab)}
        ariaLabel="Stats section"
        size="md"
      />
      <div className="flex items-center gap-3">
        <Segmented
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => onRangeChange(v as StatsRange)}
          ariaLabel="Time range"
        />
        <div className={`flex items-center gap-1.5 font-mono text-[11px] font-semibold ${labelColor}`}>
          <span className={`inline-block h-[7px] w-[7px] rounded-full ${dotColor} ${live ? "shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-green)_18%,transparent)]" : ""}`} />
          {label}
        </div>
      </div>
    </div>
  );
}
