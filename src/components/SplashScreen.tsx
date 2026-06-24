import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { BeaconLogo } from "./BeaconLogo";
import { TerminalCursor, TerminalSpinner } from "./TerminalLoader";

const BOOT_KEY = "beacon-terminal-boot-shown";
const VISIBLE_MS = 1200;
const FADE_MS = 200;
const REDUCED_VISIBLE_MS = 500;
const REDUCED_FADE_MS = 80;

interface BootVariant {
  eyebrow: string;
  title: string;
  subtitle: string;
  prompt: string;
  signal: string;
  matrix: string[];
  diagnostics: Array<[string, string]>;
  stages: string[];
}

const BOOT_VARIANTS: Record<string, BootVariant> = {
  "crt-amber": {
    eyebrow: "WEYLAND-YUTANI FIELD TERMINAL",
    title: "MU/TH/UR LINK",
    subtitle: "Beacon mesh operations console",
    prompt: "WY-STYLE DIAGNOSTIC",
    signal: "INDUSTRIAL MAINFRAME",
    matrix: ["SYS 221-B", "CREWNET", "BROKER BUS", "OPS READY"],
    diagnostics: [["CORE", "LOCK"], ["API", "READY"], ["CACHE", "WARM"], ["RF", "LISTEN"]],
    stages: [
      "POST: PHOSPHOR DISPLAY BUS",
      "CHECK: MAP CORE MEMORY",
      "SYNC: MQTT BROKER BUS",
      "QUERY: REGION TABLES",
      "ARM: BEACON OPS CONSOLE",
    ],
  },
  "crt-green": {
    eyebrow: "MU/TH/UR REMOTE SESSION",
    title: "CREWNET UPLINK",
    subtitle: "Monochrome regional telemetry",
    prompt: "SHIPBOARD NETWORK CHECK",
    signal: "MONOCHROME SHIP LINK",
    matrix: ["TTY 77", "RX GREEN", "ROUTE BUS", "READY"],
    diagnostics: [["TTY", "OK"], ["WS", "SYNC"], ["IATA", "SCAN"], ["CREW", "NET"]],
    stages: [
      "POST: TERMINAL FONT ROM",
      "CHECK: OBSERVER STATUS",
      "SYNC: PACKET FEED",
      "QUERY: NODE INDEX",
      "ARM: LIVE OPERATIONS",
    ],
  },
  "crt-ibm-dos": {
    eyebrow: "BEACON DOS/POST",
    title: "WY BIOS LINK",
    subtitle: "Regional mesh boot loader",
    prompt: "C:\\BEACON\\BOOT",
    signal: "BIOS VECTOR LOAD",
    matrix: ["INT 10H", "NET BIOS", "WS BUS", "READY"],
    diagnostics: [["BIOS", "OK"], ["MEM", "640K"], ["COM", "ARM"], ["MAP", "LOAD"]],
    stages: [
      "POST: VIDEO BIOS",
      "CHECK: CACHE SEGMENTS",
      "SYNC: API RUNTIME",
      "QUERY: PACKET TABLES",
      "LOAD: ATLAS/LIVE MODULES",
    ],
  },
  "crt-3278": {
    eyebrow: "3278 MAINFRAME SESSION",
    title: "MU/TH/UR FIELD 01",
    subtitle: "Block terminal mesh monitor",
    prompt: "WY-OPS FIELD VERIFY",
    signal: "FIELD CONTROL BLOCK",
    matrix: ["LU 0001", "SNA BUS", "RF GRID", "READY"],
    diagnostics: [["LU", "BIND"], ["SNA", "OK"], ["RF", "GRID"], ["SCOPE", "SET"]],
    stages: [
      "BIND: DISPLAY STATION",
      "CHECK: SCOPE FIELDS",
      "SYNC: OBSERVER CURSOR",
      "QUERY: IATA REGIONS",
      "ENTER: OPERATOR READY",
    ],
  },
  "crt-apple": {
    eyebrow: "BEACON ROM MONITOR",
    title: "MU/TH/UR BASIC",
    subtitle: "Disk-style terminal startup",
    prompt: "] RUN WY.BEACON",
    signal: "ROM DISK MONITOR",
    matrix: ["ROM OK", "DISK II", "RF IO", "READY"],
    diagnostics: [["ROM", "OK"], ["DISK", "SEEK"], ["IO", "READY"], ["RUN", "GO"]],
    stages: [
      "READ: DISPLAY PROM",
      "CHECK: DISK BUFFER",
      "SYNC: MESSAGE CHANNELS",
      "QUERY: RADIO PRESETS",
      "RUN: BEACON CONSOLE",
    ],
  },
};

const MODERN_BOOT_VARIANT: BootVariant = {
  eyebrow: "BEACON",
  title: "Beacon",
  subtitle: "Mesh telemetry console",
  prompt: "Opening network view",
  signal: "Glass signal layer",
  matrix: ["HOME", "LIVE", "MAP", "DATA"],
  diagnostics: [["API", "READY"], ["WS", "SYNC"], ["MAP", "READY"], ["DATA", "READY"]],
  stages: [
    "Preparing live feed",
    "Loading packet index",
    "Syncing observer map",
    "Opening Beacon home",
  ],
};

function getBootParam(): "force" | "skip" | null {
  if (typeof window === "undefined") return null;
  const boot = new URLSearchParams(window.location.search).get("boot");
  if (boot === "1" || boot?.toLowerCase() === "true") return "force";
  if (boot === "0" || boot?.toLowerCase() === "false") return "skip";
  return null;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldRenderBoot() {
  const bootParam = getBootParam();
  if (bootParam === "skip") return false;
  if (bootParam === "force") return true;
  try {
    return sessionStorage.getItem(BOOT_KEY) !== "1";
  } catch {
    return false;
  }
}

export function SplashScreen() {
  const { themeId, designMode } = useTheme();
  const [render, setRender] = useState(shouldRenderBoot);
  const [fading, setFading] = useState(false);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const forced = getBootParam() === "force";
  const modern = designMode === "modern";
  const variant = modern ? MODERN_BOOT_VARIANT : BOOT_VARIANTS[themeId] ?? BOOT_VARIANTS["crt-amber"];
  const visibleMs = reducedMotion ? REDUCED_VISIBLE_MS : VISIBLE_MS;
  const fadeMs = reducedMotion ? REDUCED_FADE_MS : FADE_MS;

  useEffect(() => {
    if (!render) return;
    if (!forced) {
      try {
        sessionStorage.setItem(BOOT_KEY, "1");
      } catch {
        // sessionStorage can fail under privacy/quota limits; the boot can still finish normally.
      }
    }
    const fadeTimer = window.setTimeout(() => setFading(true), visibleMs);
    const doneTimer = window.setTimeout(() => setRender(false), visibleMs + fadeMs);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [fadeMs, forced, render, visibleMs]);

  if (!render || !variant) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Beacon loading sequence"
      className={`terminal-boot-screen ${modern ? "terminal-boot-screen-modern" : ""} fixed inset-0 z-[9999] flex items-center justify-center p-3 text-primary transition-opacity ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${fadeMs}ms` }}
    >
      <div className="terminal-boot-frame px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <BeaconLogo size={52} pulse={!reducedMotion} className="shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">{variant.eyebrow}</div>
              <div className="crt-title mt-1 truncate text-3xl leading-none sm:text-5xl">{variant.title}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-dim">{variant.subtitle}</div>
            </div>
          </div>
          <div className="hidden shrink-0 grid-cols-2 gap-1 text-right font-mono text-[10px] uppercase tracking-wider text-text-muted sm:grid">
            {variant.matrix.map((item) => (
              <span key={item} className="border border-border-subtle bg-bg-base/50 px-2 py-1">{item}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 pt-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 font-mono">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-bright">
              <TerminalSpinner />
              <span>{variant.prompt}</span>
              <TerminalCursor />
            </div>
            <div className="flex flex-col gap-1.5 text-[12px] uppercase tracking-[0.12em] text-text-muted">
              {variant.stages.map((stage, i) => (
                <div
                  key={stage}
                  className="terminal-boot-line flex items-center gap-2"
                  style={reducedMotion ? { opacity: 1, transform: "none", animation: "none" } : { animationDelay: `${160 + i * 140}ms` }}
                >
                  <span className="text-primary">&gt;</span>
                  <span className="min-w-0 flex-1 truncate">{stage}</span>
                  <span className="terminal-boot-stage-meter" aria-hidden>
                    <span style={reducedMotion ? { width: "100%", animation: "none" } : { animationDelay: `${220 + i * 140}ms` }} />
                  </span>
                  <span className="text-green">OK</span>
                </div>
              ))}
            </div>
          </div>

          <div className="terminal-boot-visual border border-border-subtle bg-bg-base/40 p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
            <div className="mb-2 flex items-center justify-between gap-2 text-text-muted">
              <span>BOOT VECTOR</span>
              <span className="text-primary">{variant.signal}</span>
            </div>
            <div className="terminal-boot-scope mx-auto mb-3" aria-hidden>
              <span className="terminal-boot-scope-core" />
              <span className="terminal-boot-scope-ring terminal-boot-scope-ring-1" />
              <span className="terminal-boot-scope-ring terminal-boot-scope-ring-2" />
              <span className="terminal-boot-scope-sweep" />
              <span className="terminal-boot-scope-blip terminal-boot-scope-blip-1" />
              <span className="terminal-boot-scope-blip terminal-boot-scope-blip-2" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {variant.diagnostics.map(([label, value]) => (
                <div key={label} className="contents">
                  <span>{label}</span>
                  <span className={value === "READY" || value === "OK" || value === "LOCK" || value === "GO" ? "text-green" : "text-primary"}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="terminal-boot-ticker mt-3 border-t border-border-subtle pt-2 text-primary">
              <span>{modern ? "HOME // LIVE // MAP // DATA // SYSTEM READY" : `${variant.prompt} // CREWNET // BROKER BUS // BEACON OPS READY`}</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim">
            <span>PLEASE WAIT</span>
            <span>BEACON OPS READY</span>
          </div>
          <span className="terminal-progress">
            <span
              className="terminal-progress-fill terminal-boot-progress-fill"
              style={reducedMotion ? { width: "100%", animation: "none" } : undefined}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
