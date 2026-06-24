import { describe, expect, it } from "vitest";
import {
  applyNavigationParams,
  canonicalizeNavigationParams,
  navigationForTarget,
  navigationFromParams,
} from "../../src/lib/navigation";

describe("simplified navigation model", () => {
  it("maps legacy Atlas to Home", () => {
    const params = new URLSearchParams("tab=Atlas&atlasRegion=west");

    expect(navigationFromParams(params)).toEqual({ tab: "Home" });
    expect(canonicalizeNavigationParams(params).toString()).toBe("tab=Home&atlasRegion=west");
  });

  it("maps legacy forensic modules into direct pages", () => {
    const params = new URLSearchParams("tab=Packets&hash=abc123");

    expect(navigationFromParams(params)).toEqual({ tab: "Packets" });
    expect(canonicalizeNavigationParams(params).toString()).toBe("tab=Packets&hash=abc123");

    const wrapped = new URLSearchParams("tab=Investigate&module=Channels&channelId=7");
    expect(navigationFromParams(wrapped)).toEqual({ tab: "Channels" });
    expect(canonicalizeNavigationParams(wrapped).toString()).toBe("tab=Channels&channelId=7");
  });

  it("maps legacy Ops modules into direct pages", () => {
    const params = new URLSearchParams("tab=Stats&statsTab=rf");

    expect(navigationFromParams(params)).toEqual({ tab: "Analytics" });
    expect(canonicalizeNavigationParams(params).toString()).toBe("tab=Analytics&statsTab=rf");

    const wrapped = new URLSearchParams("tab=Ops&module=Runtime");
    expect(navigationFromParams(wrapped)).toEqual({ tab: "System" });
    expect(canonicalizeNavigationParams(wrapped).toString()).toBe("tab=System");
  });

  it("builds canonical params for primary targets", () => {
    const params = new URLSearchParams("tab=Nodes&nodeId=n1");
    const next = applyNavigationParams(params, navigationForTarget("System"));

    expect(next.toString()).toBe("tab=System&nodeId=n1");
  });

  it("keeps Netgraph as a direct system page", () => {
    const params = new URLSearchParams("tab=Netgraph&nodeId=n1&routeId=42");

    expect(navigationFromParams(params)).toEqual({ tab: "Netgraph" });
    expect(canonicalizeNavigationParams(params).toString()).toBe("tab=Netgraph&nodeId=n1&routeId=42");
    expect(navigationForTarget("Netgraph")).toEqual({ tab: "Netgraph" });
  });

  it("preserves one-shot map node focus params for Map URLs", () => {
    const params = new URLSearchParams("tab=Map&nodeId=n1&mapFocus=node");

    expect(canonicalizeNavigationParams(params).toString()).toBe("tab=Map&nodeId=n1&mapFocus=node");
  });
});
