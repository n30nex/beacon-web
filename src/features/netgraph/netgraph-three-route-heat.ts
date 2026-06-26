import * as THREE from "three";

import type { NetgraphGraph, NetgraphRouteHeat } from "./netgraph-model";
import {
  getCachedTexture,
  liveTextureCache,
  routeTrailTextureFile,
  stellarGasTextureFile,
} from "./netgraph-three-assets";
import { clamp, nodePosition } from "./netgraph-three-geometry";
import { routeHeatIntensityAt } from "./netgraph-route-heat";

const MAX_ROUTE_HEAT_BEAMS = 192;
const MAX_ROUTE_GAS_SPRITES = 84;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface RouteHeatVisuals {
  beamMeshes: THREE.Mesh[];
  gasSprites: THREE.Sprite[];
}

export function routeHeatEffectsEnabled(options: {
  animationsDisabled: boolean;
  batteryQuality: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
}): boolean {
  return !options.animationsDisabled && !options.batteryQuality && !options.lowPower && !options.reducedMotion;
}

export function createRouteHeatVisuals(options: {
  group: THREE.Group;
  enabled: boolean;
  highQuality: boolean;
  narrowViewport: boolean;
  textureAnisotropy: number;
}): RouteHeatVisuals {
  const beamCount = options.enabled
    ? options.highQuality
      ? options.narrowViewport ? 76 : MAX_ROUTE_HEAT_BEAMS
      : options.narrowViewport ? 34 : 92
    : 0;
  const gasCount = options.enabled
    ? options.highQuality
      ? options.narrowViewport ? 28 : MAX_ROUTE_GAS_SPRITES
      : options.narrowViewport ? 12 : 34
    : 0;

  const routeMap = getCachedTexture(
    liveTextureCache,
    routeTrailTextureFile("route_plasma_filament"),
    options.textureAnisotropy,
  );
  const gasMaps = [
    getCachedTexture(liveTextureCache, stellarGasTextureFile("traffic_nebula_core"), options.textureAnisotropy),
    getCachedTexture(liveTextureCache, stellarGasTextureFile("traffic_aurora_sheet"), options.textureAnisotropy),
  ];

  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, options.highQuality ? 18 : 10, 1, true);
  const beamMeshes = Array.from({ length: beamCount }, () => {
    const material = new THREE.MeshStandardMaterial({
      map: routeMap ?? undefined,
      color: 0x54e1a6,
      emissive: 0x54e1a6,
      emissiveIntensity: 2.6,
      metalness: 0.02,
      roughness: 0.2,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(beamGeometry, material);
    mesh.renderOrder = 78;
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  const gasSprites = Array.from({ length: gasCount }, (_, index) => {
    const material = new THREE.SpriteMaterial({
      map: gasMaps[index % gasMaps.length] ?? undefined,
      color: 0x54e1a6,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 77;
    sprite.visible = false;
    options.group.add(sprite);
    return sprite;
  });

  return { beamMeshes, gasSprites };
}

export function renderRouteHeatFrame(options: {
  visuals: RouteHeatVisuals;
  enabled: boolean;
  graph: NetgraphGraph;
  glowIntensityScale: number;
  narrowViewport: boolean;
  now: number;
  routeHeat: NetgraphRouteHeat[];
  time: number;
  visibleEdgeIds: Set<string>;
}): void {
  for (const mesh of options.visuals.beamMeshes) mesh.visible = false;
  for (const sprite of options.visuals.gasSprites) sprite.visible = false;
  if (!options.enabled || options.routeHeat.length === 0) return;

  const hotRoutes = options.routeHeat
    .map((heat) => ({ heat, intensity: routeHeatIntensityAt(heat, options.now) }))
    .filter(({ heat, intensity }) => intensity > 0.018 && options.visibleEdgeIds.has(heat.edgeId))
    .sort((a, b) => b.intensity - a.intensity);

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const color = new THREE.Color();
  const white = new THREE.Color("#ffffff");
  let beamIndex = 0;
  let gasIndex = 0;

  for (const { heat, intensity } of hotRoutes) {
    if (beamIndex >= options.visuals.beamMeshes.length) break;
    const edge = options.graph.edgeById.get(heat.edgeId);
    if (!edge) continue;
    const from = options.graph.nodeById.get(edge.fromId);
    const to = options.graph.nodeById.get(edge.toId);
    if (!from || !to) continue;

    start.copy(nodePosition(from));
    end.copy(nodePosition(to));
    delta.subVectors(end, start);
    const length = delta.length();
    if (length <= 0.001) continue;
    midpoint.copy(start).addScaledVector(delta, 0.5);

    const beam = options.visuals.beamMeshes[beamIndex]!;
    const material = beam.material as THREE.MeshStandardMaterial;
    color.set(heat.color).lerp(white, clamp((intensity - 1) * 0.24, 0, 0.34));
    material.color.copy(color);
    material.emissive.copy(color);
    material.emissiveIntensity = (4.8 + intensity * 4.6) * clamp(options.glowIntensityScale, 0.4, 3.8);
    material.opacity = Math.min(1, (0.42 + intensity * 0.48) * clamp(options.glowIntensityScale, 0.3, 3.4));
    beam.position.copy(midpoint);
    beam.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
    const radius = (options.narrowViewport ? 0.16 : 0.26) * (1 + Math.sqrt(intensity) * 0.86);
    beam.scale.set(radius, length, radius);
    beam.visible = true;
    beamIndex += 1;

    if (gasIndex < options.visuals.gasSprites.length && intensity > 0.14) {
      const sprite = options.visuals.gasSprites[gasIndex]!;
      const spriteMaterial = sprite.material as THREE.SpriteMaterial;
      const pulse = 1 + Math.sin(options.time / 680 + gasIndex * 0.74) * 0.08;
      spriteMaterial.color.copy(color);
      spriteMaterial.opacity = Math.min(0.78, (0.12 + intensity * 0.22) * clamp(options.glowIntensityScale, 0.25, 3));
      sprite.position.copy(midpoint);
      sprite.position.z += Math.sin((hashString(heat.edgeId) % 991) + options.time / 1300) * 1.2;
      const gasSize = Math.min(options.narrowViewport ? 38 : 78, Math.max(16, length * 1.05)) * (1 + intensity * 0.38) * pulse;
      sprite.scale.set(gasSize, gasSize, 1);
      sprite.visible = true;
      gasIndex += 1;
    }
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
