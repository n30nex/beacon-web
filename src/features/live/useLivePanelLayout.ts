import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

const LIVE_DESKTOP_PANEL_STORAGE_KEY = "beacon-live-desktop-panel";
const LIVE_DESKTOP_LAYOUT_WIDTH = 1024;

function liveInspectorRailStyle(desktop: boolean, expanded: boolean): CSSProperties {
  if (desktop) {
    return {
      bottom: 86,
      left: "auto",
      maxHeight: "none",
      right: "0.75rem",
      top: "0.75rem",
      width: 340,
    };
  }
  return {
    bottom: 58,
    height: expanded ? undefined : 96,
    left: "0.5rem",
    maxHeight: expanded ? "46dvh" : 96,
    right: "0.5rem",
  };
}

function liveCommandDockStyle(desktop: boolean): CSSProperties {
  if (desktop) {
    return {
      bottom: "0.75rem",
      flexWrap: "wrap",
      gap: "0.5rem",
      left: "auto",
      maxWidth: "calc(100vw - 372px)",
      overflowX: "auto",
      padding: "0.5rem",
      right: 360,
      width: "fit-content",
    };
  }
  return {
    bottom: "0.375rem",
    flexWrap: "nowrap",
    gap: "0.25rem",
    left: "0.5rem",
    maxWidth: "calc(100vw - 1rem)",
    overflowX: "auto",
    padding: "0.25rem",
    right: "0.5rem",
  };
}

export function useLivePanelLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileConsoleOpen, setMobileConsoleOpen] = useState(false);
  const [desktopRailOpen, setDesktopRailOpen] = useState(() => localStorage.getItem(LIVE_DESKTOP_PANEL_STORAGE_KEY) !== "collapsed");
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? LIVE_DESKTOP_LAYOUT_WIDTH : window.innerWidth));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const desktopLiveLayout = viewportWidth >= LIVE_DESKTOP_LAYOUT_WIDTH;
  const compactLiveLayout = viewportWidth < 768;
  const feedVisible = desktopLiveLayout && desktopRailOpen;
  const mobileConsoleExpanded = false;

  const toggleSettings = useCallback(() => {
    setMobileConsoleOpen(false);
    setSettingsOpen((value) => !value);
  }, []);

  const toggleConsole = useCallback(() => {
    if (compactLiveLayout) {
      setSettingsOpen(false);
      setMobileConsoleOpen((value) => !value);
      return;
    }
    setDesktopRailOpen((value) => {
      const next = !value;
      try {
        localStorage.setItem(LIVE_DESKTOP_PANEL_STORAGE_KEY, next ? "rail" : "collapsed");
      } catch {
        // private mode / quota: the toggle remains live for this session
      }
      return next;
    });
  }, [compactLiveLayout]);

  return {
    commandDockStyle: useMemo(() => liveCommandDockStyle(desktopLiveLayout), [desktopLiveLayout]),
    compactLiveLayout,
    desktopLiveLayout,
    desktopRailOpen,
    feedVisible,
    inspectorRailStyle: useMemo(
      () => liveInspectorRailStyle(desktopLiveLayout, mobileConsoleExpanded),
      [desktopLiveLayout, mobileConsoleExpanded],
    ),
    mobileConsoleOpen,
    setMobileConsoleOpen,
    setSettingsOpen,
    settingsOpen,
    toggleConsole,
    toggleSettings,
  };
}
