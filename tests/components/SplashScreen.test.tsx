import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SplashScreen } from "../../src/components/SplashScreen";

const BOOT_KEY = "beacon-terminal-boot-shown";
const originalMatchMedia = window.matchMedia;

function setUrl(search = "") {
  window.history.pushState({}, "", `/${search}`);
}

function installMatchMedia(reduced = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : /hover/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  setUrl();
  installMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  setUrl();
});

describe("SplashScreen", () => {
  it("shows the terminal boot once per session", () => {
    const first = render(<SplashScreen />);
    expect(screen.getByRole("status", { name: /terminal boot/i })).toHaveTextContent("MU/TH/UR LINK");
    expect(sessionStorage.getItem(BOOT_KEY)).toBe("1");

    act(() => vi.advanceTimersByTime(4700));
    expect(screen.queryByRole("status", { name: /terminal boot/i })).not.toBeInTheDocument();
    first.unmount();

    render(<SplashScreen />);
    expect(screen.queryByRole("status", { name: /terminal boot/i })).not.toBeInTheDocument();
  });

  it("supports skip and force preview query params", () => {
    sessionStorage.setItem(BOOT_KEY, "1");
    setUrl("?boot=0");
    const skipped = render(<SplashScreen />);
    expect(screen.queryByRole("status", { name: /terminal boot/i })).not.toBeInTheDocument();
    skipped.unmount();

    setUrl("?boot=1");
    render(<SplashScreen />);
    expect(screen.getByRole("status", { name: /terminal boot/i })).toHaveTextContent("WY-STYLE DIAGNOSTIC");
  });

  it("uses a shorter sequence when reduced motion is requested", () => {
    installMatchMedia(true);
    render(<SplashScreen />);
    expect(screen.getByRole("status", { name: /terminal boot/i })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByRole("status", { name: /terminal boot/i })).not.toBeInTheDocument();
  });
});
