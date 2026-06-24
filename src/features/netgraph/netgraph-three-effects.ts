import * as THREE from "three";

import type { NetgraphGlow, NetgraphGraph, NetgraphPulse, NetgraphRenderTier } from "./netgraph-model";
import {
  ambientTextureCache,
  ambientTextureFile,
  chooseAmbientPacketVariant,
  getCachedTexture,
  glowVisualTexture,
  packetHeadTexture,
  packetTextureCache,
  packetTextureFile,
  packetTrailTexture,
  type PacketTextureVariant,
} from "./netgraph-three-assets";
import {
  clamp,
  nodeScale,
  positionForPulseLocal,
  positionOnEdge,
  pulseProgress,
} from "./netgraph-three-geometry";

const MAX_PULSE_MESHES = 96;
const MAX_GLOW_MESHES = 64;
const LIVE_VISIBILITY_BOOST = 1.55;

export interface PulseVisuals {
  pulseMeshes: THREE.Mesh[];
  pulseTailMeshes: THREE.Mesh[];
  endpointMeshes: THREE.Mesh[];
  pulseLights: THREE.PointLight[];
  glowMeshes: THREE.Mesh[];
}

export function createPulseVisuals(options: {
  group: THREE.Group;
  green: THREE.Color;
  highQuality: boolean;
  narrowViewport: boolean;
  animationsDisabled: boolean;
  batteryQuality: boolean;
  balancedQuality: boolean;
  pulseDensity: number;
  glowDensity: number;
  cometScale: number;
  effectScale: number;
  glowIntensityScale: number;
  richPacketLighting: boolean;
  defaultPulseHeadMap?: THREE.Texture | null;
  defaultPulseTailMap?: THREE.Texture | null;
  defaultEndpointPulseMap?: THREE.Texture | null;
  defaultGlowMap?: THREE.Texture | null;
}): PulseVisuals {
  const pulseGeometry = new THREE.SphereGeometry(
    1,
    options.highQuality ? (options.narrowViewport ? 24 : 30) : 18,
    options.highQuality ? (options.narrowViewport ? 20 : 22) : 12,
  );
  const pulseTailGeometry = new THREE.ConeGeometry(
    options.highQuality ? (options.narrowViewport ? 0.8 : 0.72) : 0.62,
    options.highQuality ? (options.narrowViewport ? 1.4 : 1.2) : 1,
    options.highQuality ? 16 : 14,
    1,
    true,
  );
  const basePulseBudget = options.animationsDisabled
    ? 0
    : options.batteryQuality
      ? (options.narrowViewport ? 14 : 22)
      : options.balancedQuality
        ? (options.narrowViewport ? 28 : 58)
        : options.narrowViewport
          ? 36
          : MAX_PULSE_MESHES;
  const pulseBudget = Math.max(0, Math.floor(basePulseBudget * options.pulseDensity * options.cometScale * LIVE_VISIBILITY_BOOST));
  const pulseMeshes = Array.from({ length: pulseBudget }, () => {
    const material = new THREE.MeshStandardMaterial({
      map: options.defaultPulseHeadMap ?? undefined,
      color: options.green,
      emissive: options.green,
      emissiveIntensity: 2.05 * options.glowIntensityScale,
      metalness: 0.08,
      roughness: 0.24,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  const pulseTailMeshes = Array.from({ length: pulseBudget }, () => {
    const material = new THREE.MeshStandardMaterial({
      map: options.defaultPulseTailMap ?? undefined,
      color: options.green,
      emissive: options.green,
      emissiveIntensity: 1.22 * options.glowIntensityScale,
      metalness: 0.02,
      roughness: 0.34,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(pulseTailGeometry, material);
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  const endpointGeometry = new THREE.TorusGeometry(
    1,
    options.highQuality ? (options.narrowViewport ? 0.112 : 0.095) : 0.08,
    options.highQuality ? 10 : 8,
    options.highQuality ? (options.narrowViewport ? 64 : 84) : 30,
  );
  const endpointMeshes = Array.from({ length: Math.max(0, pulseBudget * 2) }, () => {
    const material = new THREE.MeshStandardMaterial({
      map: options.defaultEndpointPulseMap ?? undefined,
      color: options.green,
      emissive: options.green,
      emissiveIntensity: 1.65 * options.glowIntensityScale,
      metalness: 0.05,
      roughness: 0.28,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(endpointGeometry, material);
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  const pulseLightBudget = options.richPacketLighting ? (options.narrowViewport ? 2 : 4) : 0;
  const pulseLights = Array.from({ length: pulseLightBudget }, () => {
    const light = new THREE.PointLight(options.green, 0, options.narrowViewport ? 26 : 38, 1.85);
    options.group.add(light);
    return light;
  });

  const glowGeometry = new THREE.SphereGeometry(
    1,
    options.highQuality ? (options.narrowViewport ? 24 : 28) : 18,
    options.highQuality ? (options.narrowViewport ? 22 : 24) : 12,
  );
  const baseGlowBudget = options.animationsDisabled
    ? 0
    : options.batteryQuality
      ? (options.narrowViewport ? 8 : 14)
      : options.balancedQuality
        ? (options.narrowViewport ? 18 : 34)
        : options.narrowViewport
          ? 24
          : MAX_GLOW_MESHES;
  const glowBudget = Math.max(0, Math.floor(baseGlowBudget * options.glowDensity * options.effectScale * LIVE_VISIBILITY_BOOST));
  const glowMeshes = Array.from({ length: glowBudget }, () => {
    const material = new THREE.MeshBasicMaterial({
      map: options.defaultGlowMap ?? undefined,
      color: options.green,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(glowGeometry, material);
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  return { pulseMeshes, pulseTailMeshes, endpointMeshes, pulseLights, glowMeshes };
}

export function renderNetgraphEffectFrame(options: {
  animationsDisabled: boolean;
  batteryQuality: boolean;
  cameraQuaternion: THREE.Quaternion;
  defaultEndpointPulseMap?: THREE.Texture | null;
  endpointMeshes: THREE.Mesh[];
  endpointPosition: THREE.Vector3;
  focusHaloMeshes: THREE.Mesh[];
  glowIntensityScale: number;
  glowMeshes: THREE.Mesh[];
  glowPosition: THREE.Vector3;
  glows: NetgraphGlow[];
  highResPackets: boolean;
  isVisiblePoint: (position: THREE.Vector3, margin?: number) => boolean;
  narrowViewport: boolean;
  nodeFocusActive: boolean;
  nodeScaleFactor: number;
  now: number;
  packetTextureVariant: PacketTextureVariant;
  pulseLights: THREE.PointLight[];
  pulseMeshes: THREE.Mesh[];
  pulseTailAxis: THREE.Vector3;
  pulseTailMeshes: THREE.Mesh[];
  pulseTextureAnisotropy: number;
  pulses: NetgraphPulse[];
  reducedMotion: boolean;
  renderGraph: NetgraphGraph;
  renderTier: NetgraphRenderTier;
  runtimeEffectScale: number;
  tailDirection: THREE.Vector3;
  tailMidpoint: THREE.Vector3;
  time: number;
  visibleEdgeIds: Set<string>;
  visibleNodeIds: Set<string>;
}): void {
  options.focusHaloMeshes.forEach((mesh, index) => {
    const baseScale = typeof mesh.userData.baseScale === "number" ? mesh.userData.baseScale : 1;
    const wave = 1 + Math.sin(options.time / 520 + index * 0.7) * 0.055;
    mesh.scale.setScalar(baseScale * wave);
  });
  options.pulseMeshes.forEach((mesh) => {
    mesh.visible = false;
  });
  options.pulseTailMeshes.forEach((mesh) => {
    mesh.visible = false;
  });
  options.endpointMeshes.forEach((mesh) => {
    mesh.visible = false;
  });
  options.glowMeshes.forEach((mesh) => {
    mesh.visible = false;
  });
  options.pulseLights.forEach((light) => {
    light.intensity = 0;
  });

  if (options.animationsDisabled) return;

  let pulseIndex = 0;
  let endpointIndex = 0;
  let pulseLightIndex = 0;
  const tierRuntimeScale = options.runtimeEffectScale * options.renderTier.effectScale;
  const runtimePulseBudget = Math.max(0, Math.floor(options.pulseMeshes.length * tierRuntimeScale));
  const runtimeEndpointBudget = Math.max(0, Math.floor(options.endpointMeshes.length * tierRuntimeScale));
  const runtimeGlowBudget = Math.max(0, Math.floor(options.glowMeshes.length * tierRuntimeScale));
  const showEndpoint = (nodeId: string | undefined, colorValue: string, phase: number, payloadTypeName?: string) => {
    if (!nodeId || endpointIndex >= runtimeEndpointBudget) return;
    const node = options.renderGraph.nodeById.get(nodeId);
    if (node && !options.visibleNodeIds.has(node.id)) return;
    if (!node) return;
    options.endpointPosition.set(node.position.x, node.position.y, node.position.z);
    if (!options.isVisiblePoint(options.endpointPosition, nodeScale(node, options.nodeScaleFactor) * 3.2)) return;
    const mesh = options.endpointMeshes[endpointIndex]!;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const wave = 1 + Math.sin(options.time / 120 + phase) * 0.08;
    const endpointMap = payloadTypeName
      ? getCachedTexture(
        ambientTextureCache,
        ambientTextureFile("focus_pulse", chooseAmbientPacketVariant(options.nodeFocusActive, options.batteryQuality || options.reducedMotion)),
        options.pulseTextureAnisotropy,
      )
      : options.defaultEndpointPulseMap;
    if (endpointMap) {
      material.map = endpointMap;
      material.needsUpdate = true;
    }
    material.color.set(colorValue);
    material.emissive.set(colorValue);
    material.emissiveIntensity = (1.72 + Math.sin(options.time / 150 + phase) * 0.28) * options.glowIntensityScale;
    material.opacity = (0.82 + Math.sin(options.time / 128 + phase) * 0.18) * clamp(options.glowIntensityScale, 0.2, 3);
    mesh.position.copy(options.endpointPosition);
    mesh.quaternion.copy(options.cameraQuaternion);
    mesh.scale.setScalar(nodeScale(node, options.nodeScaleFactor) * (options.narrowViewport ? 3.55 : 3.05) * wave);
    mesh.visible = true;
    endpointIndex += 1;
  };

  for (const pulse of options.pulses) {
    const progress = pulseProgress(pulse, options.now);
    if (!progress || pulseIndex >= runtimePulseBudget) continue;
    const segment = pulse.segments[progress.segmentIndex];
    if (!segment) continue;
    if (!options.visibleEdgeIds.has(segment.edgeId)) continue;
    const position = positionOnEdge(options.renderGraph, segment.edgeId, progress.local, segment.reverse);
    if (!position) continue;
    if (!options.isVisiblePoint(position, options.narrowViewport ? 5 : 4)) continue;
    const mesh = options.pulseMeshes[pulseIndex]!;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const headTexture = getCachedTexture(
      packetTextureCache,
      packetTextureFile(packetHeadTexture(pulse.payloadTypeName), options.packetTextureVariant, options.highResPackets),
      options.pulseTextureAnisotropy,
    );
    const head = 1 - Math.abs(progress.local - 0.5) * 0.34;
    if (headTexture) {
      material.map = headTexture;
      material.needsUpdate = true;
    }
    material.color.set(pulse.color);
    material.emissive.set(pulse.color);
    material.emissiveIntensity = (options.narrowViewport ? 2.05 : 2.35) * options.glowIntensityScale;
    material.opacity = (0.94 + Math.sin(options.time / 110 + pulseIndex) * 0.12) * clamp(options.glowIntensityScale, 0.2, 3);
    mesh.position.copy(position);
    mesh.scale.setScalar(head * (options.narrowViewport ? 2.18 : 1.82) * (0.66 + options.renderTier.cometScale * 0.34));
    mesh.visible = true;
    const light = options.pulseLights[pulseLightIndex];
    if (light) {
      light.color.set(pulse.color);
      light.position.copy(position);
      light.intensity = (options.narrowViewport ? 2.2 : 3.15) * clamp(options.glowIntensityScale, 0.2, 3);
      pulseLightIndex += 1;
    }

    const tailMesh = options.pulseTailMeshes[pulseIndex];
    if (tailMesh) {
      let tailSegmentIndex = progress.segmentIndex;
      let tailLocal = progress.local - 0.22;
      if (tailLocal < 0) {
        tailSegmentIndex -= 1;
        tailLocal = 1 + tailLocal;
      }
      const tailPosition = tailSegmentIndex >= 0 ? positionForPulseLocal(options.renderGraph, pulse, tailSegmentIndex, tailLocal) : null;
      if (tailPosition && options.isVisiblePoint(tailPosition, options.narrowViewport ? 5 : 4)) {
        const tailMaterial = tailMesh.material as THREE.MeshStandardMaterial;
        const trailTexture = getCachedTexture(
          packetTextureCache,
          packetTextureFile(packetTrailTexture(pulse.payloadTypeName), options.packetTextureVariant, options.highResPackets),
          options.pulseTextureAnisotropy,
        );
        if (trailTexture) {
          tailMaterial.map = trailTexture;
          tailMaterial.needsUpdate = true;
        }
        const tailLength = Math.max(1.2, tailPosition.distanceTo(position));
        const tailWidth = head * (options.narrowViewport ? 1.35 : 1.05) * (0.66 + options.renderTier.cometScale * 0.34);
        options.tailDirection.subVectors(position, tailPosition);
        if (options.tailDirection.lengthSq() > 0.001) tailMesh.quaternion.setFromUnitVectors(options.pulseTailAxis, options.tailDirection.normalize());
        options.tailMidpoint.lerpVectors(tailPosition, position, 0.48);
        tailMaterial.color.set(pulse.color);
        tailMaterial.emissive.set(pulse.color);
        tailMaterial.emissiveIntensity = (options.narrowViewport ? 1.18 : 1.45) * options.glowIntensityScale;
        tailMaterial.opacity = 0.52 + Math.sin(options.time / 148 + pulseIndex) * 0.1;
        tailMesh.position.copy(options.tailMidpoint);
        tailMesh.scale.set(tailWidth, tailLength, tailWidth);
        tailMesh.visible = true;
      }
    }

    showEndpoint(pulse.txNodeId, pulse.txColor, pulseIndex, pulse.payloadTypeName);
    showEndpoint(pulse.rxNodeId, pulse.rxColor, pulseIndex + 0.8, pulse.payloadTypeName);
    pulseIndex += 1;
  }

  let glowIndex = 0;
  for (const glow of options.glows) {
    const elapsed = options.now - glow.startedAt;
    if (elapsed < 0 || elapsed > glow.durationMs || glowIndex >= runtimeGlowBudget) continue;
    const node = options.renderGraph.nodeById.get(glow.nodeId);
    if (node && !options.visibleNodeIds.has(node.id)) continue;
    if (!node) continue;
    options.glowPosition.set(node.position.x, node.position.y, node.position.z);
    if (!options.isVisiblePoint(options.glowPosition, nodeScale(node, options.nodeScaleFactor) * 4)) continue;
    const progress = elapsed / glow.durationMs;
    const mesh = options.glowMeshes[glowIndex]!;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const mappedGlow = getCachedTexture(
      packetTextureCache,
      packetTextureFile(glowVisualTexture(glow.payloadTypeName), options.packetTextureVariant, options.highResPackets),
      options.pulseTextureAnisotropy,
    );
    if (mappedGlow) {
      material.map = mappedGlow;
      material.needsUpdate = true;
    }
    material.color.set(glow.color);
    material.opacity = (1 - progress) * 0.86 * clamp(options.glowIntensityScale, 0.2, 3);
    mesh.position.copy(options.glowPosition);
    mesh.scale.setScalar(nodeScale(node, options.nodeScaleFactor) * (2.4 + progress * 4.2));
    mesh.visible = true;
    glowIndex += 1;
  }
}
