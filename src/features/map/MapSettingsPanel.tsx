import { memo, useState } from "react";
import { MapAppearanceControls } from "./MapAppearanceControls";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { SegmentedControl } from "./SegmentedControl";
import { NODE_TYPE_FILTER_OPTIONS } from "./types";
import type { MapAppearanceSettings } from "./appearance";
import { Section } from "../../components/DetailPanel";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { BottomSheet } from "../../components/BottomSheet";

// Open/closed state persists across sessions; no click-outside dismiss, so it stays open while you pan.
const OPEN_STORAGE_KEY = "beacon-map-settings-desktop-open";

const TYPE_OPTIONS = [{ value: "", label: "All" }, ...NODE_TYPE_FILTER_OPTIONS];
const CLUSTER_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
const TOPOGRAPHY_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

interface MapSettingsPanelProps {
  styleId: string;
  onStyleChange: (id: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  clustered: boolean;
  onClusteredChange: (c: boolean) => void;
  topographyEnabled: boolean;
  onTopographyChange: (enabled: boolean) => void;
  appearanceSettings: MapAppearanceSettings;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
}

// Memoized: its props are reference-stable (callbacks are useCallback/setState setters), so it skips
// the frequent re-renders of its map-view parents (live now-tick, packet/node-update churn).
export const MapSettingsPanel = memo(function MapSettingsPanel({
  styleId,
  onStyleChange,
  typeFilter,
  onTypeChange,
  clustered,
  onClusteredChange,
  topographyEnabled,
  onTopographyChange,
  appearanceSettings,
  onAppearanceChange,
}: MapSettingsPanelProps) {
  const isMobile = useIsMobile();
  // Mobile panels are transient and always start closed; desktop keeps its own saved preference.
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(OPEN_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      // private mode / quota — the toggle still works, just not persisted
    }
  };

  const panelContents = (
    <div className="border-t border-border-subtle">
      <Section title="Map Tiles" first>
        <MapStyleSwitcher styleId={styleId} onChange={onStyleChange} className="w-full" />
      </Section>
      <Section title="Appearance">
        <MapAppearanceControls settings={appearanceSettings} onChange={onAppearanceChange} />
      </Section>
      <Section title="Node Type">
        <SegmentedControl
          wrap
          ariaLabel="Node type"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={onTypeChange}
        />
      </Section>
      <Section title="Clustering">
        <SegmentedControl
          ariaLabel="Clustering"
          options={CLUSTER_OPTIONS}
          value={clustered ? "on" : "off"}
          onChange={(v) => onClusteredChange(v === "on")}
          className="w-full"
        />
      </Section>
      <Section title="Topography">
        <SegmentedControl
          ariaLabel="Topography"
          options={TOPOGRAPHY_OPTIONS}
          value={topographyEnabled ? "on" : "off"}
          onChange={(v) => onTopographyChange(v === "on")}
          className="w-full"
        />
      </Section>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open map settings"
          className="map-mobile-icon-button absolute left-2 top-2 z-10"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4.5h7M2 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="12" cy="4.5" r="1.7" fill="currentColor" />
            <circle cx="9" cy="11.5" r="1.7" fill="currentColor" />
            <path d="M9 11.5h5M12 4.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        {mobileOpen && (
          <BottomSheet label="Map settings" onClose={() => setMobileOpen(false)}>
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Map Settings</div>
              <button type="button" className="font-mono text-[10px] uppercase text-text-muted" onClick={() => setMobileOpen(false)}>Close</button>
            </div>
            <div className="min-h-0 overflow-y-auto pb-2">{panelContents}</div>
          </BottomSheet>
        )}
      </>
    );
  }

  return (
    <div className="absolute top-3 left-3 z-10 w-60 max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg overflow-hidden font-mono">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center justify-between w-full px-3 py-2 text-[11px] uppercase tracking-wider text-text-dim hover:text-text-normal transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4.5h7M2 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="12" cy="4.5" r="1.7" fill="currentColor" />
            <circle cx="9" cy="11.5" r="1.7" fill="currentColor" />
            <path d="M9 11.5h5M12 4.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Map Settings
        </span>
        <span aria-hidden className="text-text-dim text-[9px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && panelContents}
    </div>
  );
});
