import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { NetgraphCameraMode } from "./netgraph-model";

export type NetgraphControlMode = NetgraphCameraMode;

export interface NetgraphHoverState {
  label: string;
  detail: string;
  x: number;
  y: number;
  kind: "node" | "route";
}

interface NetgraphCanvasHudProps {
  controlMode: NetgraphControlMode;
  hovered: NetgraphHoverState | null;
  orbitActive: boolean;
  reducedMotion: boolean;
  selectedRouteId?: number | null;
  onEnterFlight: () => void;
  onExitFlight: () => void;
  onFocusSelected: () => void;
  onFlyRoute: () => void;
  onMovePadPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMovePadPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMovePadPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookPadPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookPadPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookPadPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onReset: () => void;
  onToggleOrbit: () => void;
  onTopView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

function CanvasControlButton({ label, onClick, active = false, disabled = false, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      className={`netgraph-control-button grid h-8 w-8 place-items-center rounded-sm border font-mono text-sm font-bold shadow-lg backdrop-blur-md transition-colors md:h-9 md:w-9 ${
        active ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-bg-surface/80 text-text-normal hover:border-primary/60 hover:bg-primary/10 hover:text-text-bright"
      } disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-bg-surface/55 disabled:text-text-dim/45`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TargetIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.35-5.65" />
      <path d="M4 4v6h6" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12c0-4 4-7 8-7 3.5 0 6.5 2.2 7.6 5.3" />
      <path d="m20 4-.2 6.2-6.2-.2" />
      <path d="M20 12c0 4-4 7-8 7-3.5 0-6.5-2.2-7.6-5.3" />
      <path d="m4 20 .2-6.2 6.2.2" />
    </svg>
  );
}

function TopViewIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 8l8 5 8-5-8-5Z" />
      <path d="M4 14l8 5 8-5" />
    </svg>
  );
}

function RouteFlyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 17c4-8 8 6 16-8" />
      <path d="m16 7 4 2-2 4" />
      <circle cx="5" cy="17" r="1.5" />
      <circle cx="19" cy="9" r="1.5" />
    </svg>
  );
}

export function NetgraphCanvasHud({
  controlMode,
  hovered,
  orbitActive,
  reducedMotion,
  selectedRouteId,
  onEnterFlight,
  onExitFlight,
  onFocusSelected,
  onFlyRoute,
  onLookPadPointerDown,
  onLookPadPointerEnd,
  onLookPadPointerMove,
  onMovePadPointerDown,
  onMovePadPointerEnd,
  onMovePadPointerMove,
  onReset,
  onToggleOrbit,
  onTopView,
  onZoomIn,
  onZoomOut,
}: NetgraphCanvasHudProps) {
  return (
    <>
      <div className={`netgraph-control-rail pointer-events-auto absolute right-2 top-2 z-20 grid grid-cols-2 gap-1.5 transition-opacity md:right-3 md:top-3 md:grid-cols-1 ${controlMode === "touch-flight" ? "opacity-35 md:opacity-100" : "opacity-100"}`} aria-label="Netgraph camera controls">
        <CanvasControlButton label={controlMode === "flight" ? "Exit flight mode" : "Enter flight mode"} onClick={controlMode === "flight" ? onExitFlight : onEnterFlight}>
          <span className="text-[9px]">F</span>
        </CanvasControlButton>
        <CanvasControlButton label="Zoom into netgraph" onClick={onZoomIn}>
          +
        </CanvasControlButton>
        <CanvasControlButton label="Zoom out of netgraph" onClick={onZoomOut}>
          -
        </CanvasControlButton>
        <CanvasControlButton label="Focus selected netgraph item" onClick={onFocusSelected}>
          <TargetIcon />
        </CanvasControlButton>
        <CanvasControlButton label="Fly selected route" disabled={selectedRouteId == null} onClick={onFlyRoute}>
          <RouteFlyIcon />
        </CanvasControlButton>
        <CanvasControlButton label="Switch to top netgraph view" onClick={onTopView}>
          <TopViewIcon />
        </CanvasControlButton>
        <CanvasControlButton label={orbitActive ? "Pause netgraph orbit" : "Resume netgraph orbit"} active={orbitActive} disabled={reducedMotion} onClick={onToggleOrbit}>
          <OrbitIcon />
        </CanvasControlButton>
        <CanvasControlButton label="Reset netgraph camera" onClick={onReset}>
          <ResetIcon />
        </CanvasControlButton>
      </div>
      {controlMode === "flight" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/45 shadow-[0_0_18px_rgba(122,183,255,0.35)]">
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green shadow-[0_0_12px_rgba(84,225,166,0.85)]" />
            <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-primary/70" />
            <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-primary/70" />
            <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-primary/70" />
            <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-primary/70" />
          </div>
          <div className="netgraph-flight-badge pointer-events-none absolute left-3 top-3 z-20 rounded-sm border border-primary/30 bg-bg-surface/80 px-2 py-1 font-mono text-[10px] font-bold uppercase text-primary shadow-lg backdrop-blur">
            Flight
          </div>
        </>
      )}
      <div className="netgraph-touch-controls pointer-events-none absolute inset-x-0 bottom-2 z-[8] flex items-end justify-between px-2.5 md:hidden" aria-label="Mobile netgraph flight controls">
        <div
          className={`netgraph-touch-pad netgraph-touch-pad--move pointer-events-auto grid h-20 w-20 place-items-center rounded-full border border-primary/25 bg-bg-surface/25 shadow-[0_0_20px_rgba(122,183,255,0.16)] backdrop-blur-md transition-opacity ${controlMode === "touch-flight" ? "opacity-100" : "opacity-40"}`}
          role="application"
          aria-label="Netgraph movement control"
          onPointerDown={onMovePadPointerDown}
          onPointerMove={onMovePadPointerMove}
          onPointerUp={onMovePadPointerEnd}
          onPointerCancel={onMovePadPointerEnd}
        >
          <span className="h-9 w-9 rounded-full border border-green/45 bg-green/12 shadow-[0_0_16px_rgba(84,225,166,0.24)]" />
        </div>
        <div
          className={`netgraph-touch-pad netgraph-touch-pad--look pointer-events-auto grid h-24 w-16 place-items-center rounded-full border border-border bg-bg-surface/20 shadow-[0_0_20px_rgba(186,102,255,0.1)] backdrop-blur-md transition-opacity ${controlMode === "touch-flight" ? "opacity-100" : "opacity-40"}`}
          role="application"
          aria-label="Netgraph look control"
          onPointerDown={onLookPadPointerDown}
          onPointerMove={onLookPadPointerMove}
          onPointerUp={onLookPadPointerEnd}
          onPointerCancel={onLookPadPointerEnd}
        >
          <span className="h-10 w-10 rounded-full border border-primary/40 bg-primary/10 shadow-[0_0_16px_rgba(122,183,255,0.2)]" />
        </div>
      </div>
      {hovered && (
        <div
          className="netgraph-hover-card pointer-events-none absolute z-10 max-w-64 rounded-sm border border-primary/35 bg-bg-surface/95 px-2.5 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md"
          style={{
            left: `min(${Math.max(12, hovered.x + 12)}px, calc(100% - 270px))`,
            top: Math.max(12, hovered.y - 18),
          }}
        >
          <div className="truncate font-semibold text-text-bright">{hovered.label}</div>
          <div className="mt-1 text-text-muted">{hovered.detail}</div>
        </div>
      )}
    </>
  );
}
