import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

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
  flightError: string | null;
  hovered: NetgraphHoverState | null;
  introActive: boolean;
  orbitActive: boolean;
  reducedMotion: boolean;
  selectionActive: boolean;
  selectedRouteId?: number | null;
  onDismissFlightError: () => void;
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
  onOverview: () => void;
  onReplayIntro: () => void;
  onSkipIntro: () => void;
  onToggleOrbit: () => void;
  onTopView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

function ControlButton({ label, onClick, active = false, disabled = false, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`netgraph-control-button inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-bold uppercase tracking-wide shadow-lg backdrop-blur-md transition-colors ${
        active ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-bg-surface/80 text-text-normal hover:border-primary/60 hover:bg-primary/10 hover:text-text-bright"
      } disabled:cursor-not-allowed disabled:opacity-45`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <span className="grid h-4 w-4 place-items-center text-[14px]" aria-hidden="true">{children}</span>;
}

export function NetgraphCanvasHud(props: NetgraphCanvasHudProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [flightGuideOpen, setFlightGuideOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  return (
    <>
      <div className="netgraph-control-rail pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg-surface/55 p-1.5 shadow-2xl backdrop-blur-xl" aria-label="Netgraph camera controls">
        <ControlButton label="Show netgraph overview" onClick={props.onOverview}><Icon>◎</Icon><span className="hidden sm:inline">Overview</span></ControlButton>
        <ControlButton label="Focus selected netgraph item" disabled={!props.selectionActive} onClick={props.onFocusSelected}><Icon>⌖</Icon><span className="hidden sm:inline">Focus</span></ControlButton>
        <ControlButton label={props.orbitActive ? "Pause netgraph orbit" : "Resume netgraph orbit"} active={props.orbitActive} disabled={props.reducedMotion} onClick={props.onToggleOrbit}><Icon>↻</Icon><span className="hidden sm:inline">Orbit</span></ControlButton>
        <div ref={moreRef} className="relative">
          <ControlButton label="More netgraph camera controls" active={moreOpen} onClick={() => setMoreOpen((open) => !open)}><Icon>•••</Icon><span className="hidden sm:inline">More</span></ControlButton>
          {moreOpen && (
            <div className="netgraph-more-menu absolute right-0 grid min-w-48 gap-1 rounded-xl border border-border bg-bg-surface/95 p-2 shadow-2xl backdrop-blur-xl" role="menu" aria-label="More netgraph controls">
              <MenuButton onClick={props.onZoomIn}>Zoom in</MenuButton>
              <MenuButton onClick={props.onZoomOut}>Zoom out</MenuButton>
              <MenuButton onClick={props.onTopView}>Top view</MenuButton>
              <MenuButton disabled={props.selectedRouteId == null} onClick={props.onFlyRoute}>Replay selected route</MenuButton>
              <MenuButton onClick={props.onReplayIntro}>Replay reveal</MenuButton>
              <MenuButton onClick={() => setFlightGuideOpen(true)}>Free flight</MenuButton>
            </div>
          )}
        </div>
      </div>

      {props.introActive && (
        <div className="pointer-events-auto absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-primary/30 bg-bg-surface/75 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted shadow-xl backdrop-blur-lg">
          Mapping the constellation
          <button type="button" className="ml-3 font-bold text-primary hover:text-text-bright" onClick={props.onSkipIntro}>Skip</button>
        </div>
      )}

      {(props.controlMode === "flight" || props.controlMode === "touch-flight") && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/45">
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green" />
          </div>
          <button type="button" className="pointer-events-auto absolute right-3 top-3 z-30 rounded-full border border-primary/40 bg-bg-surface/90 px-3 py-2 font-mono text-[10px] font-bold uppercase text-primary shadow-xl backdrop-blur" onClick={props.onExitFlight}>Exit flight</button>
        </>
      )}

      {props.controlMode === "touch-flight" && (
        <div className="netgraph-touch-controls pointer-events-none absolute inset-x-0 bottom-16 flex items-end justify-between px-3 md:hidden" aria-label="Mobile netgraph flight controls">
          <div className="netgraph-touch-pad netgraph-touch-pad--move pointer-events-auto grid h-20 w-20 place-items-center rounded-full border border-primary/25 bg-bg-surface/25 backdrop-blur-md" role="application" aria-label="Netgraph movement control" onPointerDown={props.onMovePadPointerDown} onPointerMove={props.onMovePadPointerMove} onPointerUp={props.onMovePadPointerEnd} onPointerCancel={props.onMovePadPointerEnd}>
            <span className="h-9 w-9 rounded-full border border-green/45 bg-green/12" />
          </div>
          <div className="netgraph-touch-pad netgraph-touch-pad--look pointer-events-auto grid h-24 w-16 place-items-center rounded-full border border-border bg-bg-surface/20 backdrop-blur-md" role="application" aria-label="Netgraph look control" onPointerDown={props.onLookPadPointerDown} onPointerMove={props.onLookPadPointerMove} onPointerUp={props.onLookPadPointerEnd} onPointerCancel={props.onLookPadPointerEnd}>
            <span className="h-10 w-10 rounded-full border border-primary/40 bg-primary/10" />
          </div>
        </div>
      )}

      {(flightGuideOpen || props.flightError) && (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="presentation">
          <section className="w-full max-w-sm rounded-2xl border border-primary/35 bg-bg-surface/95 p-4 shadow-2xl" role="dialog" aria-modal="true" aria-label="Free flight controls">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Advanced mode</div>
            <h2 className="mt-1 text-lg font-semibold text-text-bright">Free flight</h2>
            {props.flightError ? (
              <p className="mt-2 text-sm text-text-muted">{props.flightError} Orbit controls remain available.</p>
            ) : (
              <p className="mt-2 text-sm text-text-muted">Desktop: click Begin, then use W/A/S/D, Q/E, mouse look, and Escape. Mobile: two touch pads appear after activation.</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase text-text-muted" onClick={() => { setFlightGuideOpen(false); props.onDismissFlightError(); }}>Cancel</button>
              {!props.flightError && <button type="button" className="rounded-full border border-primary/50 bg-primary/15 px-3 py-2 font-mono text-[10px] font-bold uppercase text-primary" onClick={() => { setFlightGuideOpen(false); props.onEnterFlight(); }}>Begin flight</button>}
            </div>
          </section>
        </div>
      )}

      {props.hovered && (
        <div className="netgraph-hover-card pointer-events-none absolute z-10 max-w-64 rounded-sm border border-primary/35 bg-bg-surface/95 px-2.5 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md" style={{ left: `min(${Math.max(12, props.hovered.x + 12)}px, calc(100% - 270px))`, top: Math.max(12, props.hovered.y - 18) }}>
          <div className="truncate font-semibold text-text-bright">{props.hovered.label}</div>
          <div className="mt-1 text-text-muted">{props.hovered.detail}</div>
        </div>
      )}
    </>
  );
}

function MenuButton({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} className="rounded-lg px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase text-text-muted transition-colors hover:bg-primary/10 hover:text-text-bright disabled:opacity-35" onClick={onClick}>{children}</button>;
}
