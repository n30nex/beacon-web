import { memo, type CSSProperties } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { TerminalCursor, TerminalProgress, TerminalSpinner } from "../../components/TerminalLoader";
import { formatAbsolute, formatCount, formatHex, timeAgoMs } from "../../lib/formatters";
import type { LiveSummary } from "../../types/api";
import type { MapAppearanceSettings } from "../map/appearance";
import {
  LIVE_FEED_CAP,
  payloadColor,
  payloadLabel,
  topPayloads,
  type LivePacketEvent,
} from "./live-model";
import { LiveSettingsPanel } from "./LiveSettingsPanel";

const LIVE_PACKET_WAIT_PROGRESS_MS = 30_000;

type LiveVisualQuality = "high" | "balanced" | "constrained";

function formatLiveWait(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function livePacketWaitProgress(ms: number) {
  return Math.min(96, 8 + (Math.max(0, ms) / LIVE_PACKET_WAIT_PROGRESS_MS) * 88);
}

function LivePacketWaitState({
  backfillStatus,
  compact = false,
  now,
  summary,
  waitStartedAt,
}: {
  backfillStatus: string;
  compact?: boolean;
  now: number;
  summary?: LiveSummary;
  waitStartedAt: number;
}) {
  const elapsedMs = waitStartedAt > 0 ? Math.max(0, now - waitStartedAt) : 0;
  const hasServerActivity = (summary?.latestObservationId ?? 0) > 0 || (summary?.observationCount ?? 0) > 0;
  const label =
    backfillStatus === "priming"
      ? "PRIMING RECENT PACKETS"
      : backfillStatus === "sync"
        ? "SYNCING CURSOR"
        : hasServerActivity
          ? "LISTENING FOR NEXT PACKET"
          : "WAITING FOR PACKETS";
  const detail = hasServerActivity
    ? `cursor ${summary?.latestObservationId ?? "--"} / ${formatCount(summary?.observationCount ?? 0)} obs / ${summary?.activeObservers ?? "--"} observers`
    : `elapsed ${formatLiveWait(elapsedMs)} / broker listener armed`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`terminal-loading-state text-text-muted ${compact ? "terminal-loading-state-compact px-2 py-2" : "px-3 py-6"}`}
    >
      <div className="terminal-loading-line justify-center">
        <TerminalSpinner />
        <span className="terminal-loading-label">{label}</span>
        <TerminalCursor />
      </div>
      {!compact && <div className="terminal-loading-detail">{detail}</div>}
      {compact && <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">{detail}</div>}
      <TerminalProgress value={livePacketWaitProgress(elapsedMs)} className="mt-3" />
    </div>
  );
}

const LiveFeedPanel = memo(function LiveFeedPanel({
  backfillStatus,
  clockTick,
  events,
  now,
  onSelect,
  onAnalyze,
  selectedId,
  summary,
  waitStartedAt,
}: {
  backfillStatus: string;
  clockTick: number;
  events: LivePacketEvent[];
  now: number;
  onSelect: (event: LivePacketEvent) => void;
  onAnalyze: (hash: string) => void;
  selectedId?: string;
  summary?: LiveSummary;
  waitStartedAt: number;
}) {
  return (
    <div
      data-live-clock={clockTick}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Packet Feed</div>
        <div className="font-mono text-[11px] text-text-dim">{events.length}/{LIVE_FEED_CAP}</div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <LivePacketWaitState backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
        ) : (
          events.slice(0, 18).map((event) => (
            <button
              key={event.id}
              type="button"
              className={`w-full grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 px-3 py-2 text-left border-b border-border-subtle/70 transition-colors hover:bg-primary/8 ${selectedId === event.id ? "bg-primary/10" : ""}`}
              onClick={() => onSelect(event)}
              onDoubleClick={() => onAnalyze(event.packetHash)}
            >
              <span
                className="crt-glow-dot mt-1 h-2.5 w-2.5 rounded-full"
                style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-semibold text-text-bright truncate">{payloadLabel(event.payloadTypeName)}</span>
                  <span className="font-mono text-[10px] text-primary">{formatHex(event.packetHash)}</span>
                  {event.scope && <span className="font-mono text-[10px] text-secondary">{event.scope}</span>}
                </span>
                <span className="block font-mono text-[11px] text-text-muted truncate">
                  {event.observerName || event.observerId.slice(0, 8)} / {event.iata} / {event.routeTypeName}
                </span>
              </span>
              <span className="text-right font-mono text-[10px] text-text-dim">
                <span className="block">{timeAgoMs(event.receivedAt)}</span>
                <span className="block">{event.snr.toFixed(1)} dB</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

function LiveKV({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "primary" | "green" | "warn" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "green" ? "text-green" : tone === "warn" ? "text-warn" : "text-text-bright";
  return (
    <div className="min-w-0 rounded border border-border-subtle bg-bg-base/45 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`truncate font-mono text-xs font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LiveMixList({ title, items }: { title: string; items: Array<{ label: string; count: number; color?: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{title}</div>
      {(items.length ? items : [{ label: "No data", count: 0 }]).slice(0, 5).map((item) => (
        <div key={item.label} className="space-y-1 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? "var(--color-border)", color: item.color }} />
            <span className="min-w-0 flex-1 truncate text-text-muted">{item.label}</span>
            <span className="text-text-dim">{item.count}</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-bg-base">
            <div className="h-full bg-primary/70" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LiveInspectorRail({
  activeAnimations,
  audioBpm,
  audioEnabled,
  audioVolume,
  appearanceSettings,
  backfillCount,
  backfillStatus,
  clockTick,
  clustered,
  compact,
  events,
  feedVisible,
  laggedCount,
  matrixMode,
  matrixRain,
  now,
  onAnalyze,
  onAudioBpmChange,
  onAppearanceChange,
  onAudioVolumeChange,
  onClusteredChange,
  onSelect,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  quality,
  ratePerMin,
  selectedEvent,
  settingsOpen,
  styleId,
  style,
  summary,
  totalPackets,
  typeFilter,
  visualDroppedCount,
  waitStartedAt,
}: {
  activeAnimations: number;
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  appearanceSettings: MapAppearanceSettings;
  backfillCount: number;
  backfillStatus: string;
  clockTick: number;
  clustered: boolean;
  compact: boolean;
  events: LivePacketEvent[];
  feedVisible: boolean;
  laggedCount: number;
  matrixMode: boolean;
  matrixRain: boolean;
  now: number;
  onAnalyze: (hash: string) => void;
  onAudioBpmChange: (value: number) => void;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
  onAudioVolumeChange: (value: number) => void;
  onClusteredChange: (value: boolean) => void;
  onSelect: (event: LivePacketEvent) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  quality: LiveVisualQuality;
  ratePerMin: number;
  selectedEvent?: LivePacketEvent | null;
  settingsOpen: boolean;
  styleId: string;
  style: CSSProperties;
  summary?: LiveSummary;
  totalPackets: number;
  typeFilter: string;
  visualDroppedCount: number;
  waitStartedAt: number;
}) {
  const event = selectedEvent ?? events[0];
  const payloadItems =
    summary?.payloadMix.map((item) => ({ label: payloadLabel(item.payloadTypeName), count: item.count, color: payloadColor(item.payloadTypeName) })) ??
    topPayloads(events).map((item) => ({ label: item.typeName, count: item.count, color: item.color }));
  const routeItems =
    summary?.routeMix.map((item) => ({ label: item.routeTypeName, count: item.count })) ??
    Array.from(events.reduce((map, item) => map.set(item.routeTypeName, (map.get(item.routeTypeName) ?? 0) + 1), new Map<string, number>()), ([label, count]) => ({ label, count }));

  if (compact) {
    if (settingsOpen) {
      return (
        <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">View Settings</div>
            <div className="font-mono text-[10px] uppercase text-text-dim">{quality}</div>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <LiveSettingsPanel
              audioBpm={audioBpm}
              audioEnabled={audioEnabled}
              audioVolume={audioVolume}
              appearanceSettings={appearanceSettings}
              clustered={clustered}
              matrixMode={matrixMode}
              matrixRain={matrixRain}
              onAppearanceChange={onAppearanceChange}
              onAudioBpmChange={onAudioBpmChange}
              onAudioVolumeChange={onAudioVolumeChange}
              onClusteredChange={onClusteredChange}
              onStyleChange={onStyleChange}
              onToggleAudio={onToggleAudio}
              onToggleMatrix={onToggleMatrix}
              onToggleRain={onToggleRain}
              onTypeChange={onTypeChange}
              styleId={styleId}
              typeFilter={typeFilter}
            />
          </div>
        </div>
      );
    }

    if (feedVisible) {
      return (
        <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Packet Feed</div>
            <div className="font-mono text-[10px] uppercase text-text-dim">{events.length}/{LIVE_FEED_CAP}</div>
          </div>
          <div className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-border-subtle p-2">
            <LiveKV label="Pkts" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
            <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
            <LiveKV label="Act" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
            <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
          </div>
          <LiveFeedPanel
            backfillStatus={backfillStatus}
            clockTick={clockTick}
            events={events}
            now={now}
            onAnalyze={onAnalyze}
            onSelect={onSelect}
            selectedId={selectedEvent?.id}
            summary={summary}
            waitStartedAt={waitStartedAt}
          />
        </div>
      );
    }

    return (
      <div className="crt-float-panel live-inspector-rail absolute z-20 flex flex-col justify-between overflow-hidden rounded-sm border border-border" style={style}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 p-2">
          <LiveKV label="Packets" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
          <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
          <LiveKV label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
          <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
        </div>
        {event ? (
          <button type="button" className="mx-2 mb-2 min-w-0 rounded border border-border-subtle bg-bg-base/35 px-2 py-1.5 text-left" onClick={() => onSelect(event)}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="crt-glow-dot h-2 w-2 shrink-0 rounded-full" style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
              <span className="font-mono text-[10px] text-primary">{event.iata}</span>
              <span className="font-mono text-[10px] text-text-dim">{timeAgoMs(event.receivedAt)}</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
              {event.routeTypeName} / {event.rssi} dBm / {event.snr.toFixed(1)} dB
            </div>
          </button>
        ) : (
          <div className="mx-2 mb-2 rounded border border-border-subtle bg-bg-base/35">
            <LivePacketWaitState compact backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Event Console</div>
        <div className="font-mono text-[10px] uppercase text-text-dim">{quality}</div>
      </div>
      {settingsOpen && (
        <LiveSettingsPanel
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={onAppearanceChange}
          onAudioBpmChange={onAudioBpmChange}
          onAudioVolumeChange={onAudioVolumeChange}
          onClusteredChange={onClusteredChange}
          onStyleChange={onStyleChange}
          onToggleAudio={onToggleAudio}
          onToggleMatrix={onToggleMatrix}
          onToggleRain={onToggleRain}
          onTypeChange={onTypeChange}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      )}
      <div className="grid grid-cols-4 gap-2 border-b border-border-subtle p-3">
        <LiveKV label="Packets" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
        <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
        <LiveKV label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
        <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
      </div>
      <div className="border-b border-border-subtle p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">Packet Inspector</div>
          {backfillCount > 0 && <div className="font-mono text-[10px] text-green">{backfillCount} recovered</div>}
        </div>
        {event ? (
          <button type="button" className="w-full text-left" onClick={() => onAnalyze(event.packetHash)}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
              <span className="font-mono text-xs text-primary">{formatHex(event.packetHash)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <LiveKV label="IATA" value={event.iata} />
              <LiveKV label="Route" value={event.routeTypeName} />
              <LiveKV label="RSSI" value={`${event.rssi} dBm`} />
              <LiveKV label="SNR" value={`${event.snr.toFixed(1)} dB`} />
            </div>
            <div className="mt-2 truncate font-mono text-[10px] text-text-dim" title={formatAbsolute(event.heardAt, { ms: true })}>
              {event.observerName || event.observerId} / {timeAgoMs(event.receivedAt)}
            </div>
          </button>
        ) : (
          <LivePacketWaitState backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-border-subtle p-3">
        <LiveMixList title="Payload Mix" items={payloadItems} />
        <LiveMixList title="Route Mix" items={routeItems} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-border-subtle p-3">
        <LiveKV label="Obs" value={formatCount(summary?.observationCount ?? events.length)} />
        <LiveKV label="Observers" value={summary?.activeObservers ?? "--"} />
        <LiveKV label="Skipped" value={visualDroppedCount} tone={visualDroppedCount > 0 ? "warn" : "normal"} />
      </div>
      {feedVisible && (
        <LiveFeedPanel
          backfillStatus={backfillStatus}
          clockTick={clockTick}
          events={events}
          now={now}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
          selectedId={selectedEvent?.id}
          summary={summary}
          waitStartedAt={waitStartedAt}
        />
      )}
    </div>
  );
}

export function LiveMobileConsoleSheet({
  activeAnimations,
  backfillStatus,
  clockTick,
  events,
  laggedCount,
  now,
  onAnalyze,
  onClose,
  onSelect,
  ratePerMin,
  selectedEvent,
  summary,
  totalPackets,
  waitStartedAt,
}: {
  activeAnimations: number;
  backfillStatus: string;
  clockTick: number;
  events: LivePacketEvent[];
  laggedCount: number;
  now: number;
  onAnalyze: (hash: string) => void;
  onClose: () => void;
  onSelect: (event: LivePacketEvent) => void;
  ratePerMin: number;
  selectedEvent?: LivePacketEvent | null;
  summary?: LiveSummary;
  totalPackets: number;
  waitStartedAt: number;
}) {
  const event = selectedEvent ?? events[0];
  const payloadItems =
    summary?.payloadMix.map((item) => ({ label: payloadLabel(item.payloadTypeName), count: item.count, color: payloadColor(item.payloadTypeName) })) ??
    topPayloads(events).map((item) => ({ label: item.typeName, count: item.count, color: item.color }));
  const routeItems =
    summary?.routeMix.map((item) => ({ label: item.routeTypeName, count: item.count })) ??
    Array.from(events.reduce((map, item) => map.set(item.routeTypeName, (map.get(item.routeTypeName) ?? 0) + 1), new Map<string, number>()), ([label, count]) => ({ label, count }));

  return (
    <BottomSheet label="Event console" onClose={onClose}>
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Event Console</div>
          <button type="button" className="font-mono text-[10px] uppercase text-text-muted" onClick={onClose}>Close</button>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-border-subtle p-2">
          <LiveKV label="Pkts" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
          <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
          <LiveKV label="Act" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
          <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
        </div>
        <div className="shrink-0 border-b border-border-subtle p-3">
          {event ? (
            <button type="button" className="w-full rounded border border-border-subtle bg-bg-base/35 px-2 py-1.5 text-left" onClick={() => onAnalyze(event.packetHash)}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="crt-glow-dot h-2 w-2 shrink-0 rounded-full" style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
                <span className="font-mono text-[10px] text-primary">{event.iata}</span>
                <span className="font-mono text-[10px] text-text-dim">{timeAgoMs(event.receivedAt)}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
                {event.routeTypeName} / {event.rssi} dBm / {event.snr.toFixed(1)} dB / {formatHex(event.packetHash)}
              </div>
            </button>
          ) : (
            <LivePacketWaitState compact backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
          )}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border-subtle p-3">
          <LiveMixList title="Payload Mix" items={payloadItems} />
          <LiveMixList title="Route Mix" items={routeItems} />
        </div>
        <LiveFeedPanel
          backfillStatus={backfillStatus}
          clockTick={clockTick}
          events={events}
          now={now}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
          selectedId={selectedEvent?.id}
          summary={summary}
          waitStartedAt={waitStartedAt}
        />
      </div>
    </BottomSheet>
  );
}

export function LiveMobileSettingsSheet({
  audioBpm,
  audioEnabled,
  audioVolume,
  appearanceSettings,
  clustered,
  matrixMode,
  matrixRain,
  onAppearanceChange,
  onAudioBpmChange,
  onAudioVolumeChange,
  onClose,
  onClusteredChange,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  styleId,
  typeFilter,
}: {
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  appearanceSettings: MapAppearanceSettings;
  clustered: boolean;
  matrixMode: boolean;
  matrixRain: boolean;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
  onAudioBpmChange: (value: number) => void;
  onAudioVolumeChange: (value: number) => void;
  onClose: () => void;
  onClusteredChange: (value: boolean) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  styleId: string;
  typeFilter: string;
}) {
  return (
    <BottomSheet label="View settings" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">View Settings</div>
        <button type="button" className="font-mono text-[10px] uppercase text-text-muted" onClick={onClose}>Close</button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <LiveSettingsPanel
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={onAppearanceChange}
          onAudioBpmChange={onAudioBpmChange}
          onAudioVolumeChange={onAudioVolumeChange}
          onClusteredChange={onClusteredChange}
          onStyleChange={onStyleChange}
          onToggleAudio={onToggleAudio}
          onToggleMatrix={onToggleMatrix}
          onToggleRain={onToggleRain}
          onTypeChange={onTypeChange}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      </div>
    </BottomSheet>
  );
}
