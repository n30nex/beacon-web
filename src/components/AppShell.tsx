import { type ReactNode, useState, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useRegion, useRegionSelection, useRegions } from "../hooks/useRegion";
import { ALL_REGIONS, isAllRegions, type RegionSelection } from "../hooks/region-selection";
import { useWsDiagnostics } from "../hooks/useWsDiagnostics";
import { useTheme } from "../hooks/useTheme";
import { Dropdown } from "./Dropdown";
import { BottomNav } from "./BottomNav";
import { BeaconWordmark } from "./BeaconWordmark";
import { TerminalLoadingState } from "./TerminalLoader";
import { getBrokers, getHealth, getIatas, getLiveSummary, getReadiness } from "../api/client";
import { TABS } from "../lib/constants";
import { sanitizeDisplayLabel } from "../lib/display-label";
import type { WsManager } from "../api/ws-manager";

// header widgets: WS status, region picker, theme picker

type FontMode = "retro" | "modern";
type ScanlineMode = "on" | "off";

const FONT_MODE_KEY = "beacon-font-mode";
const SCANLINES_KEY = "beacon-scanlines";
const DISPLAY_VERSION = "133.7";

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

function RuntimeMetric({ label, value, tone = "normal" }: { label: string; value: ReactNode; tone?: "normal" | "good" | "warn" | "danger" }) {
  const toneClass = tone === "good" ? "text-green" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-text-normal";
  return (
    <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-0.5 truncate text-[11px] font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LiveRuntimePanel({ wsManager }: { wsManager: WsManager }) {
  const diagnostics = useWsDiagnostics(wsManager);
  const { iatas, regionKey } = useRegion();
  const now = useNow();
  const lastEventAge = formatDuration(now - diagnostics.lastEventTimestamp);

  const health = useQuery({
    queryKey: ["runtime-health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
  const readiness = useQuery({
    queryKey: ["runtime-readiness"],
    queryFn: getReadiness,
    refetchInterval: 30_000,
  });
  const brokers = useQuery({
    queryKey: ["runtime-brokers"],
    queryFn: getBrokers,
    refetchInterval: 30_000,
  });
  const live = useQuery({
    queryKey: ["runtime-live-summary", regionKey],
    queryFn: () => getLiveSummary(iatas),
    refetchInterval: 15_000,
  });

  const brokerRows = brokers.data ?? health.data?.brokers ?? [];
  const connectedBrokers = brokerRows.filter((b) => b.connected).length;
  const brokerTone = brokerRows.length === 0 ? "warn" : connectedBrokers === brokerRows.length ? "good" : "danger";
  const apiTone = health.data?.status === "ok" ? "good" : health.data?.status === "degraded" ? "warn" : health.isError ? "danger" : "normal";
  const readyTone = readiness.data?.ready ? "good" : readiness.isError ? "danger" : readiness.data ? "warn" : "normal";
  const scopeLabel = iatas ? (iatas.length <= 3 ? iatas.join(", ") : `${iatas.length} IATA`) : "ALL";
  const gapLabel =
    diagnostics.laggedNoticeCount === 0
      ? "NONE"
      : `${diagnostics.lastLaggedDroppedCount ?? 0} dropped`;
  const gapDetail = diagnostics.lastLaggedAt ? `${formatDuration(now - diagnostics.lastLaggedAt)} ago` : "";

  return (
    <div className="w-72 space-y-2 px-3 py-2 font-mono">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim">Runtime</div>
          <div className="text-sm font-semibold text-text-bright">{diagnostics.status.toUpperCase()}</div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1 text-right text-[10px] text-text-muted">
          <div className="text-text-dim">SCOPE</div>
          <div className="max-w-28 truncate text-text-normal">{scopeLabel}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <RuntimeMetric label="Last Event" value={lastEventAge} tone={diagnostics.status === "connected" ? "good" : "warn"} />
        <RuntimeMetric label="Reconnects" value={diagnostics.reconnectAttempt} tone={diagnostics.reconnectAttempt > 0 ? "warn" : "normal"} />
        <RuntimeMetric label="Parse Errors" value={diagnostics.parseFailureCount} tone={diagnostics.parseFailureCount > 0 ? "danger" : "normal"} />
        <RuntimeMetric label="API" value={health.data?.status ?? (health.isError ? "DOWN" : "...")} tone={apiTone} />
        <RuntimeMetric label="Ready" value={readiness.data?.ready === undefined ? (readiness.isError ? "NO" : "...") : readiness.data.ready ? "YES" : "NO"} tone={readyTone} />
        <RuntimeMetric label="Brokers" value={`${connectedBrokers}/${brokerRows.length || "?"}`} tone={brokerTone} />
        <RuntimeMetric label="Live Packets" value={live.data?.packetCount ?? "..."} tone={live.isError ? "danger" : "normal"} />
        <RuntimeMetric label="Gap Heal" value={gapDetail ? `${gapLabel} ${gapDetail}` : gapLabel} tone={diagnostics.laggedNoticeCount > 0 ? "warn" : "normal"} />
      </div>

      {diagnostics.activeSubscriptionId && (
        <div className="truncate border-t border-border-subtle pt-2 text-[10px] text-text-dim">
          SUB {diagnostics.activeSubscriptionId}
        </div>
      )}

      {brokerRows.length > 0 && (
        <div className="max-h-24 space-y-1 overflow-y-auto border-t border-border-subtle pt-2">
          {brokerRows.map((broker) => (
            <div key={broker.name} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-text-muted">{broker.name}</span>
              <span className={broker.connected ? "text-green" : "text-danger"}>{broker.connected ? "CONNECTED" : "DOWN"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveBadge({ wsManager }: { wsManager: WsManager }) {
  const diagnostics = useWsDiagnostics(wsManager);
  const now = useNow();
  const staleStr = formatDuration(now - diagnostics.lastEventTimestamp);
  const status = diagnostics.status;
  const toneClass =
    status === "connected"
      ? "text-green bg-green/8 border-green/25"
      : status === "connecting"
        ? "text-warn bg-warn/7 border-warn/25"
        : "text-danger bg-danger/8 border-danger/25";
  const label = status === "connected" ? "LIVE" : status === "connecting" ? `STALE ${staleStr}` : status === "error" ? "ERROR" : "OFFLINE";

  return (
    <Dropdown
      width="w-72"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Live runtime ${status}`}
          className={`crt-panel flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-primary ${toneClass}`}
          onClick={toggle}
        >
          {status === "connected" && <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />}
          {label}
          {diagnostics.parseFailureCount > 0 && <span className="text-danger">ERR {diagnostics.parseFailureCount}</span>}
        </button>
      )}
    >
      {() => <LiveRuntimePanel wsManager={wsManager} />}
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

  const { data: iatas, isError: iatasError } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 60_000,
  });

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
          className="crt-panel flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-bright font-mono text-xs font-semibold hover:border-primary transition-colors"
          onClick={toggle}
        >
          <span className="text-text-muted font-normal text-[11px]">REGION</span>
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

          <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-text-dim border-t border-border-subtle mt-1">IATA</div>
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

function ThemePicker() {
  const { themeId, themes, setThemeId, designMode } = useTheme();
  const current = themes.find((t) => t.id === themeId);

  return (
    <Dropdown
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label="Retro color theme"
          className="crt-panel flex items-center gap-1.5 bg-bg-raised border border-border rounded px-2 py-1 text-text-muted font-mono text-[11px] hover:text-text-normal hover:border-primary transition-colors"
          onClick={toggle}
        >
          <span
            className="w-2.5 h-2.5 shrink-0 border border-primary/40 shadow-[0_0_8px_currentColor]"
            style={{ background: current?.vars["--palette-primary"] }}
          />
          <span className="text-text-dim text-[11px]">▾</span>
        </button>
      )}
    >
      {(close) => (
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
                close();
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
      )}
    </Dropdown>
  );
}

function DesignPicker() {
  const { designMode, modernStyleId, modernStyles, setDesignMode, setModernStyleId } = useTheme();
  const current = modernStyles.find((style) => style.id === modernStyleId);
  const label = designMode === "modern" ? current?.name ?? "Modern Glass" : "Retro CRT";

  return (
    <Dropdown
      width="w-72"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Design mode ${label}`}
          className={`crt-panel flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
            designMode === "modern"
              ? "border-primary/60 bg-primary/12 text-text-bright hover:border-primary"
              : "border-border bg-bg-raised text-text-muted hover:border-primary hover:text-text-normal"
          }`}
          onClick={toggle}
        >
          <span className="flex h-3.5 w-5 shrink-0 overflow-hidden rounded-sm border border-white/20">
            {(current?.swatches ?? ["var(--color-primary)", "var(--color-secondary)", "var(--color-bg-base)"]).slice(0, 3).map((swatch) => (
              <span key={swatch} className="flex-1" style={{ background: swatch }} />
            ))}
          </span>
          <span className="hidden max-w-24 truncate sm:inline">{designMode === "modern" ? "GLASS" : "RETRO"}</span>
          <span className="text-text-dim text-[11px]">v</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-colors ${
              designMode === "retro" ? "bg-primary/10 text-text-bright" : "text-text-muted hover:bg-primary/8 hover:text-text-normal"
            }`}
            onClick={() => {
              setDesignMode("retro");
              close();
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
                  close();
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
      )}
    </Dropdown>
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

function ThemeAmbientLayer({ activeTab }: { activeTab: string }) {
  const { themeId, designMode, modernStyleId } = useTheme();
  return (
    <div
      className="theme-ambient-layer"
      data-ambient-theme={themeId}
      data-ambient-design={designMode}
      data-ambient-modern-style={modernStyleId}
      data-ambient-tab={activeTab.toLowerCase()}
      aria-hidden="true"
    >
      <span className="theme-ambient-sweep" />
      <span className="theme-ambient-blip theme-ambient-blip-a" />
      <span className="theme-ambient-blip theme-ambient-blip-b" />
      <span className="theme-ambient-ticker">
        BEACON OPS // {activeTab.toUpperCase()} // CREWNET // BROKER BUS // PLEASE WAIT
      </span>
    </div>
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
  const mapFirstMobile = activeTab === "Atlas" || activeTab === "Live" || activeTab === "Map";
  return (
    <div className="crt-shell flex flex-col h-dvh" data-active-tab={activeTab.toLowerCase()}>
      <ThemeAmbientLayer activeTab={activeTab} />
      <header className="app-shell-topbar crt-panel flex items-center justify-between gap-2 px-3 md:px-4 h-[46px] bg-bg-surface border-b border-border shrink-0">
        <BeaconWordmark iconSize={22} textClassName="text-sm" />
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          {onOpenSearch && (
            <button
              type="button"
              className="crt-panel hidden items-center gap-1.5 rounded border border-border bg-bg-raised px-2 py-1 font-mono text-[11px] text-text-muted transition-colors hover:border-primary hover:text-text-normal sm:flex"
              onClick={onOpenSearch}
              title="Global search"
            >
              SEARCH
              <span className="text-[9px] text-text-dim">CTRL K</span>
            </button>
          )}
          <RegionSelector />
          <ThemePicker />
          <DesignPicker />
          <LiveBadge wsManager={wsManager} />
        </div>
      </header>

      <nav className="app-shell-tabs crt-panel hidden md:flex bg-bg-surface border-b border-border px-4 shrink-0" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-[18px] py-2.5 text-xs font-medium tracking-wider border-b-2 cursor-pointer transition-colors uppercase ${
              activeTab === tab
                ? "text-primary border-primary"
                : "text-text-muted border-transparent hover:text-text-normal"
            }`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <footer
        className={`crt-panel items-center gap-2 px-2 py-1 bg-bg-surface border-t border-border font-mono text-[10px] text-text-dim shrink-0 md:px-4 md:text-[11px] ${
          mapFirstMobile ? "hidden md:flex" : "flex"
        }`}
      >
        <span className="shrink-0">
          BEACON v<span className="animate-pulse font-bold text-green">{DISPLAY_VERSION}</span>
        </span>
        <span className="text-border-subtle" aria-hidden>|</span>
        <DisplayPreferences />
      </footer>

      <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
