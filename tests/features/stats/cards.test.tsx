import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChartCard, StatsQueryNotice } from "../../../src/features/stats/cards";

vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));

describe("ChartCard route states", () => {
  it("explains chart endpoint failures", () => {
    render(<ChartCard title="Traffic" option={{}} isError />);

    expect(screen.getByText("Chart data unavailable")).toBeInTheDocument();
    expect(screen.getByText(/stats endpoint did not respond/i)).toBeInTheDocument();
  });

  it("explains empty chart windows", () => {
    render(<ChartCard title="Traffic" option={{}} isEmpty />);

    expect(screen.getByText("No matching telemetry")).toBeInTheDocument();
    expect(screen.getByText(/region and time window returned no series/i)).toBeInTheDocument();
  });

  it("keeps the terminal loading state for pending charts", () => {
    render(<ChartCard title="Traffic" option={{}} isLoading />);

    expect(screen.getByText("QUERYING CHART")).toBeInTheDocument();
    expect(screen.getByText("PLEASE WAIT")).toBeInTheDocument();
  });

  it("keeps stale chart content visible when a background refresh fails", () => {
    render(<ChartCard title="Traffic" option={{}} isError isEmpty={false} />);

    expect(screen.queryByText("Chart data unavailable")).not.toBeInTheDocument();
  });
});

describe("StatsQueryNotice", () => {
  it("shows the last good sync and retries failed cached queries", () => {
    const refetch = vi.fn(async () => undefined);
    render(
      <StatsQueryNotice
        queries={[{ data: { items: [] }, dataUpdatedAt: Date.UTC(2026, 6, 12, 12), error: new Error("timeout"), isError: true, refetch }]}
      />,
    );

    expect(screen.getByText("Cached analytics shown")).toBeInTheDocument();
    expect(screen.getByText(/last good sync/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
