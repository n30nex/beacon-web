import { BottomSheet } from "../../components/BottomSheet";
import {
  NETGRAPH_ROUTE_LIMITS,
  type NetgraphLayoutMode,
  type NetgraphQualityPreference,
  type NetgraphRouteLimit,
} from "./netgraph-model";
import { NETGRAPH_LAYOUT_CONFIGS, NETGRAPH_QUALITY_CONFIGS } from "./netgraph-settings-config";

const LAYOUT_ORDER: NetgraphLayoutMode[] = ["geo", "galaxy"];
const QUALITY_ORDER: NetgraphQualityPreference[] = ["cinematic", "low-power"];

export function NetgraphSettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M20 12.6v-1.2a8 8 0 0 0-.8-3.4l-1-.55 1.3-2.25-1.7-1.7-2.25 1.3-.55-1a8 8 0 0 0-3.4-.8h-1.2l-.55 1-2.25-1.3-1.7 1.7 1.3 2.25-1 .55a8 8 0 0 0-.8 3.4v1.2l1 .55-1.3 2.25 1.7 1.7 2.25-1.3.55 1a8 8 0 0 0 3.4.8h1.2l.55-1 2.25 1.3 1.7-1.7-1.3-2.25 1-.55a8 8 0 0 0 .8-3.4Z" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function GalaxyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2.2" />
      <path d="M4 12c2.1-4.2 13.8-5.2 16-1.2" />
      <path d="M20 12c-2.1 4.2-13.8 5.2-16 1.2" />
      <path d="M8 5.2c4.6.4 8.8 5.2 8 13.6" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.2 3.7 4.9 3.7 8S14.5 17.8 12 20M12 4c-2.5 2.2-3.7 4.9-3.7 8S9.5 17.8 12 20" />
    </svg>
  );
}

function CinematicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z" />
      <path d="m18.5 14 .7 2.2 2.1 1.1-2.1 1.1-.7 2.1-.7-2.1-2.1-1.1 2.1-1.1.7-2.2Z" />
    </svg>
  );
}

function LowPowerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 5 13h6l-1 9 9-13h-6l1-7Z" />
    </svg>
  );
}

function RouteLimitRange({ value, onChange }: { value: NetgraphRouteLimit; onChange: (value: NetgraphRouteLimit) => void }) {
  return (
    <div className="space-y-2 rounded-sm border border-border bg-bg-base/90 p-2">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase text-text-muted">
        <span>Route limit</span>
        <span className="text-text-bright">{value.toLocaleString()} max routes</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Netgraph route limit">
        {NETGRAPH_ROUTE_LIMITS.map((limit) => (
          <button
            key={limit}
            type="button"
            aria-pressed={limit === value}
            className={`rounded-sm border px-2 py-1.5 font-mono text-[10px] font-semibold tabular-nums transition-colors ${
              limit === value ? "border-primary/45 bg-primary/15 text-primary" : "border-border-subtle bg-bg-base/70 text-text-muted hover:text-text-bright"
            }`}
            onClick={() => onChange(limit)}
          >
            {limit.toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutPicker({ mode, onChange }: { mode: NetgraphLayoutMode; onChange: (mode: NetgraphLayoutMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Netgraph layout">
      {LAYOUT_ORDER.map((item) => {
        const config = NETGRAPH_LAYOUT_CONFIGS[item];
        const active = item === mode;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            className={`min-h-20 rounded-sm border px-2.5 py-2 text-left transition-colors ${
              active ? "border-primary/50 bg-primary/12 text-primary shadow-[0_0_18px_rgba(122,183,255,0.12)]" : "border-border-subtle bg-bg-base/70 text-text-muted hover:text-text-bright"
            }`}
            onClick={() => onChange(item)}
          >
            <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase">
              {item === "geo" ? <GlobeIcon /> : <GalaxyIcon />}
              {config.label}
            </span>
            <span className="mt-2 block font-mono text-[9px] uppercase text-text-dim">{config.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

function QualityPicker({ mode, onChange }: { mode: NetgraphQualityPreference; onChange: (mode: NetgraphQualityPreference) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Netgraph quality">
      {QUALITY_ORDER.map((item) => {
        const config = NETGRAPH_QUALITY_CONFIGS[item];
        const active = item === mode;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            className={`min-h-16 rounded-sm border px-2.5 py-2 text-left transition-colors ${
              active ? "border-primary/50 bg-primary/12 text-primary" : "border-border-subtle bg-bg-base/70 text-text-muted hover:text-text-bright"
            }`}
            onClick={() => onChange(item)}
          >
            <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase">
              {item === "cinematic" ? <CinematicIcon /> : <LowPowerIcon />}
              {config.label}
            </span>
            <span className="mt-1.5 block font-mono text-[9px] uppercase text-text-dim">{config.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NetgraphSettingsPanel({
  open,
  isMobile,
  routeLimit,
  layoutMode,
  qualityPreference,
  liveGuideEnabled,
  showDataQuality,
  onChangeRouteLimit,
  onChangeLayoutMode,
  onChangeQualityPreference,
  onToggleLiveGuide,
  onToggleDataQuality,
  onClose,
}: {
  open: boolean;
  isMobile: boolean;
  routeLimit: NetgraphRouteLimit;
  layoutMode: NetgraphLayoutMode;
  qualityPreference: NetgraphQualityPreference;
  liveGuideEnabled: boolean;
  showDataQuality: boolean;
  onChangeRouteLimit: (limit: NetgraphRouteLimit) => void;
  onChangeLayoutMode: (mode: NetgraphLayoutMode) => void;
  onChangeQualityPreference: (mode: NetgraphQualityPreference) => void;
  onToggleLiveGuide: () => void;
  onToggleDataQuality: () => void;
  onClose: () => void;
}) {
  const dataQualityActive = showDataQuality;
  const panelContents = (
    <div className="space-y-2 p-3">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">Layout</div>
      <LayoutPicker mode={layoutMode} onChange={onChangeLayoutMode} />
      <div className="pt-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-text-dim">Quality</div>
      <QualityPicker mode={qualityPreference} onChange={onChangeQualityPreference} />
      <RouteLimitRange value={routeLimit} onChange={onChangeRouteLimit} />
      <button
        type="button"
        aria-pressed={dataQualityActive}
        className={`flex w-full items-center justify-between gap-3 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase transition-colors ${
          dataQualityActive
            ? "border-primary/45 bg-primary/10 text-primary"
            : "border-border bg-bg-base/90 text-text-muted hover:text-text-normal disabled:text-text-dim/45"
        }`}
        onClick={onToggleDataQuality}
      >
        <span>Data quality overlay</span>
        <span className="text-text-dim">{dataQualityActive ? "On" : "Off"}</span>
      </button>
      <button
        type="button"
        aria-pressed={liveGuideEnabled}
        className={`flex w-full items-center justify-between gap-3 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase transition-colors ${
          liveGuideEnabled ? "border-green/45 bg-green/10 text-green" : "border-border bg-bg-base/90 text-text-muted hover:text-text-normal"
        }`}
        onClick={onToggleLiveGuide}
      >
        <span>Live route suggestions</span>
        <span className="text-text-dim">{liveGuideEnabled ? "On" : "Off"}</span>
      </button>
    </div>
  );

  if (isMobile) {
    if (!open) return null;
    return (
      <BottomSheet label="Netgraph settings" onClose={onClose}>
        <div className="mb-2 flex items-center justify-between border-b border-border px-3 py-2">
          <div className="font-mono text-[11px] font-semibold uppercase text-text-muted">Settings</div>
          <button type="button" aria-label="Close netgraph settings" title="Close settings" className="grid h-8 w-8 place-items-center rounded-sm border border-border bg-bg-base/90 text-text-muted hover:text-text-bright" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20">{panelContents}</div>
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-0 bg-black/35 pointer-events-auto md:block" onClick={onClose} />
      <aside
        className="netgraph-settings-sheet pointer-events-auto absolute right-2 top-3 z-40 flex flex-col overflow-hidden rounded-sm border border-border bg-bg-surface/95 shadow-2xl backdrop-blur md:right-3 md:top-3"
        aria-label="Netgraph settings"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-3 py-2">
          <div className="font-mono text-[10px] font-semibold uppercase text-text-muted">Settings</div>
          <button type="button" aria-label="Close netgraph settings" title="Close settings" className="grid h-8 w-8 place-items-center rounded-sm border border-border bg-bg-base/90 text-text-muted hover:text-text-bright" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {panelContents}
        </div>
      </aside>
    </div>
  );
}
