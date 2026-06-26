import * as THREE from "three";

import type { NetgraphGlow, NetgraphGraph, NetgraphPulse, NetgraphRenderTier } from "./netgraph-model";
import {
  ambientTextureCache,
  ambientTextureFile,
  chooseAmbientPacketVariant,
  getCachedTexture,
  glowVisualTexture,
  liveTextureCache,
  nodeEventTextureFile,
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

const MAX_PULSE_MESHES = 260;
const MAX_GLOW_MESHES = 128;
const LIVE_VISIBILITY_BOOST = 1.55;
const LIVE_PACKET_BRIGHTNESS_BOOST = 1.32;
const LIVE_PACKET_SIZE_BOOST = 1.2;
const OVERVIEW_TRAFFIC_BRIGHTNESS_BOOST = 2.62;
const OVERVIEW_TRAFFIC_SIZE_BOOST = 1.82;
const OVERVIEW_TRAFFIC_TAIL_BOOST = 1.92;
const MIRRORED_TRAFFIC_BRIGHTNESS_BOOST = 2.18;
const MIRRORED_TRAFFIC_SIZE_BOOST = 1.5;
const MIRRORED_TRAFFIC_TAIL_BOOST = 1.5;
const NODE_FLASH_WINDOW_MS = 1280;

export interface PulseVisuals {
  pulseBeamMeshes: THREE.Mesh[];
  pulseMeshes: THREE.Mesh[];
  pulseTailMeshes: THREE.Mesh[];
  endpointMeshes: THREE.Mesh[];
  pulseLights: THREE.PointLight[];
  glowMeshes: THREE.Mesh[];
}

export interface PulseNodeFlash {
  nodeId: string;
  direction: "tx" | "rx";
  color: string;
  payloadTypeName: string;
  progress: number;
  strength: number;
  terminal: boolean;
  phase: number;
}

function stableRenderHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function flashStrength(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  const attack = 0.82 + clamp(clamped / 0.08, 0, 1) * 0.44;
  const decay = Math.pow(1 - clamped, 0.72);
  return Math.min(1.26, attack * decay);
}

function segmentStartNodeId(segment: NetgraphPulse["segments"][number]): string {
  return segment.reverse ? segment.toId : segment.fromId;
}

function segmentEndNodeId(segment: NetgraphPulse["segments"][number]): string {
  return segment.reverse ? segment.fromId : segment.toId;
}

export function pulseNodeFlashEvents(pulse: NetgraphPulse, now: number, flashWindowMs = NODE_FLASH_WINDOW_MS): PulseNodeFlash[] {
  if (pulse.segments.length === 0 || pulse.durationMs <= 0 || flashWindowMs <= 0) return [];
  const elapsed = now - pulse.startedAt;
  if (elapsed < 0 || elapsed > pulse.durationMs + flashWindowMs) return [];
  const segmentDurationMs = pulse.durationMs / pulse.segments.length;
  const events: PulseNodeFlash[] = [];
  for (const [segmentIndex, segment] of pulse.segments.entries()) {
    const departProgress = (elapsed - segmentIndex * segmentDurationMs) / flashWindowMs;
    if (departProgress >= 0 && departProgress <= 1) {
      const strength = flashStrength(departProgress);
      events.push({
        nodeId: segmentStartNodeId(segment),
        direction: "tx",
        color: pulse.txColor,
        payloadTypeName: pulse.payloadTypeName,
        progress: departProgress,
        strength,
        terminal: segmentIndex === 0 && segmentStartNodeId(segment) === pulse.txNodeId,
        phase: segmentIndex,
      });
    }

    const arriveProgress = (elapsed - (segmentIndex + 1) * segmentDurationMs) / flashWindowMs;
    if (arriveProgress >= 0 && arriveProgress <= 1) {
      const endNodeId = segmentEndNodeId(segment);
      const terminal = segmentIndex === pulse.segments.length - 1 && endNodeId === pulse.rxNodeId;
      const strength = flashStrength(arriveProgress) * (terminal ? 1.38 : 1);
      events.push({
        nodeId: endNodeId,
        direction: "rx",
        color: terminal ? pulse.rxColor : "#54e1a6",
        payloadTypeName: pulse.payloadTypeName,
        progress: arriveProgress,
        strength,
        terminal,
        phase: segmentIndex + 0.48,
      });
    }
  }
  return events;
}

export function resolveVisiblePulseEdgeId(options: {
  pulseId: string;
  segmentEdgeId: string;
  segmentIndex: number;
  visibleEdgeIds: Set<string>;
}): { edgeId: string; mirrored: boolean } | null {
  if (options.visibleEdgeIds.has(options.segmentEdgeId)) return { edgeId: options.segmentEdgeId, mirrored: false };
  const visibleEdgeIds = Array.from(options.visibleEdgeIds);
  if (visibleEdgeIds.length === 0) return null;
  const hash = stableRenderHash(`${options.pulseId}:${options.segmentEdgeId}:${options.segmentIndex}`);
  return { edgeId: visibleEdgeIds[hash % visibleEdgeIds.length]!, mirrored: true };
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
  const pulseBeamGeometry = new THREE.ConeGeometry(
    1,
    1,
    options.highQuality ? 18 : 14,
    1,
    true,
  );
  const basePulseBudget = options.animationsDisabled
    ? 0
    : options.batteryQuality
      ? (options.narrowViewport ? 14 : 22)
      : options.balancedQuality
        ? (options.narrowViewport ? 60 : 168)
        : options.narrowViewport
          ? 72
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
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    mesh.renderOrder = 84;
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  const pulseBeamMeshes = Array.from({ length: pulseBudget }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: options.green,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(pulseBeamGeometry, material);
    mesh.renderOrder = 82;
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
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(pulseTailGeometry, material);
    mesh.renderOrder = 83;
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
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(endpointGeometry, material);
    mesh.renderOrder = 85;
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
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(glowGeometry, material);
    mesh.renderOrder = 81;
    mesh.visible = false;
    options.group.add(mesh);
    return mesh;
  });

  return { pulseBeamMeshes, pulseMeshes, pulseTailMeshes, endpointMeshes, pulseLights, glowMeshes };
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
  pulseBeamMeshes: THREE.Mesh[];
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
  options.pulseBeamMeshes.forEach((mesh) => {
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
  const focusEffectBoost = options.nodeFocusActive ? 1.22 : 1;
  const runtimePulseBudget = Math.max(0, Math.floor(options.pulseMeshes.length * tierRuntimeScale));
  const runtimeEndpointBudget = Math.max(0, Math.floor(options.endpointMeshes.length * tierRuntimeScale));
  const runtimeGlowBudget = Math.max(0, Math.floor(options.glowMeshes.length * tierRuntimeScale));
  const mirroredTrafficVisible = options.visibleEdgeIds.size > 0 && options.visibleEdgeIds.size < options.renderGraph.edges.length;
  const overviewTrafficVisible = options.visibleEdgeIds.size >= options.renderGraph.edges.length;
  let glowIndex = 0;
  const showNodeFlash = (flash: PulseNodeFlash) => {
    if (flash.strength <= 0.018) return;
    const nodeId = flash.nodeId;
    const node = options.renderGraph.nodeById.get(nodeId);
    if (node && !options.visibleNodeIds.has(node.id)) return;
    if (!node) return;
    options.endpointPosition.set(node.position.x, node.position.y, node.position.z);
    if (!options.isVisiblePoint(options.endpointPosition, nodeScale(node, options.nodeScaleFactor) * 6.2)) return;
    const baseSize = nodeScale(node, options.nodeScaleFactor);
    const colorValue = flash.direction === "tx" ? "#91c8ff" : flash.terminal ? "#74ffc4" : flash.color;
    const wave = 1 + Math.sin(options.time / 112 + flash.phase) * 0.06;
    const directionBoost = flash.direction === "rx" ? 1.12 : 1.06;
    const terminalBoost = flash.terminal ? 1.26 : 1;
    const nodeFocusCalm = options.nodeFocusActive ? 0.48 : 1;
    const nodeFocusScale = options.nodeFocusActive ? 0.72 : 1;
    const opacityScale = clamp(options.glowIntensityScale * 1.45, 0.35, 4.2) * focusEffectBoost * flash.strength * terminalBoost * nodeFocusCalm;
    const nodeEventMap = getCachedTexture(
      liveTextureCache,
      nodeEventTextureFile("node_shockwave_ring"),
      options.pulseTextureAnisotropy,
    );
    const endpointMap = nodeEventMap ?? getCachedTexture(
      ambientTextureCache,
      ambientTextureFile("focus_pulse", chooseAmbientPacketVariant(options.nodeFocusActive, options.batteryQuality || options.reducedMotion)),
      options.pulseTextureAnisotropy,
    );

    const paintEndpointRing = (scale: number, opacity: number, emissiveIntensity: number) => {
      if (endpointIndex >= runtimeEndpointBudget) return;
      const mesh = options.endpointMeshes[endpointIndex]!;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (endpointMap) {
        material.map = endpointMap;
        material.needsUpdate = true;
      } else if (options.defaultEndpointPulseMap) {
        material.map = options.defaultEndpointPulseMap;
        material.needsUpdate = true;
      }
      material.color.set(colorValue);
      material.emissive.set(colorValue);
      material.emissiveIntensity = emissiveIntensity;
      material.opacity = opacity;
      mesh.position.copy(options.endpointPosition);
      mesh.quaternion.copy(options.cameraQuaternion);
      mesh.scale.setScalar(scale);
      mesh.visible = true;
      endpointIndex += 1;
    };

    const primaryRingScale = baseSize * (options.narrowViewport ? 2.72 : 2.42) * (1 + flash.progress * 0.82) * wave * directionBoost * terminalBoost * nodeFocusScale;
    const primaryOpacity = Math.min(1, (0.62 + flash.strength * 0.4) * opacityScale);
    const primaryEmissive = (3.4 + flash.strength * 2.8) * options.glowIntensityScale * focusEffectBoost * terminalBoost;
    paintEndpointRing(primaryRingScale, primaryOpacity, primaryEmissive);

    const rippleScale = baseSize * (options.narrowViewport ? 3.58 : 3.16) * (1.02 + flash.progress * 1.08) * wave * directionBoost * terminalBoost * nodeFocusScale;
    const rippleOpacity = Math.min(0.72, (0.26 + flash.strength * 0.28) * opacityScale);
    const rippleEmissive = (2.2 + flash.strength * 1.85) * options.glowIntensityScale * focusEffectBoost * terminalBoost;
    paintEndpointRing(rippleScale, rippleOpacity, rippleEmissive);

    if (glowIndex < runtimeGlowBudget) {
      const mesh = options.glowMeshes[glowIndex]!;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const mappedGlow = getCachedTexture(
        packetTextureCache,
        packetTextureFile(glowVisualTexture(flash.payloadTypeName), options.packetTextureVariant, options.highResPackets),
        options.pulseTextureAnisotropy,
      );
      if (mappedGlow) {
        material.map = mappedGlow;
        material.needsUpdate = true;
      }
      material.color.set(colorValue);
      material.opacity = Math.min(1, (flash.direction === "rx" ? 0.95 : 0.82) * opacityScale);
      mesh.position.copy(options.endpointPosition);
      mesh.scale.setScalar(baseSize * ((flash.direction === "rx" ? 3.08 : 2.72) + flash.progress * (flash.terminal ? 5.6 : 4.4)) * focusEffectBoost * terminalBoost * nodeFocusScale);
      mesh.visible = true;
      glowIndex += 1;
    }
  };
  const showSegmentEdgeFlash = (edgeId: string | undefined, reverse: boolean, local: number, phase: number, payloadTypeName: string) => {
    const edge = edgeId ? options.renderGraph.edgeById.get(edgeId) : undefined;
    if (!edge) return;
    if (local <= 0.3) {
      showNodeFlash({
        nodeId: reverse ? edge.toId : edge.fromId,
        direction: "tx",
        color: "#7ab7ff",
        payloadTypeName,
        progress: clamp(local / 0.3, 0, 1),
        strength: flashStrength(clamp(local / 0.3, 0, 1)),
        terminal: false,
        phase,
      });
    }
    if (local >= 0.7) {
      const progress = clamp((local - 0.7) / 0.3, 0, 1);
      showNodeFlash({
        nodeId: reverse ? edge.fromId : edge.toId,
        direction: "rx",
        color: "#54e1a6",
        payloadTypeName,
        progress,
        strength: flashStrength(progress),
        terminal: false,
        phase: phase + 0.48,
      });
    }
  };

  for (const pulse of options.pulses) {
    for (const flash of pulseNodeFlashEvents(pulse, options.now)) {
      showNodeFlash(flash);
    }
    const progress = pulseProgress(pulse, options.now);
    if (!progress || pulseIndex >= runtimePulseBudget) continue;
    const segment = pulse.segments[progress.segmentIndex];
    if (!segment) continue;
    const displayEdge = resolveVisiblePulseEdgeId({
      pulseId: pulse.id,
      segmentEdgeId: segment.edgeId,
      segmentIndex: progress.segmentIndex,
      visibleEdgeIds: options.visibleEdgeIds,
    });
    if (!displayEdge) continue;
    const mirrorHash = stableRenderHash(`${pulse.id}:mirror:${progress.segmentIndex}`);
    const displayReverse = displayEdge.mirrored ? mirrorHash % 2 === 0 : segment.reverse;
    const displayLocal = displayEdge.mirrored ? (progress.local + ((mirrorHash % 29) / 100)) % 1 : progress.local;
    const brightnessBoost = displayEdge.mirrored
      ? MIRRORED_TRAFFIC_BRIGHTNESS_BOOST
      : overviewTrafficVisible
        ? OVERVIEW_TRAFFIC_BRIGHTNESS_BOOST
        : LIVE_PACKET_BRIGHTNESS_BOOST;
    const sizeBoost = displayEdge.mirrored
      ? MIRRORED_TRAFFIC_SIZE_BOOST
      : overviewTrafficVisible
        ? OVERVIEW_TRAFFIC_SIZE_BOOST
        : LIVE_PACKET_SIZE_BOOST;
    const tailBoost = displayEdge.mirrored
      ? MIRRORED_TRAFFIC_TAIL_BOOST
      : overviewTrafficVisible
        ? OVERVIEW_TRAFFIC_TAIL_BOOST
        : 1;
    const headColor = displayEdge.mirrored ? "#f4fdff" : overviewTrafficVisible ? "#fff7cf" : pulse.color;
    const tailColor = displayEdge.mirrored ? "#7efcff" : overviewTrafficVisible ? "#f3b64f" : pulse.color;
    const position = positionOnEdge(options.renderGraph, displayEdge.edgeId, displayLocal, displayReverse);
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
    material.color.set(headColor);
    material.emissive.set(headColor);
    material.emissiveIntensity = (options.narrowViewport ? 2.35 : 2.85) * options.glowIntensityScale * focusEffectBoost * brightnessBoost;
    material.opacity = Math.min(1, (0.96 + Math.sin(options.time / 110 + pulseIndex) * 0.12) * clamp(options.glowIntensityScale, 0.2, 3) * brightnessBoost);
    mesh.position.copy(position);
    mesh.scale.setScalar(head * (options.narrowViewport ? 2.52 : 2.16) * (0.66 + options.renderTier.cometScale * 0.34) * focusEffectBoost * sizeBoost);
    mesh.visible = true;
    const light = options.pulseLights[pulseLightIndex];
    if (light) {
      light.color.set(pulse.color);
      light.position.copy(position);
      light.intensity = (options.narrowViewport ? 2.9 : 4.25) * clamp(options.glowIntensityScale, 0.2, 3) * focusEffectBoost * brightnessBoost;
      pulseLightIndex += 1;
    }

    const tailMesh = options.pulseTailMeshes[pulseIndex];
    if (tailMesh) {
      const tailOffset = displayEdge.mirrored ? 0.3 : 0.22;
      let tailSegmentIndex = progress.segmentIndex;
      let tailLocal = displayLocal - tailOffset;
      if (tailLocal < 0) {
        tailSegmentIndex -= 1;
        tailLocal = 1 + tailLocal;
      }
      const tailPosition = displayEdge.mirrored
        ? positionOnEdge(options.renderGraph, displayEdge.edgeId, tailLocal, displayReverse)
        : tailSegmentIndex >= 0
          ? positionForPulseLocal(options.renderGraph, pulse, tailSegmentIndex, tailLocal)
          : null;
      if (tailPosition && options.isVisiblePoint(tailPosition, options.narrowViewport ? 5 : 4)) {
        const beamMesh = options.pulseBeamMeshes[pulseIndex];
        if (beamMesh) {
          const beamMaterial = beamMesh.material as THREE.MeshBasicMaterial;
          const beamLength = Math.max(1.4, tailPosition.distanceTo(position));
          const beamWidthBase = overviewTrafficVisible
            ? (options.narrowViewport ? 1.15 : 1.55)
            : displayEdge.mirrored
              ? (options.narrowViewport ? 0.98 : 1.28)
              : (options.narrowViewport ? 0.72 : 0.86);
          const beamWidth = head * beamWidthBase * sizeBoost * focusEffectBoost;
          options.tailDirection.subVectors(position, tailPosition);
          if (options.tailDirection.lengthSq() > 0.001) beamMesh.quaternion.setFromUnitVectors(options.pulseTailAxis, options.tailDirection.normalize());
          const beamCenterT = clamp(1 - tailBoost / 2, 0.08, 0.5);
          options.tailMidpoint.lerpVectors(tailPosition, position, beamCenterT);
          beamMaterial.color.set(tailColor);
          beamMaterial.opacity = Math.min(0.58, (overviewTrafficVisible ? 0.18 : 0.22) * brightnessBoost);
          beamMesh.position.copy(options.tailMidpoint);
          beamMesh.scale.set(beamWidth, beamLength * tailBoost, beamWidth);
          beamMesh.visible = true;
        }
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
        const tailWidth = head * (options.narrowViewport ? 1.15 : 0.92) * (0.66 + options.renderTier.cometScale * 0.34) * sizeBoost;
        options.tailDirection.subVectors(position, tailPosition);
        if (options.tailDirection.lengthSq() > 0.001) tailMesh.quaternion.setFromUnitVectors(options.pulseTailAxis, options.tailDirection.normalize());
        options.tailMidpoint.lerpVectors(tailPosition, position, 0.48);
        tailMaterial.color.set(tailColor);
        tailMaterial.emissive.set(tailColor);
        tailMaterial.emissiveIntensity = (options.narrowViewport ? 1.56 : 1.95) * options.glowIntensityScale * focusEffectBoost * brightnessBoost;
        tailMaterial.opacity = Math.min(1, (0.62 + Math.sin(options.time / 148 + pulseIndex) * 0.12) * focusEffectBoost * brightnessBoost);
        tailMesh.position.copy(options.tailMidpoint);
        tailMesh.scale.set(tailWidth, tailLength * tailBoost, tailWidth);
        tailMesh.visible = true;
      }
    }

    if (displayEdge.mirrored && mirroredTrafficVisible) {
      showSegmentEdgeFlash(displayEdge.edgeId, displayReverse, displayLocal, pulseIndex, pulse.payloadTypeName);
    }
    pulseIndex += 1;
  }

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
    material.opacity = (1 - progress) * 0.86 * clamp(options.glowIntensityScale, 0.2, 3) * focusEffectBoost;
    mesh.position.copy(options.glowPosition);
    mesh.scale.setScalar(nodeScale(node, options.nodeScaleFactor) * (2.4 + progress * 4.2) * focusEffectBoost);
    mesh.visible = true;
    glowIndex += 1;
  }
}
