import { memo, type CSSProperties } from "react";
import { formatCount } from "../../lib/formatters";

export type LiveIconName = "audio" | "bytes" | "clear" | "color" | "crt" | "feed" | "heat" | "pace" | "pause" | "play" | "settings" | "trail";

type LiveControlQuality = "high" | "balanced" | "constrained";

export function LiveControlButton({
  active,
  className = "",
  compact = false,
  danger,
  icon,
  label,
  onClick,
  title,
}: {
  active?: boolean;
  className?: string;
  compact?: boolean;
  danger?: boolean;
  icon?: LiveIconName;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  const activeClass = danger
    ? "text-danger border-danger/35 bg-danger/8 hover:bg-danger/12"
    : active
      ? "text-primary border-primary/35 bg-primary/10 hover:bg-primary/15"
      : "text-text-normal border-border bg-bg-raised hover:text-text-bright hover:border-primary/35";

  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors md:text-[11px] ${
        compact ? "h-8 w-8 px-0" : "h-9 px-2 md:px-2.5"
      } ${activeClass} ${className}`}
      onClick={onClick}
      aria-pressed={active}
      title={title ?? label}
    >
      {icon && <LiveIcon name={icon} />}
      <span className={icon ? (compact ? "sr-only" : "hidden sm:inline") : ""}>{label}</span>
    </button>
  );
}

function LiveIcon({ name }: { name: LiveIconName }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "play":
      return <svg {...common}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
    case "pause":
      return <svg {...common}><path d="M8 5v14M16 5v14" /></svg>;
    case "trail":
      return <svg {...common}><path d="M4 17c4-7 8 2 16-8" /><path d="M4 17h.01M12 13h.01M20 9h.01" /></svg>;
    case "pace":
      return <svg {...common}><path d="M4 12h3l2-5 4 10 2-5h5" /><circle cx="12" cy="12" r="9" /></svg>;
    case "heat":
      return <svg {...common}><path d="M12 3c2 3-1 4 1 7 1.5 2.2 4 2.5 4 6a5 5 0 0 1-10 0c0-2.5 1.8-4.1 3.3-5.6C11.6 9 12.5 7.2 12 3z" /></svg>;
    case "color":
      return <svg {...common}><circle cx="12" cy="12" r="7" /><path d="M12 5v14M5 12h14" /></svg>;
    case "settings":
      return <svg {...common}><path d="M4 7h10M4 17h10" /><circle cx="17" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>;
    case "feed":
      return <svg {...common}><path d="M5 6h14M5 12h14M5 18h9" /></svg>;
    case "clear":
      return <svg {...common}><path d="M5 6h14M9 6v12m6-12v12M8 6l1-2h6l1 2M6 6l1 14h10l1-14" /></svg>;
    case "crt":
      return <svg {...common}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case "bytes":
      return <svg {...common}><path d="M7 5v14M17 5v14M4 8h6M4 16h6M14 12h6" /></svg>;
    case "audio":
      return <svg {...common}><path d="M5 14H3v-4h2l4-4v12z" /><path d="M14 9c1 1 1 5 0 6M17 7c2 2 2 8 0 10" /></svg>;
  }
}

export const LiveControlDock = memo(function LiveControlDock({
  activeAnimations,
  colorByHash,
  compact,
  consoleOpen,
  heatVisible,
  laggedCount,
  onToggleColorByHash,
  onToggleConsole,
  onToggleHeat,
  onTogglePaused,
  onTogglePropagation,
  onToggleSettings,
  onToggleTrails,
  paused,
  quality,
  queuedCount,
  ratePerMin,
  realisticPropagation,
  settingsOpen,
  style,
  totalPackets,
  trails,
  visualDroppedCount,
  visualQueueSize,
}: {
  activeAnimations: number;
  colorByHash: boolean;
  compact: boolean;
  consoleOpen: boolean;
  heatVisible: boolean;
  laggedCount: number;
  onToggleColorByHash: () => void;
  onToggleConsole: () => void;
  onToggleHeat: () => void;
  onTogglePaused: () => void;
  onTogglePropagation: () => void;
  onToggleSettings: () => void;
  onToggleTrails: () => void;
  paused: boolean;
  quality: LiveControlQuality;
  queuedCount: number;
  ratePerMin: number;
  realisticPropagation: boolean;
  settingsOpen: boolean;
  style: CSSProperties;
  totalPackets: number;
  trails: boolean;
  visualDroppedCount: number;
  visualQueueSize: number;
}) {
  if (compact) {
    return (
      <div className="crt-float-panel live-command-dock absolute z-30 flex items-center rounded-sm border border-border" style={style}>
        <LiveControlButton compact icon={paused ? "play" : "pause"} label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded border px-2 font-mono text-[10px] font-semibold tracking-wider ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`crt-glow-dot h-1.5 w-1.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          {paused ? "PAUSE" : "RUN"}
        </div>
        <LiveControlButton compact icon="trail" label="Trails" active={trails} onClick={onToggleTrails} title="Toggle persistent map trails" />
        <LiveControlButton compact icon="pace" label="Pace" active={realisticPropagation} onClick={onTogglePropagation} title="Pace repeated observations before rendering" />
        <LiveControlButton compact icon="heat" label="Heat" active={heatVisible} onClick={onToggleHeat} title="Toggle live activity heat overlay" />
        <LiveControlButton compact icon="color" label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
        <LiveControlButton compact icon="feed" label="Console" active={consoleOpen} onClick={onToggleConsole} title="Open event console" />
        <LiveControlButton compact icon="settings" label="Settings" active={settingsOpen} onClick={onToggleSettings} title="Open view settings" />
      </div>
    );
  }

  return (
    <div className="crt-float-panel live-command-dock absolute z-30 flex items-center rounded-sm border border-border" style={style}>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 pr-1 md:gap-2">
        <LiveControlButton icon={paused ? "play" : "pause"} label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-wider md:px-2.5 md:text-[11px] ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`crt-glow-dot h-1.5 w-1.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          {paused ? "PAUSED" : "RUNNING"}
        </div>
        <div className="hidden min-w-0 items-center gap-3 font-mono text-[11px] text-text-muted xl:flex">
          <span>{formatCount(totalPackets)} pkts</span>
          <span>{ratePerMin}/m</span>
          <span>{activeAnimations} active</span>
          <span>{quality}</span>
          {queuedCount > 0 && <span className="text-warn">{queuedCount} queued</span>}
          {visualQueueSize > 0 && <span className="text-primary">{visualQueueSize} visual q</span>}
          {laggedCount > 0 && <span className="text-danger">{laggedCount} dropped</span>}
          {visualDroppedCount > 0 && <span className="text-warn">{visualDroppedCount} visual skipped</span>}
        </div>
      </div>

      <LiveControlButton icon="trail" label="Trails" active={trails} onClick={onToggleTrails} title="Toggle persistent map trails" />
      <LiveControlButton icon="pace" label="Pace" active={realisticPropagation} onClick={onTogglePropagation} title="Pace repeated observations before rendering" />
      <LiveControlButton icon="heat" className="hidden sm:inline-flex" label="Heat" active={heatVisible} onClick={onToggleHeat} title="Toggle live activity heat overlay" />
      <LiveControlButton icon="color" className="hidden sm:inline-flex" label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
      <LiveControlButton icon="feed" label="Console" active={consoleOpen} onClick={onToggleConsole} title="Toggle event console rail" />
      <LiveControlButton icon="settings" label="Settings" active={settingsOpen} onClick={onToggleSettings} title="Open view settings" />
    </div>
  );
});
