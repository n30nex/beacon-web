import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAVED_INVESTIGATIONS_KEY, WATCHLIST_KEY, canonicalizeInvestigationPath, createSavedInvestigation, importSavedInvestigations, readSavedInvestigations, readWatchlist, upsertWatchlistNode } from "../../../src/features/investigations/storage";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("local investigations storage", () => {
  it("canonicalizes supported URL state and drops sensitive or unknown values", () => {
    const path = canonicalizeInvestigationPath("/?token=secret&tab=Stats&statsTab=observers&compareIds=b,a&rawPacket=abcd");
    expect(path).toBe("/?compareIds=b%2Ca&statsTab=observers&tab=Analytics");
  });

  it("round-trips versioned investigations and imports without unsafe metadata", () => {
    const item = createSavedInvestigation("RF check", "/?tab=Analytics&statsTab=rf&password=nope");
    expect(readSavedInvestigations()[0]).toMatchObject({ id: item.id, version: 1, path: "/?statsTab=rf&tab=Analytics" });
    const imported = importSavedInvestigations(JSON.stringify([{ ...item, id: "imported", path: "/?tab=Nodes&nodeId=n1&body=plaintext" }]));
    expect(imported.find((row) => row.id === "imported")?.path).toBe("/?nodeId=n1&tab=Nodes");
  });

  it("quarantines corrupt storage instead of crashing the shell", () => {
    localStorage.setItem(SAVED_INVESTIGATIONS_KEY, "{broken");
    expect(readSavedInvestigations()).toEqual([]);
    expect(localStorage.getItem(SAVED_INVESTIGATIONS_KEY)).toBeNull();
    expect(Object.keys(localStorage).some((key) => key.startsWith(`${SAVED_INVESTIGATIONS_KEY}.corrupt.`))).toBe(true);
  });

  it("migrates a watched node UUID while retaining its public-key identity", () => {
    upsertWatchlistNode("AABBCCDDEEFF0011", "old", "Repeater");
    upsertWatchlistNode("aabbccddeeff0011", "new");
    expect(readWatchlist()).toEqual([expect.objectContaining({ version: 1, publicKey: "aabbccddeeff0011", lastKnownUuid: "new", label: "Repeater" })]);
    expect(localStorage.getItem(WATCHLIST_KEY)).toContain("new");
  });
});
