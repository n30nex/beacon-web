import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ModuleTabs } from "../../src/components/ModuleTabs";

const OPTIONS = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
] as const;

function TabsHarness() {
  const [value, setValue] = useState<(typeof OPTIONS)[number]["id"]>("one");
  return <ModuleTabs label="Views" options={OPTIONS} value={value} onChange={setValue} panelId="views-panel" />;
}

describe("ModuleTabs", () => {
  it("uses roving focus and arrow-key selection", () => {
    render(<TabsHarness />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    expect(one).toHaveAttribute("tabindex", "0");
    expect(two).toHaveAttribute("tabindex", "-1");
    expect(one).toHaveAttribute("aria-controls", "views-panel");

    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });

    expect(two).toHaveFocus();
    expect(two).toHaveAttribute("aria-selected", "true");
    expect(two).toHaveAttribute("tabindex", "0");
  });
});
