import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PacketAnalyzerDrawer } from "../../../src/features/packets/PacketAnalyzerDrawer";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

describe("PacketAnalyzerDrawer close", () => {
  it("removes ?hash from the URL and calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=abc123"]}>
        <PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Close analyzer"));

    expect(onClose).toHaveBeenCalledOnce();
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).not.toContain("hash=");
    expect(search).toContain("tab=Packets"); // other params survive
  });
});
