import { BottomSheet } from "../../components/BottomSheet";
import {
  NETGRAPH_ROUTE_LIMITS,
  type NetgraphRouteLimit,
  type NetgraphVisualMode,
} from "./netgraph-model";
import { NETGRAPH_VISUAL_MODE_CONFIGS } from "./netgraph-settings-config";

const VISUAL_MODE_ORDER: NetgraphVisualMode[] = ["galaxy", "low-power"];

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

function VisualModePicker({ mode, onChange }: { mode: NetgraphVisualMode; onChange: (mode: NetgraphVisualMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Netgraph visual mode">
      {VISUAL_MODE_ORDER.map((item) => {
        const config = NETGRAPH_VISUAL_MODE_CONFIGS[item];
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
              {item === "galaxy" ? <GalaxyIcon /> : <LowPowerIcon />}
              {config.label}
            </span>
            <span className="mt-2 block font-mono text-[9px] uppercase text-text-dim">{config.detail}</span>
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
  visualMode,
  showDataQuality,
  onChangeRouteLimit,
  onChangeVisualMode,
  onToggleDataQuality,
  onClose,
}: {
  open: boolean;
  isMobile: boolean;
  routeLimit: NetgraphRouteLimit;
  visualMode: NetgraphVisualMode;
  showDataQuality: boolean;
  onChangeRouteLimit: (limit: NetgraphRouteLimit) => void;
  onChangeVisualMode: (mode: NetgraphVisualMode) => void;
  onToggleDataQuality: () => void;
  onClose: () => void;
}) {
  const dataQualityActive = visualMode === "galaxy" && showDataQuality;
  const panelContents = (
    <div className="space-y-2 p-3">
      <VisualModePicker mode={visualMode} onChange={onChangeVisualMode} />
      <RouteLimitRange value={routeLimit} onChange={onChangeRouteLimit} />
      <button
        type="button"
        aria-pressed={dataQualityActive}
        disabled={visualMode === "low-power"}
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
        className="pointer-events-auto absolute right-2 top-3 z-40 flex max-h-[calc(100%-1.5rem)] w-[min(360px,calc(100%-1.2rem))] flex-col overflow-hidden rounded-sm border border-border bg-bg-surface/95 shadow-2xl backdrop-blur md:right-3 md:top-3"
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
