import { MapAppearanceControls } from "../map/MapAppearanceControls";
import { MapStyleSwitcher } from "../map/MapStyleSwitcher";
import { SegmentedControl } from "../map/SegmentedControl";
import { NODE_TYPE_FILTER_OPTIONS } from "../map/types";
import type { MapAppearanceSettings } from "../map/appearance";
import { LiveControlButton } from "./LiveControls";

interface LiveSettingsPanelProps {
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
  onClusteredChange: (value: boolean) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  styleId: string;
  typeFilter: string;
}

export function LiveSettingsPanel({
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
  onClusteredChange,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  styleId,
  typeFilter,
}: LiveSettingsPanelProps) {
  return (
    <div className="border-b border-border-subtle p-3">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">View Settings</div>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Map Tiles</div>
          <MapStyleSwitcher styleId={styleId} onChange={onStyleChange} className="w-full" />
        </div>
        <MapAppearanceControls settings={appearanceSettings} onChange={onAppearanceChange} includeRelief={false} />
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Node Type</div>
          <SegmentedControl
            wrap
            ariaLabel="Live node type"
            options={[{ value: "", label: "All" }, ...NODE_TYPE_FILTER_OPTIONS]}
            value={typeFilter}
            onChange={onTypeChange}
          />
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Clustering</div>
          <SegmentedControl
            ariaLabel="Live clustering"
            options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]}
            value={clustered ? "on" : "off"}
            onChange={(value) => onClusteredChange(value === "on")}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LiveControlButton icon="crt" label="CRT" active={matrixMode} onClick={onToggleMatrix} title="Toggle phosphor scan view" />
          <LiveControlButton icon="bytes" label="Bytes" active={matrixRain} onClick={onToggleRain} title="Toggle packet byte phosphor rain" />
          <LiveControlButton icon="audio" label="Audio" active={audioEnabled} onClick={onToggleAudio} title="Toggle packet sonification" />
        </div>
        {audioEnabled && (
          <div className="space-y-3 rounded border border-border-subtle bg-bg-base/45 p-2 font-mono text-[10px] text-text-muted">
            <label className="flex items-center gap-2">
              VOL
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audioVolume * 100)}
                onChange={(event) => onAudioVolumeChange(Number(event.currentTarget.value) / 100)}
                className="h-1.5 flex-1 accent-primary"
                aria-label="Audio volume"
              />
            </label>
            <label className="flex items-center gap-2">
              BPM
              <input
                type="range"
                min={60}
                max={240}
                value={audioBpm}
                onChange={(event) => onAudioBpmChange(Number(event.currentTarget.value))}
                className="h-1.5 flex-1 accent-primary"
                aria-label="Audio BPM"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
