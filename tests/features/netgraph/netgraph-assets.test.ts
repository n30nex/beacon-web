import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PLANET_TEXTURE_NAMES,
  ambientTextureFile,
  backdropTextureForViewport,
  nodeEventTextureFile,
  nodePlanetTextureName,
  nodeTextureFile,
  packetTextureFile,
  routeTrailTextureFile,
  stellarGasTextureFile,
} from "../../../src/features/netgraph/netgraph-three-assets";
import type { NetgraphNode, NetgraphRole } from "../../../src/features/netgraph/netgraph-model";
import { NATURAL_EARTH_110M_LAND_OUTLINES, NATURAL_EARTH_110M_PROVENANCE } from "../../../src/features/netgraph/natural-earth-110m";

const ASSET_ROOT = join(process.cwd(), "public", "netgraph-asset-pack", "beacon_netgraph_asset_pack");
const ASSET_BASE = "/netgraph-asset-pack/beacon_netgraph_asset_pack/";

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
    geoAnchor: { x: 0, y: 0, z: 0 },
    locationSource: "coordinates",
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

describe("Netgraph Natural Earth outline", () => {
  it("keeps provenance and the route-lazy land asset inside its budget", () => {
    const source = readFileSync(join(process.cwd(), "src", "features", "netgraph", "natural-earth-110m.ts"));
    expect(NATURAL_EARTH_110M_PROVENANCE.dataset).toContain("1:110m");
    expect(NATURAL_EARTH_110M_PROVENANCE.license).toBe("Public domain");
    expect(NATURAL_EARTH_110M_LAND_OUTLINES.length).toBeGreaterThan(100);
    expect(source.byteLength).toBeLessThanOrEqual(200 * 1024);
    expect(gzipSync(source).byteLength).toBeLessThanOrEqual(75 * 1024);
  });
});

describe("netgraph cinematic live assets", () => {
  it("has committed stellar gas and live event textures", () => {
    expect(stellarGasTextureFile("traffic_nebula_core")).toBe("/netgraph-asset-pack/beacon_netgraph_asset_pack/live/stellar_gases/traffic_nebula_core.png");
    expect(stellarGasTextureFile("traffic_aurora_sheet")).toBe("/netgraph-asset-pack/beacon_netgraph_asset_pack/live/stellar_gases/traffic_aurora_sheet.png");
    expect(routeTrailTextureFile("route_plasma_filament")).toBe("/netgraph-asset-pack/beacon_netgraph_asset_pack/live/route_trails/route_plasma_filament.png");
    expect(nodeEventTextureFile("node_shockwave_ring")).toBe("/netgraph-asset-pack/beacon_netgraph_asset_pack/live/node_events/node_shockwave_ring.png");

    expect(existsSync(join(ASSET_ROOT, "live", "stellar_gases", "traffic_nebula_core.png"))).toBe(true);
    expect(existsSync(join(ASSET_ROOT, "live", "stellar_gases", "traffic_aurora_sheet.png"))).toBe(true);
    expect(existsSync(join(ASSET_ROOT, "live", "route_trails", "route_plasma_filament.png"))).toBe(true);
    expect(existsSync(join(ASSET_ROOT, "live", "node_events", "node_shockwave_ring.png"))).toBe(true);
  });

  it("indexes the runtime textures referenced by the renderer", () => {
    const manifest = JSON.parse(readFileSync(join(ASSET_ROOT, "ASSET_INDEX.json"), "utf8")) as {
      assets: Array<{ path: string }>;
    };
    const indexed = new Set(manifest.assets.map((asset) => asset.path));
    const runtimePaths = [
      ambientTextureFile("focus_pulse", "active"),
      ambientTextureFile("edge_beam_fuzzy", "default"),
      backdropTextureForViewport(1920, 1080, "spherical", false),
      nodeEventTextureFile("node_shockwave_ring"),
      packetTextureFile("comet_data", "default"),
      packetTextureFile("packet_encrypted", "soft"),
      packetTextureFile("trail_short", "active"),
      routeTrailTextureFile("route_plasma_filament"),
      stellarGasTextureFile("traffic_nebula_core"),
      stellarGasTextureFile("traffic_aurora_sheet"),
    ];

    for (const runtimePath of runtimePaths) {
      expect(indexed.has(runtimePath.replace(ASSET_BASE, ""))).toBe(true);
    }
  });
});
