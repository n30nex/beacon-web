import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveMetricValue } from "../../../src/features/home/LiveMetricValue";

describe("LiveMetricValue", () => {
  it("renders an exact grouped value without a live-region announcement", () => {
    render(<LiveMetricValue metric="observations" value={5_891_234} />);

    const value = screen.getByText("5,891,234");
    expect(value).toHaveAttribute("data-live-metric", "observations");
    expect(value).toHaveAttribute("data-pulse-phase", "idle");
    expect(value).not.toHaveAttribute("aria-live");
    expect(value).toHaveClass("home-live-metric-value");
  });

  it("alternates pulse phases only when the numeric value increases", () => {
    const { rerender } = render(<LiveMetricValue metric="packets" value={100} pulseRevision={0} />);
    const metric = screen.getByText("100");

    rerender(<LiveMetricValue metric="packets" value={101} pulseRevision={1} />);
    expect(metric).toHaveTextContent("101");
    expect(metric).toHaveAttribute("data-pulse-phase", "a");

    rerender(<LiveMetricValue metric="packets" value={102} pulseRevision={2} />);
    expect(metric).toHaveTextContent("102");
    expect(metric).toHaveAttribute("data-pulse-phase", "b");

    rerender(<LiveMetricValue metric="packets" value={99} pulseRevision={3} />);
    expect(metric).toHaveTextContent("99");
    expect(metric).toHaveAttribute("data-pulse-phase", "b");
  });

  it("continues updating values when reduced motion is requested", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { rerender } = render(<LiveMetricValue metric="live" value={9} />);

    rerender(<LiveMetricValue metric="live" value={10} />);
    expect(screen.getByText("10")).toHaveAttribute("data-pulse-phase", "a");

    matchMedia.mockRestore();
  });

  it("does not pulse while reconciliation has animation frozen", () => {
    const { rerender } = render(
      <LiveMetricValue metric="packets" value={10} pulseRevision={0} pulseEnabled={false} />,
    );

    rerender(<LiveMetricValue metric="packets" value={11} pulseRevision={1} pulseEnabled={false} />);
    expect(screen.getByText("11")).toHaveAttribute("data-pulse-phase", "idle");

    rerender(<LiveMetricValue metric="packets" value={12} pulseRevision={2} pulseEnabled />);
    expect(screen.getByText("12")).toHaveAttribute("data-pulse-phase", "a");
  });
});
