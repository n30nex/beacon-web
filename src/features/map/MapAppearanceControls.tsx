import { SegmentedControl } from "./SegmentedControl";
import type { MapAppearanceSettings } from "./appearance";

interface MapAppearanceControlsProps {
  settings: MapAppearanceSettings;
  onChange: (patch: Partial<MapAppearanceSettings>) => void;
  includeRelief?: boolean;
}

const CONTRAST_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "soft", label: "Soft" },
];

const TINT_OPTIONS = [
  { value: "profile", label: "Auto" },
  { value: "theme", label: "Theme" },
  { value: "neutral", label: "Neutral" },
];

const GLOW_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "reduced", label: "Reduced" },
  { value: "boosted", label: "Boosted" },
];

const RELIEF_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
  { value: "soft", label: "Soft" },
];

export function MapAppearanceControls({ settings, onChange, includeRelief = true }: MapAppearanceControlsProps) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Contrast</div>
        <SegmentedControl
          ariaLabel="Map contrast"
          options={CONTRAST_OPTIONS}
          value={settings.contrast}
          onChange={(contrast) => onChange({ contrast: contrast as MapAppearanceSettings["contrast"] })}
          className="w-full"
        />
      </div>
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Map Tint</div>
        <SegmentedControl
          ariaLabel="Map tint"
          options={TINT_OPTIONS}
          value={settings.tint}
          onChange={(tint) => onChange({ tint: tint as MapAppearanceSettings["tint"] })}
          className="w-full"
        />
      </div>
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Overlay Glow</div>
        <SegmentedControl
          ariaLabel="Map overlay glow"
          options={GLOW_OPTIONS}
          value={settings.glow}
          onChange={(glow) => onChange({ glow: glow as MapAppearanceSettings["glow"] })}
          className="w-full"
        />
      </div>
      {includeRelief && (
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Relief</div>
          <SegmentedControl
            ariaLabel="Map relief"
            options={RELIEF_OPTIONS}
            value={settings.relief}
            onChange={(relief) => onChange({ relief: relief as MapAppearanceSettings["relief"] })}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
