import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANET_TEXTURE_NAMES,
  nodePlanetTextureName,
  nodeTextureFile,
} from "../../../src/features/netgraph/netgraph-three-assets";
import type { NetgraphNode, NetgraphRole } from "../../../src/features/netgraph/netgraph-model";

const ASSET_ROOT = join(process.cwd(), "public", "netgraph-asset-pack", "beacon_netgraph_asset_pack");

function node(role: NetgraphRole, nodeTypeName = role): NetgraphNode {
  return {
    id: `node-${role}`,
    name: role,
    publicKey: `${role}feed`,
    nodeType: 0,
    nodeTypeName,
    lat: 49,
    lng: -123,
    isObserver: role === "observer",
    iatas: ["YVR"],
    routeIds: [1],
    routeCount: 1,
    observationCount: 1,
    firstSeen: 1,
    lastSeen: Date.now(),
    label: role,
    role,
    degree: 1,
    radius: 1,
    position: { x: 0, y: 0, z: 0 },
    seed: { x: 0, y: 0, z: 0 },
    componentId: 1,
    componentX: 0,
    componentY: 0,
    searchText: role,
  };
}

describe("netgraph planet node assets", () => {
  it("has committed planet textures for every runtime state", () => {
    for (const state of ["default", "active", "selected", "warning"]) {
      for (const textureName of PLANET_TEXTURE_NAMES) {
        expect(existsSync(join(ASSET_ROOT, "nodes", "planets", state, `${textureName}.png`))).toBe(true);
      }
    }
  });

  it("maps every Beacon role to a planet texture path", () => {
    for (const role of (["repeater", "companion", "room", "observer", "sensor", "other"] satisfies NetgraphRole[])) {
      const item = node(role);
      const textureName = nodePlanetTextureName(item);
      expect(PLANET_TEXTURE_NAMES).toContain(textureName);
      expect(nodeTextureFile(item, null, new Set(), false)).toBe(`/netgraph-asset-pack/beacon_netgraph_asset_pack/nodes/planets/default/${textureName}.png`);
      expect(nodeTextureFile(item, item.id, new Set([item.id]), true)).toBe(`/netgraph-asset-pack/beacon_netgraph_asset_pack/nodes/planets/selected/${textureName}.png`);
    }
  });

  it("spreads generic repeated nodes across the planet texture pack", () => {
    const textures = new Set(
      Array.from({ length: 28 }, (_, index) => {
        const item = node("repeater", "Repeater");
        item.id = `generic-repeater-${index}`;
        return nodePlanetTextureName(item);
      }),
    );

    expect(textures.size).toBeGreaterThan(6);
  });
});
