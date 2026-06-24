import * as THREE from "three";

import type { NetgraphNode, NetgraphRole } from "./netgraph-model";

export const NETGRAPH_ASSET_BASE = "/netgraph-asset-pack/beacon_netgraph_asset_pack";

type NodeTextureState = "default" | "active" | "selected" | "warning";
export type PacketTextureVariant = "default" | "active" | "soft" | "alert";
export type AmbientTextureVariant = "default" | "soft" | "active" | "alert";
type PacketVisualTexture =
  | "packet_standard_small"
  | "packet_standard_medium"
  | "packet_standard_large"
  | "packet_priority_small"
  | "packet_priority_medium"
  | "packet_priority_large"
  | "packet_encrypted"
  | "packet_corrupted_glow"
  | "trail_short"
  | "trail_medium"
  | "trail_long"
  | "trail_curved"
  | "trail_spiral"
  | "comet_data"
  | "comet_fast"
  | "comet_beacon";

export const nodeTextureCache = new Map<string, THREE.Texture | null>();
export const ambientTextureCache = new Map<string, THREE.Texture | null>();
export const packetTextureCache = new Map<string, THREE.Texture | null>();

const cachedTextures = new WeakSet<THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

const NODE_TEXTURE_HINTS = {
  ai: "node_ai",
  core: "node_core",
  cluster: "node_data_cluster",
  data_cluster: "node_data_cluster",
  datastore: "node_data_cluster",
  edge: "node_edge",
  external: "node_external",
  gateway: "node_gateway",
  hub: "node_hub",
  relay: "node_relay",
  sensor: "node_sensor",
  service: "node_service",
  storage: "node_storage",
  unknown: "node_unknown",
  user: "node_user",
} as const;

function assetPath(...parts: string[]): string {
  return `${NETGRAPH_ASSET_BASE}/${parts.join("/")}`;
}

export function getCachedTexture(cache: Map<string, THREE.Texture | null>, path: string, anisotropy = 1): THREE.Texture | null {
  const existing = cache.get(path);
  if (existing) return existing;
  if (existing === null) return null;
  const texture = textureLoader.load(path, undefined, undefined, () => {
    cache.delete(path);
    cache.set(path, null);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(path, texture);
  cachedTextures.add(texture);
  return texture;
}

export function ambientTextureFile(name: string, variant: AmbientTextureVariant): string {
  return assetPath("ambient", variant, `${name}.png`);
}

export function packetTextureFile(name: PacketVisualTexture, variant: PacketTextureVariant, highRes = false): string {
  if (highRes && variant === "default") {
    return assetPath("packets_trails_comets", "2048", "default", `${name}.png`);
  }
  return assetPath("packets_trails_comets", "1024", variant, `${name}.png`);
}

function nodeTextureVariantForPerformance(nodeState: NodeTextureState, useHiDpiTexture: boolean): string {
  return useHiDpiTexture ? nodeState : "default";
}

export function chooseAmbientPacketVariant(nodeFocusActive: boolean, batteryMode: boolean): AmbientTextureVariant {
  if (batteryMode) return "soft";
  return nodeFocusActive ? "active" : "default";
}

export function packetHeadTexture(payloadType: string): PacketVisualTexture {
  const normal = payloadType.toLowerCase();
  if (normal.includes("beacon")) return "comet_beacon";
  if (normal.includes("corrupt")) return "packet_corrupted_glow";
  if (normal.includes("encrypt")) return "packet_encrypted";
  if (normal.includes("priority")) return "packet_priority_large";
  if (normal.includes("fast")) return "comet_fast";
  return "comet_data";
}

export function packetTrailTexture(payloadType: string): PacketVisualTexture {
  const normal = payloadType.toLowerCase();
  if (normal.includes("corrupt")) return "trail_spiral";
  if (normal.includes("fast")) return "trail_long";
  if (normal.includes("priority")) return "trail_medium";
  return "trail_short";
}

export function glowVisualTexture(payloadType: string): PacketVisualTexture {
  const normal = payloadType.toLowerCase();
  if (normal.includes("corrupt")) return "packet_corrupted_glow";
  if (normal.includes("encrypt")) return "packet_encrypted";
  if (normal.includes("beacon")) return "comet_beacon";
  if (normal.includes("fast")) return "comet_fast";
  return "comet_data";
}

function guessNodeTextureType(nodeTypeName: string | undefined, role: NetgraphRole): string {
  const base = (nodeTypeName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!base) {
    return role === "observer" ? NODE_TEXTURE_HINTS.gateway : NODE_TEXTURE_HINTS.unknown;
  }
  for (const [needle, mapped] of Object.entries(NODE_TEXTURE_HINTS)) {
    if (base.includes(needle)) return mapped;
  }
  if (base.includes("companion")) return NODE_TEXTURE_HINTS.user;
  if (base.includes("repeater")) return NODE_TEXTURE_HINTS.relay;
  if (base.includes("room")) return NODE_TEXTURE_HINTS.service;
  if (base.includes("sensor")) return NODE_TEXTURE_HINTS.sensor;
  return role === "observer" ? NODE_TEXTURE_HINTS.gateway : NODE_TEXTURE_HINTS.unknown;
}

export function nodeIsStale(node: NetgraphNode, now = Date.now()): boolean {
  return node.lastSeen > 0 && now - node.lastSeen > 1000 * 60 * 60 * 6;
}

function nodeStateTextureKey(node: NetgraphNode, selectedNodeId: string | null | undefined, focusedNodeIds: Set<string>): NodeTextureState {
  if (node.id === selectedNodeId) return "selected";
  if (focusedNodeIds.has(node.id)) return "active";
  if (nodeIsStale(node)) return "warning";
  return "default";
}

export function nodeTextureFile(node: NetgraphNode, selectedNodeId: string | null | undefined, focusedNodeIds: Set<string>, useTextureQuality: boolean): string {
  const textureType = guessNodeTextureType(node.nodeTypeName, node.role);
  const state = nodeStateTextureKey(node, selectedNodeId, focusedNodeIds);
  return assetPath("nodes", nodeTextureVariantForPerformance(state, useTextureQuality), `${textureType}.png`);
}

export function backdropTextureForViewport(width: number, height: number, shape: "spherical" | "spiral", focusMode: boolean): string {
  const variant = width / Math.max(1, height) >= 1.55 ? "2560x1440" : "1920x1080";
  const selected = shape === "spiral"
    ? "bg_nebula_spiral_field.png"
    : focusMode
      ? "bg_dark_matter_grid.png"
      : "bg_deep_space_particles.png";
  return assetPath("backgrounds", variant, selected);
}

export function preserveDrawingBufferForTest(): boolean {
  return Boolean((window as Window & { __BEACON_NETGRAPH_TEST_CAPTURE?: boolean }).__BEACON_NETGRAPH_TEST_CAPTURE);
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    const mapped = item as THREE.Material & { map?: THREE.Texture | null };
    if (mapped.map && !cachedTextures.has(mapped.map)) mapped.map.dispose();
    item.dispose();
  }
}
