import { describe, expect, it } from "vitest";
import type { RegionAtlasSummary } from "../../../src/types/api";
import {
  asAtlasRange,
  atlasFitPoints,
  atlasWindowForRange,
  orderedStoryBeats,
} from "../../../src/features/atlas/atlas-model";

describe("atlas-model", () => {
  it("normalizes range params and builds deterministic windows", () => {
    expect(asAtlasRange("6h")).toBe("6h");
    expect(asAtlasRange("nonsense")).toBe("24h");
    expect(asAtlasRange(null)).toBe("24h");
    expect(atlasWindowForRange("6h", 1_000_000)).toEqual({
      since: 1_000_000 - 6 * 60 * 60 * 1000,
      until: 1_000_000,
    });
  });

  it("extracts map fit points and ignores incomplete coordinates", () => {
    const summary = {
      iatas: [
        { iata: "YVR", lat: 49.19, lng: -123.18, observationCount: 1, uniquePackets: 1, activeObservers: 1 },
        { iata: "YYJ", lat: 48.64, observationCount: 1, uniquePackets: 1, activeObservers: 1 },
      ],
    } as RegionAtlasSummary;

    expect(atlasFitPoints(summary)).toEqual([[-123.18, 49.19]]);
    expect(atlasFitPoints(undefined)).toBeNull();
  });

  it("orders story beats by Atlas narrative priority", () => {
    const summary = {
      storyBeats: [
        { id: "p", kind: "payload", title: "Payload", detail: "" },
        { id: "t", kind: "traffic", title: "Traffic", detail: "" },
        { id: "h", kind: "hotspot", title: "Hotspot", detail: "" },
      ],
    } as RegionAtlasSummary;

    expect(orderedStoryBeats(summary).map((beat) => beat.id)).toEqual(["t", "h", "p"]);
  });

});
