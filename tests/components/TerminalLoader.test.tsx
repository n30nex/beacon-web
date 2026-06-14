import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminalLoadingState, TerminalSkeletonRows, TerminalSpinner } from "../../src/components/TerminalLoader";

describe("TerminalLoader", () => {
  it("renders an accessible loading state", () => {
    render(<TerminalLoadingState label="QUERYING PACKETS" detail="PLEASE WAIT" />);
    expect(screen.getByRole("status")).toHaveTextContent("QUERYING PACKETS");
    expect(screen.getByRole("status")).toHaveTextContent("PLEASE WAIT");
  });

  it("renders the ASCII spinner glyphs as decorative text", () => {
    const { container } = render(<TerminalSpinner />);
    expect(container.textContent).toBe("/-\\|");
  });

  it("renders terminal skeleton rows with a live status", () => {
    render(<TerminalSkeletonRows rows={3} />);
    expect(screen.getByRole("status", { name: "QUERYING ROWS" })).toBeInTheDocument();
  });
});
