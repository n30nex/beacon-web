import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartCard } from "../../../src/features/stats/cards";

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
});
