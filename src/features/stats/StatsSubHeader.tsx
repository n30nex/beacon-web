import type { WsManager } from "../../api/ws-manager";
import { useWsStatus } from "../../hooks/useWsStatus";
import { Segmented } from "./Segmented";
import type { StatsRange, StatsTab } from "./types";

function OverviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 10.5h10M2 7h10M2 3.5h10" />
      <path d="M4 2v10M8.5 2v10" strokeOpacity="0.7" />
    </svg>
  );
}

function RegionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 3.2 5.3 2l3.4 1.2L12 2v8.8L8.7 12l-3.4-1.2L2 12z" />
      <path d="M5.3 2v8.8M8.7 3.2V12" strokeOpacity="0.7" />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="2.4" cy="10.5" r="1.1" />
      <circle cx="6.8" cy="3.2" r="1.1" />
      <circle cx="11.4" cy="8.8" r="1.1" />
      <path d="M3.2 9.6 6 4.2M7.7 4.1l2.9 3.7" strokeOpacity="0.85" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M1.5 7h2.2l1-3.7 2.1 7.5L8.2 7h4.3" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M4.6 1.8 3.7 12.2M10.3 1.8 9.4 12.2M2 5h10M1.5 9h10" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 4.5h7.5a2.5 2.5 0 0 1 0 5H7L4.2 12v-2.5H2z" />
      <path d="M4 6.5h5M4 8h3" strokeOpacity="0.75" />
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
  { value: "overview", label: "Overview", icon: <OverviewIcon /> },
  { value: "regions", label: "Regions", icon: <RegionIcon /> },
  { value: "payloads", label: "Payloads", icon: <PulseIcon /> },
  { value: "hash", label: "Hash", icon: <HashIcon /> },
  { value: "topology", label: "Topology", icon: <RegionIcon /> },
  { value: "paths", label: "Paths", icon: <PathIcon /> },
  { value: "channels", label: "Channels", icon: <ChannelIcon /> },
  { value: "rf", label: "RF", icon: <PulseIcon /> },
  { value: "observers", label: "Observers", icon: <ObserverIcon /> },
  { value: "scopes", label: "Scopes", icon: <OverviewIcon /> },
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
    <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-bg-surface px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
      <Segmented
        options={TAB_OPTIONS}
        value={tab}
        onChange={(v) => onTabChange(v as StatsTab)}
        ariaLabel="Stats section"
        size="md"
        className="max-w-full overflow-x-auto"
      />
      <div className="flex items-center justify-between gap-3 lg:justify-end">
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
