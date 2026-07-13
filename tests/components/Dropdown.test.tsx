import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Dropdown } from "../../src/components/Dropdown";
import { FilterSheet } from "../../src/components/FilterSheet";
import { SelectDropdown } from "../../src/components/SelectDropdown";

function TestDropdown() {
  return (
    <Dropdown
      renderTrigger={({ toggle }) => (
        <button type="button" onClick={toggle}>trigger</button>
      )}
    >
      {(close) => (
        <div data-testid="dropdown-panel">
          <button type="button">first option</button>
          <button type="button" onClick={close}>second option</button>
        </div>
      )}
    </Dropdown>
  );
}

describe("Dropdown", () => {
  it("closes on Escape", () => {
    render(<TestDropdown />);
    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByTestId("dropdown-panel")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("dropdown-panel")).not.toBeInTheDocument();
  });

  it("Escape closes only the open dropdown, not the sheet underneath", () => {
    // regression: Escape in an open dropdown inside the mobile FilterSheet closed both layers
    const onClose = vi.fn();
    render(
      <FilterSheet onClose={onClose}>
        <TestDropdown />
      </FilterSheet>,
    );
    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByTestId("dropdown-panel")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("dropdown-panel")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // with the dropdown closed, Escape reaches the sheet
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus with arrow keys and restores it on Escape", async () => {
    render(<TestDropdown />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "first option" });
    const second = screen.getByRole("button", { name: "second option" });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("exposes a labelled listbox and expanded state for single-select controls", () => {
    render(<SelectDropdown label="Status" options={[{ value: "up", label: "Up" }]} value="" onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: /Status/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Status" })).toBeInTheDocument();
  });
});
