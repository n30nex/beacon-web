import { describe, expect, it } from "vitest";
import { nullableDisplayLabel, sanitizeDisplayLabel } from "../../src/lib/display-label";

describe("display labels", () => {
  it("strips corrupt control characters and emoji from map labels", () => {
    expect(sanitizeDisplayLabel("TUS Mesh\u0011\u0001West� \u{1F47E}", "fallback")).toBe("TUS MeshWest");
  });

  it("strips emoji variation selectors left behind by observer glyphs", () => {
    expect(sanitizeDisplayLabel("\u{1F441}\uFE0F VA7WT - Observer", "fallback")).toBe("VA7WT - Observer");
  });

  it("falls back when a label has no usable text", () => {
    expect(sanitizeDisplayLabel("\u0000�\u{1F47E}", "node-1234")).toBe("node-1234");
    expect(nullableDisplayLabel("\u0000�")).toBeNull();
  });
});
