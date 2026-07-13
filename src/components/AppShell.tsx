import { type ReactNode, useState, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useRegionSelection, useRegions } from "../hooks/useRegion";
import { ALL_REGIONS, isAllRegions, type RegionSelection } from "../hooks/region-selection";
import { useWsDiagnostics } from "../hooks/useWsDiagnostics";
import { useTheme } from "../hooks/useTheme";
import { Dropdown } from "./Dropdown";
import { BottomNav } from "./BottomNav";
import { BeaconWordmark } from "./BeaconWordmark";
import { NavIcon } from "./NavIcon";
import { Tooltip } from "./Tooltip";
import { TerminalLoadingState } from "./TerminalLoader";
import { RuntimeStatusPanel } from "./RuntimeStatusPanel";
import { getIatas } from "../api/client";
import { sanitizeDisplayLabel } from "../lib/display-label";
import { DATA_TABS, MONITOR_TABS, SYSTEM_TABS, TOOL_TABS, isDataTab, isMonitorTab, isSystemTab, isToolTab, type PageTab } from "../lib/navigation";
import type { WsManager } from "../api/ws-manager";

// header widgets: WS status, region picker, theme picker

type FontMode = "retro" | "modern";
type ScanlineMode = "on" | "off";
type DensityMode = "comfortable" | "dense";

const FONT_MODE_KEY = "beacon-font-mode";
const SCANLINES_KEY = "beacon-scanlines";
const UI_DENSITY_KEY = "beacon-ui-density";
const DISPLAY_VERSION = __APP_VERSION__;
const DISPLAY_BUILD = __BUILD_SHA__ === "unknown" ? "" : __BUILD_SHA__.slice(0, 7);

type NavIconName = Parameters<typeof NavIcon>[0]["name"];

const DESKTOP_PAGES: { tab: PageTab; icon: NavIconName }[] = [{ tab: "Home", icon: "home" }];

const TAB_ICON: Record<PageTab, NavIconName> = {
  Home: "home",
  Packets: "packets",
  Map: "map",
  Live: "live",
  Channels: "channels",
  Nodes: "nodes",
  Observers: "observers",
  Investigations: "search",
  Routes: "routes",
  Netgraph: "netgraph",
  Traces: "traces",
  Analytics: "analytics",
  System: "system",
};

function readFontMode(): FontMode {
  try {
    return localStorage.getItem(FONT_MODE_KEY) === "modern" ? "modern" : "retro";
  } catch {
    return "retro";
  }
}

function readScanlines(): ScanlineMode {
  try {
    return localStorage.getItem(SCANLINES_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

function readDensityMode(): DensityMode {
  try {
    return localStorage.getItem(UI_DENSITY_KEY) === "dense" ? "dense" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function writeDisplayPref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy modes; the active page still updates.
  }
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function LiveBadge({ wsManager }: { wsManager: WsManager }) {
  const diagnostics = useWsDiagnostics(wsManager);
  const now = useNow();
  const eventAgeMs = now - diagnostics.lastEventTimestamp;
  const eventAge = formatDuration(eventAgeMs);
  const status = diagnostics.status;
  const hasSubscription = Boolean(diagnostics.activeSubscriptionId);
  const quiet = status === "connected" && hasSubscription && eventAgeMs > 90_000;
  const toneClass =
    status === "connected" && hasSubscription && !quiet
      ? "text-green bg-green/8 border-green/25"
      : status === "connecting" || status === "connected"
        ? "text-warn bg-warn/7 border-warn/25"
        : "text-danger bg-danger/8 border-danger/25";
  const label =
    status === "connected"
      ? hasSubscription
        ? quiet
          ? `QUIET ${eventAge}`
          : "LIVE"
        : "SYNCING"
      : status === "connecting"
        ? diagnostics.connectedAt
          ? `RECONNECT ${eventAge}`
          : "SYNCING"
        : status === "error"
          ? "ERROR"
          : "OFFLINE";

  return (
    <Dropdown
      width="w-72"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Live system ${label.toLowerCase()}`}
          className={`crt-panel flex min-h-9 items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors hover:border-primary ${toneClass}`}
          onClick={toggle}
        >
          <NavIcon name="signal" size={14} />
          {status === "connected" && hasSubscription && !quiet && <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />}
          {label}
          {diagnostics.parseFailureCount > 0 && <span className="text-danger">ERR {diagnostics.parseFailureCount}</span>}
        </button>
      )}
    >
      {() => <RuntimeStatusPanel wsManager={wsManager} />}
    </Dropdown>
  );
}

// checkbox indicator, matching MultiSelectDropdown's style
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
      checked ? "border-primary bg-primary/20" : "border-border"
    }`}>
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
        </svg>
      )}
    </span>
  );
}

// Compact header summary of the active selection, e.g. "ALL", "YVR, YYJ", "2 regions", "1 region · 3 IATA".
function regionSummaryLabel(selection: RegionSelection): string {
  if (isAllRegions(selection)) return "ALL";
  const parts: string[] = [];
  if (selection.regions.length > 0) {
    parts.push(`${selection.regions.length} region${selection.regions.length > 1 ? "s" : ""}`);
  }
  if (selection.iatas.length > 0) {
    parts.push(selection.iatas.length <= 2 ? selection.iatas.join(", ") : `${selection.iatas.length} IATA`);
  }
  return parts.join(" · ");
}

// Grouped multi-select: regions (each expands to its member IATAs) on top, then individual IATAs.
// Toggling keeps the dropdown open so several can be picked; "All Regions" clears the selection.
function RegionSelector() {
  const { selection, setSelection } = useRegionSelection();
  const { regions } = useRegions();
  const now = useNow(30_000);

  const { data: iatas, dataUpdatedAt: iatasUpdatedAt, isError: iatasError, isFetching: iatasFetching } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 60_000,
  });
  const iataFreshness = iatasFetching
    ? "refreshing"
    : iatasUpdatedAt
      ? `updated ${formatDuration(now - iatasUpdatedAt)} ago`
      : "not loaded";

  const toggleRegion = (slug: string) => {
    const has = selection.regions.includes(slug);
    setSelection({
      ...selection,
      regions: has ? selection.regions.filter((s) => s !== slug) : [...selection.regions, slug],
    });
  };

  const toggleIata = (code: string) => {
    const has = selection.iatas.includes(code);
    setSelection({
      ...selection,
      iatas: has ? selection.iatas.filter((c) => c !== code) : [...selection.iatas, code],
    });
  };

  return (
    <Dropdown
      width="w-60"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Region ${regionSummaryLabel(selection)}`}
          title="Region"
          className="crt-panel flex min-h-9 items-center gap-1.5 bg-bg-raised border border-border rounded px-2 py-1 text-text-bright font-mono text-xs font-semibold hover:border-primary transition-colors"
          onClick={toggle}
        >
          <NavIcon name="region" size={16} />
          {regionSummaryLabel(selection)}
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {() => (
        <>
          <button
            type="button"
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
              isAllRegions(selection)
                ? "text-text-bright bg-primary/10"
                : "text-text-muted hover:text-text-normal hover:bg-primary/8"
            }`}
            onClick={() => setSelection(ALL_REGIONS)}
          >
            {/* spacer matching the checkbox column so ALL/code/name align with the rows below */}
            <span className="w-3 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-primary w-8 shrink-0">ALL</span>
            <span className="text-text-dim">All Regions</span>
          </button>

          {regions.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim">Regions</div>
              {regions.map((r) => {
                const checked = selection.regions.includes(r.slug);
                return (
                  <button
                    key={r.slug}
                    type="button"
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                      checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-primary/8"
                    }`}
                    onClick={() => toggleRegion(r.slug)}
                  >
                    <CheckBox checked={checked} />
                    <span className="truncate">{r.name}</span>
                  </button>
                );
              })}
            </>
          )}

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
            <span>IATA</span>
            <span className={iatasFetching ? "text-warn" : "text-text-dim"}>{iataFreshness}</span>
          </div>
          {iatas ? (
            iatas.map((i) => {
              const checked = selection.iatas.includes(i.iata);
              return (
                <button
                  key={i.iata}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                    checked ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-primary/8"
                  }`}
                  onClick={() => toggleIata(i.iata)}
                >
                  <CheckBox checked={checked} />
                  <span className="font-semibold text-primary w-8 shrink-0">{i.iata}</span>
                  <span className="text-text-dim truncate">{sanitizeDisplayLabel(i.displayName, i.iata)}</span>
                </button>
              );
            })
          ) : iatasError ? (
            <div className="px-3 py-1.5 text-[11px] font-mono text-text-dim">Failed to load</div>
          ) : (
            <div className="px-3 py-1.5">
              <TerminalLoadingState label="QUERYING IATA" compact />
            </div>
          )}
        </>
      )}
    </Dropdown>
  );
}

function ThemePicker({ onPick }: { onPick?: () => void }) {
  const { themeId, themes, setThemeId, designMode } = useTheme();

  return (
    <>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors ${
            designMode === "retro" && t.id === themeId
              ? "text-text-bright bg-primary/10"
              : "text-text-muted hover:text-text-normal hover:bg-primary/8"
          }`}
          onClick={() => {
            setThemeId(t.id);
            onPick?.();
          }}
        >
          <span
            className="w-3 h-3 shrink-0 border border-primary/40 shadow-[0_0_8px_currentColor]"
            style={{ background: t.vars["--palette-primary"] }}
          />
          {t.name}
        </button>
      ))}
    </>
  );
}

function DesignPicker({ onPick }: { onPick?: () => void }) {
  const { designMode, modernStyleId, modernStyles, setDesignMode, setModernStyleId } = useTheme();

  return (
    <>
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-colors ${
          designMode === "retro" ? "bg-primary/10 text-text-bright" : "text-text-muted hover:bg-primary/8 hover:text-text-normal"
        }`}
        onClick={() => {
          setDesignMode("retro");
          onPick?.();
        }}
      >
        <span className="h-3 w-3 shrink-0 rounded-sm border border-primary/40 bg-primary/20 shadow-[0_0_8px_currentColor]" />
        <span className="min-w-0">
          <span className="block font-semibold">Retro CRT</span>
          <span className="block truncate text-[10px] text-text-dim">Use the current retro color palette.</span>
        </span>
      </button>

      <div className="border-t border-border-subtle px-3 pb-1 pt-2 text-[10px] font-mono uppercase tracking-wide text-text-dim">Modern Glass</div>
      {modernStyles.map((style) => {
        const active = designMode === "modern" && style.id === modernStyleId;
        return (
          <button
            key={style.id}
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-colors ${
              active ? "bg-primary/12 text-text-bright" : "text-text-muted hover:bg-primary/8 hover:text-text-normal"
            }`}
            onClick={() => {
              setModernStyleId(style.id);
              onPick?.();
            }}
          >
            <span className="flex h-4 w-8 shrink-0 overflow-hidden rounded-sm border border-white/20">
              {style.swatches.slice(0, 4).map((swatch) => (
                <span key={swatch} className="flex-1" style={{ background: swatch }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{style.name}</span>
              <span className="block truncate text-[10px] text-text-dim">{style.description}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function DisplayPreferences() {
  const { designMode } = useTheme();
  const [fontMode, setFontMode] = useState<FontMode>(readFontMode);
  const [scanlines, setScanlines] = useState<ScanlineMode>(readScanlines);

  useEffect(() => {
    document.documentElement.dataset.fontMode = fontMode;
    document.documentElement.dataset.scanlines = scanlines;
    writeDisplayPref(FONT_MODE_KEY, fontMode);
    writeDisplayPref(SCANLINES_KEY, scanlines);
  }, [fontMode, scanlines]);

  const fontReadable = fontMode === "modern";
  const scanlinesReadable = scanlines === "off";

  if (designMode === "modern") {
    return (
      <div className="display-preferences flex min-w-0 items-center gap-1.5">
        <span className="modern-mode-pill shrink-0 rounded-sm border border-primary/35 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider leading-none text-primary">
          Modern UI
        </span>
      </div>
    );
  }

  return (
    <div className="display-preferences flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        aria-pressed={fontReadable}
        className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider leading-none transition-colors ${
          fontReadable ? "border-green/45 bg-green/10 text-green" : "border-primary/45 bg-primary/8 text-primary"
        }`}
        onClick={() => setFontMode((mode) => (mode === "retro" ? "modern" : "retro"))}
      >
        Font {fontMode}
      </button>
      <button
        type="button"
        aria-pressed={scanlinesReadable}
        className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider leading-none transition-colors ${
          scanlinesReadable ? "border-green/45 bg-green/10 text-green" : "border-primary/45 bg-primary/8 text-primary"
        }`}
        onClick={() => setScanlines((mode) => (mode === "on" ? "off" : "on"))}
      >
        Scan {scanlines}
      </button>
    </div>
  );
}

function DensityPreferences() {
  const [densityMode, setDensityMode] = useState<DensityMode>(readDensityMode);

  useEffect(() => {
    document.documentElement.dataset.uiDensity = densityMode;
    writeDisplayPref(UI_DENSITY_KEY, densityMode);
  }, [densityMode]);

  return (
    <div className="px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">Density</div>
      <div role="group" aria-label="Density" className="flex rounded-sm border border-border bg-bg-base p-0.5">
        {(["comfortable", "dense"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={densityMode === mode}
            className={`flex-1 rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              densityMode === mode ? "bg-primary/15 text-text-bright" : "text-text-muted hover:text-text-normal"
            }`}
            onClick={() => setDensityMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppearancePreferenceSync() {
  const [fontMode] = useState<FontMode>(readFontMode);
  const [scanlines] = useState<ScanlineMode>(readScanlines);
  const [densityMode] = useState<DensityMode>(readDensityMode);

  useEffect(() => {
    document.documentElement.dataset.fontMode = fontMode;
    document.documentElement.dataset.scanlines = scanlines;
    document.documentElement.dataset.uiDensity = densityMode;
  }, [densityMode, fontMode, scanlines]);

  return null;
}

function AppearanceMenu() {
  const { themeId, themes, designMode, modernStyleId, modernStyles } = useTheme();
  const currentTheme = themes.find((theme) => theme.id === themeId);
  const currentModern = modernStyles.find((style) => style.id === modernStyleId);
  const label = designMode === "modern" ? currentModern?.name ?? "Modern Glass" : currentTheme?.name ?? "Retro CRT";
  const swatches =
    designMode === "modern"
      ? currentModern?.swatches ?? ["var(--color-primary)", "var(--color-secondary)", "var(--color-bg-base)"]
      : [
        currentTheme?.vars["--palette-primary"] ?? "var(--color-primary)",
        currentTheme?.vars["--palette-secondary"] ?? "var(--color-secondary)",
        currentTheme?.vars["--palette-bg-base"] ?? "var(--color-bg-base)",
      ];

  return (
    <Dropdown
      width="w-64 sm:w-80"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Appearance ${label}`}
          title="Appearance"
          className={`crt-panel flex min-h-9 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
            designMode === "modern"
              ? "border-primary/60 bg-primary/12 text-text-bright hover:border-primary"
              : "border-border bg-bg-raised text-text-muted hover:border-primary hover:text-text-normal"
          }`}
          onClick={toggle}
        >
          <span className="flex h-3.5 w-6 shrink-0 overflow-hidden rounded-sm border border-white/20">
            {swatches.slice(0, 3).map((swatch) => (
              <span key={swatch} className="flex-1" style={{ background: swatch }} />
            ))}
          </span>
          <NavIcon name="appearance" size={14} />
          <span className="text-text-dim text-[11px]">v</span>
        </button>
      )}
    >
      {(close) => (
        <div className="appearance-menu pb-1">
          <div className="px-3 pb-1 pt-1 font-mono">
            <div className="text-[10px] uppercase tracking-wider text-text-dim">Appearance</div>
            <div className="truncate text-sm font-semibold text-text-bright">{label}</div>
          </div>
          <div className="border-y border-border-subtle py-1">
            <div className="px-3 pb-1 pt-1 text-[10px] font-mono uppercase tracking-wide text-text-dim">Retro Palettes</div>
            <ThemePicker onPick={close} />
            <DesignPicker onPick={close} />
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">CRT Display</span>
            <DisplayPreferences />
          </div>
          <DensityPreferences />
        </div>
      )}
    </Dropdown>
  );
}

function ThemeAmbientLayer({ activeTab }: { activeTab: string }) {
  const { themeId, designMode, modernStyleId } = useTheme();
  const showRetroAmbient = designMode === "retro";
  return (
    <div
      className="theme-ambient-layer"
      data-ambient-theme={themeId}
      data-ambient-design={designMode}
      data-ambient-modern-style={modernStyleId}
      data-ambient-tab={activeTab.toLowerCase()}
      aria-hidden="true"
    >
      {showRetroAmbient && (
        <>
          <span className="theme-ambient-sweep" />
          <span className="theme-ambient-blip theme-ambient-blip-a" />
          <span className="theme-ambient-blip theme-ambient-blip-b" />
          <span className="theme-ambient-ticker">
            BEACON OPS // {activeTab.toUpperCase()} // CREWNET // BROKER BUS // PLEASE WAIT
          </span>
        </>
      )}
    </div>
  );
}

function DesktopNavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: NavIconName;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={label}
        className={`app-shell-nav-icon crt-icon flex h-10 w-10 items-center justify-center rounded-sm border-b-2 transition-colors ${
          active
            ? "border-primary text-primary"
            : "border-transparent text-text-muted hover:border-primary/45 hover:text-text-normal"
        }`}
        onClick={onClick}
      >
        <NavIcon name={icon} />
      </button>
    </Tooltip>
  );
}

function DesktopGroupNav({
  label,
  icon,
  active,
  tabs,
  activeTab,
  onTabChange,
}: {
  label: string;
  icon: NavIconName;
  active: boolean;
  tabs: readonly PageTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <Dropdown
      align="left"
      width="w-40"
      renderTrigger={({ open, toggle }) => (
        <Tooltip label={label}>
          <button
            type="button"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-current={active ? "page" : undefined}
            title={label}
            className={`app-shell-nav-icon crt-icon flex h-10 w-10 items-center justify-center rounded-sm border-b-2 transition-colors ${
              active || open
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:border-primary/45 hover:text-text-normal"
            }`}
            onClick={toggle}
          >
            <NavIcon name={icon} />
          </button>
        </Tooltip>
      )}
    >
      {(close) => (
        <div role="menu" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="menuitem"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                activeTab === tab ? "text-primary" : "text-text-muted hover:bg-primary/8 hover:text-text-normal"
              }`}
              onClick={() => {
                onTabChange(tab);
                close();
              }}
            >
              <NavIcon name={TAB_ICON[tab]} size={18} />
              {tab}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

// top-level layout: header, tabs, content, footer

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  wsManager: WsManager;
  onOpenSearch?: () => void;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, wsManager, onOpenSearch, children }: AppShellProps) {
  const mapFirstMobile = activeTab === "Live" || activeTab === "Map" || activeTab === "Netgraph";
  return (
    <div className="crt-shell flex flex-col h-dvh" data-active-tab={activeTab.toLowerCase()}>
      <AppearancePreferenceSync />
      <ThemeAmbientLayer activeTab={activeTab} />
      <header className="app-shell-topbar crt-panel flex items-center justify-between gap-2 px-3 md:px-4 h-[46px] bg-bg-surface border-b border-border shrink-0">
        <BeaconWordmark className="app-shell-wordmark shrink-0" iconSize={22} textClassName="text-xs sm:text-sm" />
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          {onOpenSearch && (
            <Tooltip label="Search">
              <button
                type="button"
                aria-label="Search"
                className="crt-panel hidden h-9 w-9 items-center justify-center rounded border border-border bg-bg-raised text-text-muted transition-colors hover:border-primary hover:text-text-normal sm:flex"
                onClick={onOpenSearch}
                title="Search"
              >
                <NavIcon name="search" size={16} />
              </button>
            </Tooltip>
          )}
          <RegionSelector />
          <AppearanceMenu />
          <LiveBadge wsManager={wsManager} />
        </div>
      </header>

      <nav className="app-shell-tabs crt-panel hidden h-[44px] items-center gap-1 bg-bg-surface border-b border-border px-4 shrink-0 md:flex" aria-label="Pages">
        {DESKTOP_PAGES.map((item) => (
          <DesktopNavButton
            key={item.tab}
            label={item.tab}
            icon={item.icon}
            active={activeTab === item.tab}
            onClick={() => onTabChange(item.tab)}
          />
        ))}
        <DesktopGroupNav
          label="Monitor"
          icon="live"
          tabs={MONITOR_TABS}
          active={isMonitorTab(activeTab)}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
        <DesktopGroupNav
          label="Data"
          icon="data"
          tabs={DATA_TABS}
          active={isDataTab(activeTab)}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
        <DesktopGroupNav
          label="Tools"
          icon="search"
          tabs={TOOL_TABS}
          active={isToolTab(activeTab)}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
        <DesktopGroupNav
          label="System"
          icon="system"
          tabs={SYSTEM_TABS}
          active={isSystemTab(activeTab)}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      </nav>

      <main className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary key={activeTab}>{children}</ErrorBoundary>
      </main>

      <footer
        className={`crt-panel items-center gap-2 px-2 py-1 bg-bg-surface border-t border-border font-mono text-[10px] text-text-dim shrink-0 md:px-4 md:text-[11px] ${
          mapFirstMobile ? "hidden md:flex" : "flex"
        }`}
      >
        <span className="shrink-0">
          BEACON v<span className="animate-pulse font-bold text-green">{DISPLAY_VERSION}</span>
          {DISPLAY_BUILD && <span className="ml-1 text-text-muted">+{DISPLAY_BUILD}</span>}
        </span>
      </footer>

      <BottomNav activeTab={activeTab} onOpenSearch={onOpenSearch} onTabChange={onTabChange} />
    </div>
  );
}
