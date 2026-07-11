import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { InvestigationsView } from "../../../src/features/investigations/InvestigationsView";
import { createSavedInvestigation, readSavedInvestigations } from "../../../src/features/investigations/storage";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/?tab=Investigations");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("InvestigationsView", () => {
  it("creates, renames, copies a link, opens, and deletes saved workspaces", async () => {
    window.history.replaceState({}, "", "/?tab=Investigations&create=1&source=%2F%3Ftab%3DAnalytics%26statsTab%3Drf");
    render(<BrowserRouter><InvestigationsView /></BrowserRouter>);

    fireEvent.change(screen.getByRole("textbox", { name: "Investigation name" }), { target: { value: "RF health" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByDisplayValue("RF health")).toBeInTheDocument();
    expect(readSavedInvestigations()[0]?.path).toBe("/?statsTab=rf&tab=Analytics");

    const rename = screen.getByRole("textbox", { name: "Rename RF health" });
    fireEvent.change(rename, { target: { value: "RF follow-up" } });
    fireEvent.blur(rename);
    expect(readSavedInvestigations()[0]?.name).toBe("RF follow-up");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("statsTab=rf")));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/No saved investigations/)).toBeInTheDocument();
  });

  it("copies an existing workspace as a new investigation", () => {
    createSavedInvestigation("Node case", "/?tab=Nodes&nodeId=n1");
    render(<BrowserRouter><InvestigationsView /></BrowserRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(readSavedInvestigations()).toHaveLength(2);
  });
});
