// Page-load splash: pulsing BEACON wordmark over a themed backdrop, shown once
// per browser session, then faded out and removed from the DOM.
//
// To remove the splash entirely: delete this file and remove its import +
// <SplashScreen /> line from src/App.tsx. Nothing else references it.

import { useState, useEffect } from "react";
import { BeaconLogo } from "./BeaconLogo";

const SPLASH_KEY = "beacon-splash-shown";
const VISIBLE_MS = 2000;
const FADE_MS = 400;

export function SplashScreen() {
  // Synchronous gate: decided before first paint so StrictMode's double-mount
  // (and any same-session reload) never re-shows it.
  const [render, setRender] = useState(() => {
    try {
      if (typeof sessionStorage === "undefined") return false;
      return sessionStorage.getItem(SPLASH_KEY) !== "1";
    } catch {
      return false;
    }
  });
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!render) return;
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // sessionStorage may throw under privacy/quota limits — harmless here.
    }
    const fadeTimer = setTimeout(() => setFading(true), VISIBLE_MS);
    const doneTimer = setTimeout(() => setRender(false), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [render]);

  if (!render) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-bg-base transition-opacity duration-[400ms] ease-out ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <span className="crt-panel inline-flex flex-col items-center gap-7 border border-border bg-bg-surface/90 px-10 py-9 text-primary shadow-2xl">
        <BeaconLogo size={160} pulse />
        <span className="inline-flex flex-col items-center gap-2.5">
          <span
            className="crt-title crt-terminal-cursor font-medium tracking-[0.3em] uppercase text-5xl leading-none pl-[0.3em]"
          >
            BEACON
          </span>
          <span className="font-mono text-text-muted text-xs tracking-[0.12em] uppercase">
            MeshCore Network Analyzer
          </span>
        </span>
      </span>
    </div>
  );
}
