import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createAbstractGlobe, routeCountLabelScale } from "../../../src/features/netgraph/netgraph-three-scene";

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

describe("abstract Geo Constellation globe", () => {
  it("builds a finite translucent globe, graticule, atmosphere, and land outline", () => {
    const globe = createAbstractGlobe({
      atmosphereDensity: 1,
      batteryQuality: false,
      green: new THREE.Color("#54e1a6"),
      primary: new THREE.Color("#7ab7ff"),
      reduced: false,
    });

    expect(globe.name).toBe("netgraph-geo-globe");
    expect(globe.children.length).toBeGreaterThanOrEqual(4);
    for (const child of globe.children) {
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      const position = geometry?.getAttribute("position");
      if (!position) continue;
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    }
  });
});
