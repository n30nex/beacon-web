import type { CSSProperties, ReactNode, RefObject } from "react";
import { formatCount } from "../../lib/formatters";
import { LiveMapStatusOverlay } from "./LiveMapStatusOverlay";

interface LiveMapSurfaceProps {
  activeAnimations: number;
  audioEnabled: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  children: ReactNode;
  colorByHash: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  heatVisible: boolean;
  isDark: boolean;
  isPaging: boolean;
  loadedCount: number;
  mapError: boolean;
  matrixMode: boolean;
  matrixRain: boolean;
  nodesError: boolean;
  nodesUpdatedAt?: number | null;
  onReloadMap: () => void;
  paused: boolean;
  ratePerMin: number;
  realisticPropagation: boolean;
  regionKey: string;
  totalPackets: number;
  visualProfile: {
    effectiveContrast: string;
    effectiveTint: string;
    id: string;
  };
  visualProfileStyle: CSSProperties;
}

function LiveStat({
  className = "",
  label,
  value,
  tone = "primary",
}: {
  className?: string;
  label: string;
  value: string | number;
  tone?: "primary" | "green" | "warn";
}) {
  const toneClass = tone === "green" ? "text-green" : tone === "warn" ? "text-warn" : "text-primary";
  return (
    <div className={`crt-float-panel live-signal-stat min-w-18 rounded-sm border border-border px-3 py-2 ${className}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`font-mono text-lg leading-none font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function LiveMapSurface({
  activeAnimations,
  audioEnabled,
  canvasRef,
  children,
  colorByHash,
  containerRef,
  heatVisible,
  isDark,
  isPaging,
  loadedCount,
  mapError,
  matrixMode,
  matrixRain,
  nodesError,
  nodesUpdatedAt,
  onReloadMap,
  paused,
  ratePerMin,
  realisticPropagation,
  regionKey,
  totalPackets,
  visualProfile,
  visualProfileStyle,
}: LiveMapSurfaceProps) {
  return (
    <div
      className="map-profile-scope live-map-shell relative flex flex-1 min-h-0 overflow-hidden bg-bg-base"
      data-map-profile={visualProfile.id}
      data-map-contrast={visualProfile.effectiveContrast}
      data-map-tint={visualProfile.effectiveTint}
      style={visualProfileStyle}
    >
      <div ref={containerRef} data-dark={isDark} className={`flex-1 min-w-0 ${matrixMode ? "live-map-matrix" : ""}`} />
      <canvas ref={canvasRef} className="live-map-canvas absolute inset-0 z-[5] h-full w-full pointer-events-none" aria-hidden="true" />
      {matrixMode && <div className="live-matrix-overlay absolute inset-0 pointer-events-none z-[6]" aria-hidden="true" />}

      <div className="live-signal-bar pointer-events-none absolute top-12 left-2 right-2 z-10 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1.5 md:top-3 md:left-3 md:right-[360px] md:max-w-[calc(100vw-24px)] md:gap-2">
        <div className="crt-float-panel live-signal-chip pointer-events-auto flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 md:px-3 md:py-2">
          <span className={`crt-glow-dot w-2.5 h-2.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          <h1 className="m-0 font-mono text-xs font-semibold tracking-wider text-text-bright">Live</h1>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{paused ? "Paused" : "Stream"}</span>
          <span className="live-signal-region hidden font-mono text-[11px] text-text-dim sm:inline">{regionKey}</span>
          {realisticPropagation && <span className="live-mode-token hidden font-mono text-[10px] text-primary sm:inline">PACE</span>}
          {heatVisible && <span className="live-mode-token hidden font-mono text-[10px] text-warn sm:inline">HEAT</span>}
          {colorByHash && <span className="live-mode-token hidden font-mono text-[10px] text-secondary sm:inline">COLOR</span>}
          {matrixMode && <span className="live-mode-token hidden font-mono text-[10px] text-primary sm:inline">CRT</span>}
          {matrixRain && <span className="live-mode-token hidden font-mono text-[10px] text-primary sm:inline">BYTES</span>}
          {audioEnabled && <span className="live-mode-token hidden font-mono text-[10px] text-primary sm:inline">AUDIO</span>}
        </div>
        <LiveStat className="hidden sm:block" label="Packets" value={formatCount(totalPackets)} tone="green" />
        <LiveStat className="hidden sm:block" label="Rate" value={`${ratePerMin}/m`} />
        <LiveStat className="hidden sm:block" label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "primary"} />
      </div>

      <div aria-live="polite" aria-label="Node loading progress" className={`crt-float-panel pointer-events-none absolute bottom-20 left-3 z-10 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${nodesError ? "border-danger/40 text-danger" : "border-border text-text-muted"}`}>
        Nodes {loadedCount.toLocaleString()} / {isPaging ? "…" : loadedCount.toLocaleString()}{nodesError ? " degraded" : ""}{nodesUpdatedAt ? ` · ${new Date(nodesUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
      </div>
      {children}
      {mapError && <LiveMapStatusOverlay onReload={onReloadMap} />}
    </div>
  );
}
