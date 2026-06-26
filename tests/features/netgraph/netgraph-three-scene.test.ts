import { describe, expect, it } from "vitest";
import { routeCountLabelScale } from "../../../src/features/netgraph/netgraph-three-scene";

describe("netgraph label route scaling", () => {
  it("makes busier route nodes use larger labels", () => {
    const none = routeCountLabelScale(0, 80, false);
    const few = routeCountLabelScale(3, 80, false);
    const many = routeCountLabelScale(80, 80, false);

    expect(few).toBeGreaterThan(none);
    expect(many).toBeGreaterThan(few);
  });

  it("keeps dense graphs more restrained", () => {
    expect(routeCountLabelScale(80, 80, true)).toBeLessThan(routeCountLabelScale(80, 80, false));
  });
});
