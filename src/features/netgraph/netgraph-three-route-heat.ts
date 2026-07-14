import * as THREE from "three";

import type { NetgraphGraph, NetgraphRouteHeat } from "./netgraph-model";
import {
  getCachedTexture,
  liveTextureCache,
  routeTrailTextureFile,
  stellarGasTextureFile,
} from "./netgraph-three-assets";
import { clamp, nodePosition, positionOnEdge } from "./netgraph-three-geometry";
import { routeHeatIntensityAt } from "./netgraph-route-heat";

const MAX_ROUTE_HEAT_BEAMS = 192;
const MAX_ROUTE_GAS_SPRITES = 64;
const MAX_ROUTE_SPARKLES = 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface RouteHeatVisuals {
  beamMeshes: THREE.Mesh[];
  gasSprites: THREE.Sprite[];
  sparkleMeshes: THREE.Mesh[];
}

export function routeHeatEffectsEnabled(options: {
  animationsDisabled: boolean;
  batteryQuality: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
}): boolean {
  return !options.animationsDisabled && !options.batteryQuality && !options.lowPower && !options.reducedMotion;
}

export function routeHeatVisualBudgets(options: {
  enabled: boolean;
  highQuality: boolean;
  narrowViewport: boolean;
}): { beams: number; gas: number; sparkles: number } {
  if (!options.enabled) return { beams: 0, gas: 0, sparkles: 0 };
  return {
    beams: options.highQuality
      ? options.narrowViewport ? 76 : MAX_ROUTE_HEAT_BEAMS
      : options.narrowViewport ? 34 : 92,
    gas: options.highQuality
      ? options.narrowViewport ? 24 : MAX_ROUTE_GAS_SPRITES
      : options.narrowViewport ? 10 : 28,
    sparkles: options.highQuality
      ? options.narrowViewport ? 64 : MAX_ROUTE_SPARKLES
      : options.narrowViewport ? 28 : 86,
  };
}

export function routeHeatModeProfile(nodeFocusActive: boolean): {
  beamOpacityScale: number;
  beamRadiusScale: number;
  gasEnabled: boolean;
  sparkleCount: number;
  sparkleOpacityScale: number;
  sparkleScale: number;
} {
  return nodeFocusActive
    ? { beamOpacityScale: 0.46, beamRadiusScale: 0.42, gasEnabled: false, sparkleCount: 1, sparkleOpacityScale: 0.58, sparkleScale: 0.62 }
    : { beamOpacityScale: 0.82, beamRadiusScale: 0.78, gasEnabled: true, sparkleCount: 2, sparkleOpacityScale: 0.86, sparkleScale: 0.84 };
}

export function createRouteHeatVisuals(options: {
  group: THREE.Group;
  enabled: boolean;
  highQuality: boolean;
  narrowViewport: boolean;
  textureAnisotropy: number;
}): RouteHeatVisuals {
  const budgets = routeHeatVisualBudgets(options);
  const beamCount = budgets.beams;
  const gasCount = budgets.gas;
  const sparkleCount = budgets.sparkles;

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

  const sparkleGeometry = new THREE.SphereGeometry(1, options.highQuality ? 12 : 8, options.highQuality ? 8 : 6);
  const sparkleMeshes = Array.from({ length: sparkleCount }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(sparkleGeometry, material);
    mesh.renderOrder = 80;
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  return { beamMeshes, gasSprites, sparkleMeshes };
}

export function renderRouteHeatFrame(options: {
  visuals: RouteHeatVisuals;
  enabled: boolean;
  graph: NetgraphGraph;
  glowIntensityScale: number;
  narrowViewport: boolean;
  now: number;
  nodeFocusActive: boolean;
  routeHeat: NetgraphRouteHeat[];
  time: number;
  visibleEdgeIds: Set<string>;
}): void {
  for (const mesh of options.visuals.beamMeshes) mesh.visible = false;
  for (const sprite of options.visuals.gasSprites) sprite.visible = false;
  for (const mesh of options.visuals.sparkleMeshes) mesh.visible = false;
  if (!options.enabled || options.routeHeat.length === 0) return;

  const hotRoutes = options.routeHeat
    .map((heat) => ({ heat, intensity: routeHeatIntensityAt(heat, options.now) }))
    .filter(({ heat, intensity }) => intensity > 0.018 && options.visibleEdgeIds.has(heat.edgeId))
    .sort((a, b) => b.intensity - a.intensity);

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const sparklePosition = new THREE.Vector3();
  const color = new THREE.Color();
  const white = new THREE.Color("#ffffff");
  let beamIndex = 0;
  let gasIndex = 0;
  let sparkleIndex = 0;
  const modeProfile = routeHeatModeProfile(options.nodeFocusActive);

  for (const { heat, intensity } of hotRoutes) {
    if (beamIndex >= options.visuals.beamMeshes.length) break;
    const edge = options.graph.edgeById.get(heat.edgeId);
    if (!edge) continue;
    const from = options.graph.nodeById.get(edge.fromId);
    const to = options.graph.nodeById.get(edge.toId);
    if (!from || !to) continue;

    const curvedStart = options.graph.layoutMode === "geo" ? positionOnEdge(options.graph, edge.id, 0.43, false) : null;
    const curvedEnd = options.graph.layoutMode === "geo" ? positionOnEdge(options.graph, edge.id, 0.57, false) : null;
    start.copy(curvedStart ?? nodePosition(from));
    end.copy(curvedEnd ?? nodePosition(to));
    delta.subVectors(end, start);
    const length = delta.length();
    if (length <= 0.001) continue;
    midpoint.copy(start).addScaledVector(delta, 0.5);

    const beam = options.visuals.beamMeshes[beamIndex]!;
    const material = beam.material as THREE.MeshStandardMaterial;
    color.set(heat.color).lerp(white, clamp((intensity - 1) * 0.24, 0, 0.34));
    material.color.copy(color);
    material.emissive.copy(color);
    material.emissiveIntensity = (3.6 + intensity * 3.2) * clamp(options.glowIntensityScale, 0.4, 3.8) * modeProfile.beamOpacityScale;
    material.opacity = Math.min(0.74, (0.28 + intensity * 0.34) * clamp(options.glowIntensityScale, 0.3, 3.4) * modeProfile.beamOpacityScale);
    beam.position.copy(midpoint);
    beam.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
    const radius = (options.narrowViewport ? 0.11 : 0.18) * modeProfile.beamRadiusScale * (1 + Math.sqrt(intensity) * 0.72);
    beam.scale.set(radius, length, radius);
    beam.visible = true;
    beamIndex += 1;

    if (modeProfile.gasEnabled && gasIndex < options.visuals.gasSprites.length && intensity > 0.2) {
      const sprite = options.visuals.gasSprites[gasIndex]!;
      const spriteMaterial = sprite.material as THREE.SpriteMaterial;
      const pulse = 1 + Math.sin(options.time / 680 + gasIndex * 0.74) * 0.08;
      spriteMaterial.color.copy(color);
      spriteMaterial.opacity = Math.min(0.36, (0.05 + intensity * 0.1) * clamp(options.glowIntensityScale, 0.25, 3));
      sprite.position.copy(midpoint);
      sprite.position.z += Math.sin((hashString(heat.edgeId) % 991) + options.time / 1300) * 1.2;
      const gasSize = Math.min(options.narrowViewport ? 28 : 48, Math.max(12, length * 0.74)) * (1 + intensity * 0.2) * pulse;
      sprite.scale.set(gasSize, gasSize, 1);
      sprite.visible = true;
      gasIndex += 1;
    }

    const sparkleCount = intensity > 0.48 ? modeProfile.sparkleCount : 1;
    for (let spark = 0; spark < sparkleCount && sparkleIndex < options.visuals.sparkleMeshes.length; spark += 1) {
      const sparkle = options.visuals.sparkleMeshes[sparkleIndex]!;
      const sparkleMaterial = sparkle.material as THREE.MeshBasicMaterial;
      const seed = hashString(`${heat.edgeId}:${spark}`);
      const local = ((options.now - heat.startedAt) / 1250 + (seed % 997) / 997 + spark * 0.37) % 1;
      const routeLocal = heat.reverse ? 1 - local : local;
      const pathPosition = positionOnEdge(options.graph, edge.id, routeLocal, false);
      if (pathPosition) sparklePosition.copy(pathPosition);
      else sparklePosition.lerpVectors(start, end, routeLocal);
      sparklePosition.x += Math.sin(options.time / 140 + seed) * (options.nodeFocusActive ? 0.28 : 0.52);
      sparklePosition.y += Math.cos(options.time / 170 + seed * 0.7) * (options.nodeFocusActive ? 0.28 : 0.52);
      sparklePosition.z += Math.sin(options.time / 190 + seed * 0.3) * (options.nodeFocusActive ? 0.38 : 0.72);
      const twinkle = 0.55 + Math.sin(options.time / 96 + seed) * 0.45;
      sparkleMaterial.color.set(heat.color);
      sparkleMaterial.opacity = Math.min(0.8, (0.34 + intensity * 0.18) * twinkle * modeProfile.sparkleOpacityScale);
      sparkle.position.copy(sparklePosition);
      sparkle.scale.setScalar((options.narrowViewport ? 0.38 : 0.56) * modeProfile.sparkleScale * (0.72 + intensity * 0.2));
      sparkle.visible = true;
      sparkleIndex += 1;
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
