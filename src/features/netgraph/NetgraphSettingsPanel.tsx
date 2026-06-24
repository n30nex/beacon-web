import { BottomSheet } from "../../components/BottomSheet";
import {
  NETGRAPH_ROUTE_LIMITS,
  normalizeGalaxyProfile,
  normalizeVisualProfile,
  type NetgraphCinematicPreset,
  type NetgraphGalaxyProfile,
  type NetgraphQualityMode,
  type NetgraphRouteLimit,
  type NetgraphViewMode,
  type NetgraphVisualProfile,
} from "./netgraph-model";
import { CINEMATIC_PRESETS } from "./netgraph-settings-config";

const VIEW_MODES: Array<{ value: NetgraphViewMode; label: string }> = [
  { value: "galaxy", label: "Galaxy" },
  { value: "focus", label: "Focus" },
  { value: "routes", label: "Routes" },
  { value: "live", label: "Live" },
];

const QUALITY_MODES: Array<{ value: NetgraphQualityMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "balanced", label: "Balanced" },
  { value: "battery", label: "Battery" },
];

const CINEMATIC_PRESET_ORDER: NetgraphCinematicPreset[] = ["cinematic", "clarity", "presentation", "performance"];

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

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2 rounded-sm border border-border bg-bg-base/90 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase text-text-muted">
        <span className="min-w-0 truncate">{label}</span>
        <span className="text-text-bright tabular-nums">
          {value.toFixed(typeof step === "number" && step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="netgraph-range w-full cursor-pointer"
      />
    </label>
  );
}

function GalaxyShapeControl({
  value,
  onChange,
}: {
  value: NetgraphGalaxyProfile["seedShape"];
  onChange: (value: NetgraphGalaxyProfile["seedShape"]) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-bg-base/90 p-2">
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase text-text-muted">Seed shape</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className={`rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase ${
            value === "spherical" ? "border-primary/45 bg-primary/15 text-primary" : "border-border text-text-muted hover:text-text-bright"
          }`}
          onClick={() => onChange("spherical")}
        >
          Spherical
        </button>
        <button
          type="button"
          className={`rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase ${
            value === "spiral" ? "border-primary/45 bg-primary/15 text-primary" : "border-border text-text-muted hover:text-text-bright"
          }`}
          onClick={() => onChange("spiral")}
        >
          Spiral
        </button>
      </div>
    </div>
  );
}

function ModePicker({
  mode,
  selectedNodeId,
  selectedRouteId,
  onChange,
}: {
  mode: NetgraphViewMode;
  selectedNodeId: string | null;
  selectedRouteId: number | null;
  onChange: (mode: NetgraphViewMode) => void;
}) {
  return (
    <div className="flex w-full rounded-sm border border-border bg-bg-base/90 p-0.5 sm:w-auto" role="group" aria-label="Netgraph view mode">
      {VIEW_MODES.map((item) => {
        const disabled = (item.value === "focus" && !selectedNodeId) || (item.value === "routes" && selectedRouteId == null);
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={mode === item.value}
            disabled={disabled}
            className={`flex-1 rounded px-2.5 py-1 font-mono text-[10px] font-semibold uppercase transition-colors sm:flex-none ${
              mode === item.value ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-normal"
            } disabled:cursor-not-allowed disabled:text-text-dim/45`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CinematicPresetPicker({ preset, onChange }: { preset: NetgraphCinematicPreset; onChange: (preset: NetgraphCinematicPreset) => void }) {
  return (
    <div className="rounded-sm border border-border bg-bg-base/90 p-2" role="group" aria-label="Netgraph cinematic preset">
      <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase text-text-muted">
        <span>Preset</span>
        <span className="text-text-dim">{CINEMATIC_PRESETS[preset].label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {CINEMATIC_PRESET_ORDER.map((item) => {
          const config = CINEMATIC_PRESETS[item];
          return (
            <button
              key={item}
              type="button"
              aria-pressed={preset === item}
              className={`min-h-12 rounded-sm border px-2 py-1.5 text-left transition-colors ${
                preset === item ? "border-primary/45 bg-primary/12 text-primary" : "border-border-subtle bg-bg-base/70 text-text-muted hover:text-text-bright"
              }`}
              onClick={() => onChange(item)}
            >
              <span className="block font-mono text-[10px] font-semibold uppercase">{config.label}</span>
              <span className="mt-0.5 block truncate font-mono text-[9px] text-text-dim">{config.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QualityPicker({ quality, onChange }: { quality: NetgraphQualityMode; onChange: (quality: NetgraphQualityMode) => void }) {
  return (
    <div className="flex w-full rounded-sm border border-border bg-bg-base/90 p-0.5 sm:w-auto" role="group" aria-label="Netgraph quality">
      {QUALITY_MODES.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={quality === item.value}
          className={`flex-1 rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase transition-colors sm:flex-none ${
            quality === item.value ? "bg-green/12 text-green" : "text-text-muted hover:text-text-normal"
          }`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function NetgraphSettingsPanel({
  open,
  isMobile,
  selectedNodeId,
  selectedRouteId,
  routeLimit,
  cinematicPreset,
  galaxyProfile,
  visualProfile,
  viewMode,
  quality,
  showDataQuality,
  onChangeRouteLimit,
  onChangePreset,
  onChangeMode,
  onChangeQuality,
  onToggleDataQuality,
  onChangeGalaxyProfile,
  onChangeVisualProfile,
  onClose,
}: {
  open: boolean;
  isMobile: boolean;
  selectedNodeId: string | null;
  selectedRouteId: number | null;
  routeLimit: NetgraphRouteLimit;
  cinematicPreset: NetgraphCinematicPreset;
  galaxyProfile: NetgraphGalaxyProfile;
  visualProfile: NetgraphVisualProfile;
  viewMode: NetgraphViewMode;
  quality: NetgraphQualityMode;
  showDataQuality: boolean;
  onChangeRouteLimit: (limit: NetgraphRouteLimit) => void;
  onChangePreset: (preset: NetgraphCinematicPreset) => void;
  onChangeMode: (mode: NetgraphViewMode) => void;
  onChangeQuality: (quality: NetgraphQualityMode) => void;
  onChangeGalaxyProfile: (next: NetgraphGalaxyProfile) => void;
  onChangeVisualProfile: (next: NetgraphVisualProfile) => void;
  onToggleDataQuality: () => void;
  onClose: () => void;
}) {
  const panelContents = (
    <div className="space-y-2 p-3">
      <ModePicker mode={viewMode} selectedNodeId={selectedNodeId} selectedRouteId={selectedRouteId} onChange={onChangeMode} />
      <CinematicPresetPicker preset={cinematicPreset} onChange={onChangePreset} />
      <QualityPicker quality={quality} onChange={onChangeQuality} />
      <RouteLimitRange value={routeLimit} onChange={onChangeRouteLimit} />
      <button
        type="button"
        aria-pressed={showDataQuality}
        className={`w-full rounded-sm border px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase transition-colors ${
          showDataQuality
            ? "border-primary/45 bg-primary/10 text-primary"
            : "border-border bg-bg-base/90 text-text-muted hover:text-text-normal"
        }`}
        onClick={onToggleDataQuality}
      >
        Data quality overlay
      </button>
      <details className="group rounded-sm border border-border bg-bg-base/80">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 font-mono text-[10px] font-semibold uppercase text-text-muted marker:hidden">
          <span>Advanced</span>
          <span className="text-text-dim group-open:text-primary">Layout + render</span>
        </summary>
        <div className="space-y-3 border-t border-border/80 p-2">
          <div>
            <div className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase text-text-muted">Galaxy layout</div>
            <div className="space-y-2">
              <GalaxyShapeControl
                value={galaxyProfile.seedShape}
                onChange={(seedShape) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, seedShape }))}
              />
              <RangeSetting
                label="Cluster scale"
                value={galaxyProfile.clusterScale}
                min={0.6}
                max={2.85}
                step={0.01}
                onChange={(clusterScale) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, clusterScale }))}
              />
              <RangeSetting
                label="Spiral intensity"
                value={galaxyProfile.spiralIntensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(spiralIntensity) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, spiralIntensity }))}
              />
              <RangeSetting
                label="3D depth contrast"
                value={galaxyProfile.depthContrast}
                min={0.45}
                max={3.4}
                step={0.01}
                onChange={(depthContrast) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, depthContrast }))}
              />
              <RangeSetting
                label="Settle strength"
                value={galaxyProfile.settleStrength}
                min={0.4}
                max={2.4}
                step={0.01}
                onChange={(settleStrength) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, settleStrength }))}
              />
              <RangeSetting
                label="Edge spacing"
                value={galaxyProfile.edgeSpacingScale}
                min={0.5}
                max={3}
                step={0.01}
                onChange={(edgeSpacingScale) => onChangeGalaxyProfile(normalizeGalaxyProfile({ ...galaxyProfile, edgeSpacingScale }))}
              />
            </div>
          </div>
          <div>
            <div className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase text-text-muted">Cinematic render</div>
            <div className="space-y-2">
              <RangeSetting
                label="Auto rotate speed"
                value={visualProfile.autoRotateSpeed}
                min={0}
                max={2.4}
                step={0.05}
                onChange={(autoRotateSpeed) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, autoRotateSpeed }))}
              />
              <RangeSetting
                label="Orbit control speed"
                value={visualProfile.orbitControlSpeed}
                min={0.3}
                max={2.7}
                step={0.05}
                onChange={(orbitControlSpeed) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, orbitControlSpeed }))}
              />
              <RangeSetting
                label="Orbit damping"
                value={visualProfile.orbitDamping}
                min={0.04}
                max={0.22}
                step={0.01}
                onChange={(orbitDamping) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, orbitDamping }))}
              />
              <RangeSetting
                label="Node scale"
                value={visualProfile.nodeScale}
                min={0.5}
                max={3}
                step={0.01}
                onChange={(nodeScale) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, nodeScale }))}
              />
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  ["Off", 0, 1, visualProfile.orbitDamping],
                  ["Calm", 0.45, 0.85, visualProfile.orbitDamping],
                  ["Orbit", 1.72, 1.2, visualProfile.orbitDamping],
                  ["Hyper", 2.1, 1.4, visualProfile.orbitDamping],
                  ["Drift", 1.05, 1.58, 0.14],
                ].map(([label, autoRotateSpeed, orbitControlSpeed, orbitDamping]) => (
                  <button
                    key={String(label)}
                    type="button"
                    className="rounded-sm border border-border bg-bg-base/90 px-1.5 py-1.5 font-mono text-[10px] font-semibold uppercase text-text-muted hover:text-text-bright"
                    onClick={() => onChangeVisualProfile(normalizeVisualProfile({
                      ...visualProfile,
                      autoRotateSpeed: Number(autoRotateSpeed),
                      orbitControlSpeed: Number(orbitControlSpeed),
                      orbitDamping: Number(orbitDamping),
                    }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <RangeSetting
                label="Label scale"
                value={visualProfile.labelScale}
                min={0.4}
                max={2.4}
                step={0.01}
                onChange={(labelScale) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, labelScale }))}
              />
              <RangeSetting
                label="Edge glow"
                value={visualProfile.edgeOpacity}
                min={0.15}
                max={1.75}
                step={0.01}
                onChange={(edgeOpacity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, edgeOpacity }))}
              />
              <RangeSetting
                label="Label density"
                value={visualProfile.labelDensity}
                min={0.2}
                max={2.2}
                step={0.01}
                onChange={(labelDensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, labelDensity }))}
              />
              <RangeSetting
                label="Pulse density"
                value={visualProfile.pulseDensity}
                min={0}
                max={2.2}
                step={0.01}
                onChange={(pulseDensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, pulseDensity }))}
              />
              <RangeSetting
                label="Glow density"
                value={visualProfile.glowDensity}
                min={0}
                max={2.2}
                step={0.01}
                onChange={(glowDensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, glowDensity }))}
              />
              <RangeSetting
                label="Glow intensity"
                value={visualProfile.glowIntensity}
                min={0.35}
                max={2.8}
                step={0.01}
                onChange={(glowIntensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, glowIntensity }))}
              />
              <RangeSetting
                label="Star density"
                value={visualProfile.starDensity}
                min={0.2}
                max={2}
                step={0.01}
                onChange={(starDensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, starDensity }))}
              />
              <RangeSetting
                label="Camera FOV"
                value={visualProfile.cameraFov}
                min={24}
                max={84}
                step={1}
                onChange={(cameraFov) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, cameraFov }))}
              />
              <RangeSetting
                label="Camera distance"
                value={visualProfile.cameraDistanceScale}
                min={0.45}
                max={1.95}
                step={0.01}
                onChange={(cameraDistanceScale) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, cameraDistanceScale }))}
              />
              <RangeSetting
                label="Light intensity"
                value={visualProfile.lightIntensity}
                min={0.35}
                max={2.2}
                step={0.05}
                onChange={(lightIntensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, lightIntensity }))}
              />
              <RangeSetting
                label="Atmosphere density"
                value={visualProfile.atmosphereDensity}
                min={0.25}
                max={2.2}
                step={0.05}
                onChange={(atmosphereDensity) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, atmosphereDensity }))}
              />
              <RangeSetting
                label="Focus halo scale"
                value={visualProfile.focusHaloScale}
                min={0.2}
                max={2.4}
                step={0.05}
                onChange={(focusHaloScale) => onChangeVisualProfile(normalizeVisualProfile({ ...visualProfile, focusHaloScale }))}
              />
            </div>
          </div>
        </div>
      </details>
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
        className="pointer-events-auto absolute right-2 top-3 z-40 flex max-h-[calc(100%-1.5rem)] w-[min(380px,calc(100%-1.2rem))] flex-col overflow-hidden rounded-sm border border-border bg-bg-surface/95 shadow-2xl backdrop-blur md:right-3 md:top-3"
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
