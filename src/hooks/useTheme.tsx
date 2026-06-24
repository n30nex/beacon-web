/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type DesignMode,
  type ModernDesignStyle,
  type Theme,
  DEFAULT_MODERN_STYLE_ID,
  DEFAULT_THEME_ID,
  applyDesignMode,
  applyModernDesign,
  applyTheme,
  loadModernDesigns,
  loadThemes,
} from "../lib/themes";

const STORAGE_KEY = "beacon-theme";
const DESIGN_MODE_STORAGE_KEY = "beacon-design-mode";
const MODERN_STYLE_STORAGE_KEY = "beacon-modern-style";

interface ThemeCtx {
  themeId: string;
  themes: Theme[];
  setThemeId: (id: string) => void;
  designMode: DesignMode;
  modernStyleId: string;
  modernStyles: ModernDesignStyle[];
  setDesignMode: (mode: DesignMode) => void;
  setModernStyleId: (id: string) => void;
  paletteRev: number;
}

const ThemeContext = createContext<ThemeCtx>({
  themeId: DEFAULT_THEME_ID,
  themes: [],
  setThemeId: () => {},
  designMode: "modern",
  modernStyleId: DEFAULT_MODERN_STYLE_ID,
  modernStyles: [],
  setDesignMode: () => {},
  setModernStyleId: () => {},
  paletteRev: 0,
});

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy modes; the active page still updates.
  }
}

function readDesignMode(): DesignMode {
  return readStorage(DESIGN_MODE_STORAGE_KEY) === "retro" ? "retro" : "modern";
}

function applySelection(mode: DesignMode, theme: Theme, modernStyle: ModernDesignStyle) {
  if (mode === "modern") {
    document.documentElement.dataset.theme = theme.id;
    applyDesignMode("modern");
    applyModernDesign(modernStyle);
    return;
  }
  document.documentElement.dataset.modernStyle = modernStyle.id;
  applyDesignMode("retro");
  applyTheme(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [modernStyles, setModernStyles] = useState<ModernDesignStyle[]>([]);
  const [paletteRev, setPaletteRev] = useState(0);
  const [themeId, setThemeIdState] = useState(() => readStorage(STORAGE_KEY) ?? DEFAULT_THEME_ID);
  const [designMode, setDesignModeState] = useState<DesignMode>(readDesignMode);
  const [modernStyleId, setModernStyleIdState] = useState(
    () => readStorage(MODERN_STYLE_STORAGE_KEY) ?? DEFAULT_MODERN_STYLE_ID,
  );

  useEffect(() => {
    Promise.all([loadThemes(), loadModernDesigns()]).then(([loadedThemes, loadedModernStyles]) => {
      setThemes(loadedThemes);
      setModernStyles(loadedModernStyles);

      const savedTheme = readStorage(STORAGE_KEY);
      const themeMatch = loadedThemes.find((t) => t.id === savedTheme) ?? loadedThemes[0];
      const savedModernStyle = readStorage(MODERN_STYLE_STORAGE_KEY);
      const modernStyleMatch =
        loadedModernStyles.find((style) => style.id === savedModernStyle) ??
        loadedModernStyles.find((style) => style.id === DEFAULT_MODERN_STYLE_ID) ??
        loadedModernStyles[0];
      if (!themeMatch || !modernStyleMatch) return;

      const savedMode = readDesignMode();
      applySelection(savedMode, themeMatch, modernStyleMatch);
      if (savedTheme !== themeMatch.id) writeStorage(STORAGE_KEY, themeMatch.id);
      if (savedModernStyle !== modernStyleMatch.id) writeStorage(MODERN_STYLE_STORAGE_KEY, modernStyleMatch.id);
      writeStorage(DESIGN_MODE_STORAGE_KEY, savedMode);

      setPaletteRev((r) => r + 1);
      setThemeIdState(themeMatch.id);
      setModernStyleIdState(modernStyleMatch.id);
      setDesignModeState(savedMode);
    });
  }, []);

  const setThemeId = useCallback(
    (id: string) => {
      const match = themes.find((t) => t.id === id);
      if (!match) return;
      const modernStyle = modernStyles.find((style) => style.id === modernStyleId) ?? modernStyles[0];
      if (modernStyle) document.documentElement.dataset.modernStyle = modernStyle.id;
      applyDesignMode("retro");
      applyTheme(match);
      setPaletteRev((r) => r + 1);
      writeStorage(STORAGE_KEY, id);
      writeStorage(DESIGN_MODE_STORAGE_KEY, "retro");
      setThemeIdState(id);
      setDesignModeState("retro");
    },
    [modernStyleId, modernStyles, themes],
  );

  const setDesignMode = useCallback(
    (mode: DesignMode) => {
      const theme = themes.find((t) => t.id === themeId) ?? themes[0];
      const modernStyle = modernStyles.find((style) => style.id === modernStyleId) ?? modernStyles[0];
      if (!theme || !modernStyle) return;
      applySelection(mode, theme, modernStyle);
      setPaletteRev((r) => r + 1);
      writeStorage(DESIGN_MODE_STORAGE_KEY, mode);
      if (mode === "modern") writeStorage(MODERN_STYLE_STORAGE_KEY, modernStyle.id);
      setDesignModeState(mode);
      setThemeIdState(theme.id);
      setModernStyleIdState(modernStyle.id);
    },
    [modernStyleId, modernStyles, themeId, themes],
  );

  const setModernStyleId = useCallback(
    (id: string) => {
      const modernStyle = modernStyles.find((style) => style.id === id);
      const theme = themes.find((t) => t.id === themeId) ?? themes[0];
      if (!modernStyle || !theme) return;
      document.documentElement.dataset.theme = theme.id;
      applyDesignMode("modern");
      applyModernDesign(modernStyle);
      setPaletteRev((r) => r + 1);
      writeStorage(DESIGN_MODE_STORAGE_KEY, "modern");
      writeStorage(MODERN_STYLE_STORAGE_KEY, id);
      setDesignModeState("modern");
      setThemeIdState(theme.id);
      setModernStyleIdState(id);
    },
    [modernStyles, themeId, themes],
  );

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        themes,
        setThemeId,
        designMode,
        modernStyleId,
        modernStyles,
        setDesignMode,
        setModernStyleId,
        paletteRev,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
