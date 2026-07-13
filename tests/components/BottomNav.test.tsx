import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomNav } from "../../src/components/BottomNav";

describe("BottomNav", () => {
  it("marks a direct page as current", () => {
    render(<BottomNav activeTab="Map" onTabChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("renders the five grouped mobile destinations", () => {
    render(<BottomNav activeTab="Packets" onTabChange={() => {}} />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Home", "Map", "Monitor", "Data", "System"]);
    expect(screen.getByRole("button", { name: "Map" })).toBeInTheDocument();
    expect(screen.queryByText("Atlas")).not.toBeInTheDocument();
    expect(screen.queryByText("Investigate")).not.toBeInTheDocument();
    expect(screen.queryByText("Ops")).not.toBeInTheDocument();
  });

  it("opens Data and selects a data page", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Live" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    expect(screen.getByRole("menu", { name: "Data" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Observers" }));
    expect(onTabChange).toHaveBeenCalledWith("Observers");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens Monitor and selects Netgraph", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Netgraph" onTabChange={onTabChange} />);

    const monitor = screen.getByRole("button", { name: "Monitor" });
    expect(monitor).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(monitor);
    fireEvent.click(screen.getByRole("menuitem", { name: "Netgraph" }));
    expect(onTabChange).toHaveBeenCalledWith("Netgraph");
  });

  it("opens System and selects a tool page", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Analytics" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByRole("menu", { name: "System" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Netgraph" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Traces" }));
    expect(onTabChange).toHaveBeenCalledWith("Traces");
  });
});
