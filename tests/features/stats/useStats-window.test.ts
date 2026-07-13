import { describe, expect, it } from "vitest";
import { sinceFor } from "../../../src/features/stats/useStats";

describe("legacy stats window normalization", () => {
  it("reuses a five-minute boundary instead of sending a new exact timestamp each render", () => {
    const base = Date.UTC(2026, 6, 12, 12, 3, 15);
    const first = sinceFor("24h", base);
    const second = sinceFor("24h", base + 30_000);

    expect(first).toBe(second);
    expect(first % (5 * 60_000)).toBe(0);
  });
});
