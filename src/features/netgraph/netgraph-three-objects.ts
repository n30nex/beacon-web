import * as THREE from "three";

import type { NetgraphGraph, NetgraphRenderTier } from "./netgraph-model";
import {
  ambientTextureCache,
  ambientTextureFile,
  chooseAmbientPacketVariant,
  getCachedTexture,
  packetTextureCache,
  packetTextureFile,
  type PacketTextureVariant,
} from "./netgraph-three-assets";
import { createEdgeVisuals, type EdgeVisuals } from "./netgraph-three-edges";
import { createPulseVisuals } from "./netgraph-three-effects";
import { createFocusVisuals } from "./netgraph-three-focus";
import { intersectSets } from "./netgraph-three-geometry";
import { createRoleMeshes, ROLE_COLORS, type RoleMesh } from "./netgraph-three-nodes";
import { createRouteHeatVisuals, routeHeatEffectsEnabled, type RouteHeatVisuals } from "./netgraph-three-route-heat";
import { createNodeLabelSprites } from "./netgraph-three-scene";

export interface NetgraphObjectVisuals {
  defaultEndpointPulseMap: THREE.Texture | null;
  edgeVisuals: EdgeVisuals;
  endpointMeshes: THREE.Mesh[];
  focusHaloMeshes: THREE.Mesh[];
  glowMeshes: THREE.Mesh[];
  highResPackets: boolean;
  packetTextureVariant: PacketTextureVariant;
  pulseBeamMeshes: THREE.Mesh[];
  pulseLights: THREE.PointLight[];
  pulseMeshes: THREE.Mesh[];
  pulseTailMeshes: THREE.Mesh[];
  pulseTextureAnisotropy: number;
  roleMeshes: RoleMesh[];
  routeHeatVisuals: RouteHeatVisuals;
  selectedSunGroup: THREE.Group;
}

export function createNetgraphObjectVisuals(options: {
  animationsDisabled: boolean;
  balancedQuality: boolean;
  batteryQuality: boolean;
  denseGraph: boolean;
  directNodeEdges: Set<string>;
  directNodeNeighbors: Set<string>;
  edgeOpacityScale: number;
  focusHaloScale: number;
  glowDensity: number;
  glowIntensityScale: number;
  graph: NetgraphGraph;
  green: THREE.Color;
  group: THREE.Group;
  highQuality: boolean;
  importantLabels: Set<string>;
  labelDensity: number;
  labelScale: number;
  liveFocusActive: boolean;
  lowPower: boolean;
  narrowViewport: boolean;
  nodeFocusActive: boolean;
  nodeScaleFactor: number;
  primary: THREE.Color;
  pulseDensity: number;
  reducedMotion: boolean;
  renderTier: NetgraphRenderTier;
  richPacketLighting: boolean;
  searchMatches: Set<string>;
  selectedEdges: Set<string>;
  selectedNodeId?: string | null;
  selectedNodes: Set<string>;
  textureAnisotropy: number;
  visibleEdgeIds: Set<string>;
  visibleNodeIds: Set<string>;
}): NetgraphObjectVisuals {
  const selectedEdgeIds = intersectSets(options.selectedEdges, options.visibleEdgeIds);
  const directEdgeIds = intersectSets(options.directNodeEdges, options.visibleEdgeIds);
  const edgeVisuals = createEdgeVisuals({
    graph: options.graph,
    visibleEdgeIds: options.visibleEdgeIds,
    selectedEdgeIds,
    directEdgeIds,
    selectedEdgesCount: options.selectedEdges.size,
    directNodeEdgesCount: options.directNodeEdges.size,
    nodeFocusActive: options.nodeFocusActive,
    liveFocusActive: options.liveFocusActive,
    highQuality: options.highQuality,
    batteryQuality: options.batteryQuality,
    denseGraph: options.denseGraph,
    lowPower: options.lowPower,
    narrowViewport: options.narrowViewport,
    edgeOpacityScale: options.edgeOpacityScale,
    primary: options.primary,
    ambientMapAnisotropy: options.textureAnisotropy,
  });
  edgeVisuals.objects.forEach((object) => options.group.add(object));

  const useNodeTextures = options.renderTier.textureQuality !== "minimal";
  const useDetailedNodeTextures = options.renderTier.textureQuality === "high";
  const roleMeshes = createRoleMeshes({
    graph: options.graph,
    visibleNodeIds: options.visibleNodeIds,
    selectedNodeId: options.selectedNodeId,
    selectedNodes: options.selectedNodes,
    useNodeTextures,
    useDetailedNodeTextures,
    nodeTextureAnisotropy: options.textureAnisotropy,
    batteryQuality: options.batteryQuality,
    highQuality: options.highQuality,
    narrowViewport: options.narrowViewport,
    nodeScaleFactor: options.nodeScaleFactor,
  });
  roleMeshes.forEach(({ mesh }) => options.group.add(mesh));

  createNodeLabelSprites({
    group: options.group,
    graph: options.graph,
    importantLabels: options.importantLabels,
    visibleNodeIds: options.visibleNodeIds,
    selectedNodeId: options.selectedNodeId,
    directNodeNeighbors: options.directNodeNeighbors,
    searchMatches: options.searchMatches,
    selectedNodes: options.selectedNodes,
    roleColors: ROLE_COLORS,
    nodeFocusActive: options.nodeFocusActive,
    labelScale: options.labelScale,
    labelDensity: options.labelDensity,
    labelBudgetScale: options.renderTier.labelBudgetScale,
    batteryQuality: options.batteryQuality,
    balancedQuality: options.balancedQuality,
    denseGraph: options.denseGraph,
    narrowViewport: options.narrowViewport,
  });

  const packetTextureVariant = chooseAmbientPacketVariant(options.nodeFocusActive, options.batteryQuality || options.reducedMotion);
  const highResPackets = options.renderTier.textureQuality === "high";
  const defaultPulseHeadMap = getCachedTexture(
    packetTextureCache,
    packetTextureFile("packet_standard_medium", packetTextureVariant, highResPackets),
    options.textureAnisotropy,
  );
  const defaultPulseTailMap = getCachedTexture(
    packetTextureCache,
    packetTextureFile("trail_short", packetTextureVariant, highResPackets),
    options.textureAnisotropy,
  );
  const defaultEndpointPulseMap = getCachedTexture(
    ambientTextureCache,
    ambientTextureFile("focus_pulse", packetTextureVariant),
    options.textureAnisotropy,
  );
  const defaultGlowMap = getCachedTexture(
    packetTextureCache,
    packetTextureFile("comet_data", packetTextureVariant, highResPackets),
    options.textureAnisotropy,
  );
  const { pulseBeamMeshes, pulseMeshes, pulseTailMeshes, endpointMeshes, pulseLights, glowMeshes } = createPulseVisuals({
    group: options.group,
    green: options.green,
    highQuality: options.highQuality,
    narrowViewport: options.narrowViewport,
    animationsDisabled: options.animationsDisabled,
    batteryQuality: options.batteryQuality,
    balancedQuality: options.balancedQuality,
    pulseDensity: options.pulseDensity,
    glowDensity: options.glowDensity,
    cometScale: options.renderTier.cometScale,
    effectScale: options.renderTier.effectScale,
    glowIntensityScale: options.glowIntensityScale,
    richPacketLighting: options.richPacketLighting,
    defaultPulseHeadMap,
    defaultPulseTailMap,
    defaultEndpointPulseMap,
    defaultGlowMap,
  });

  const routeHeatVisuals = createRouteHeatVisuals({
    group: options.group,
    enabled: routeHeatEffectsEnabled({
      animationsDisabled: options.animationsDisabled,
      batteryQuality: options.batteryQuality,
      lowPower: options.lowPower,
      reducedMotion: options.reducedMotion,
    }),
    highQuality: options.highQuality,
    narrowViewport: options.narrowViewport,
    textureAnisotropy: options.textureAnisotropy,
  });

  const { focusHaloMeshes, selectedSunGroup } = createFocusVisuals({
    group: options.group,
    graph: options.graph,
    selectedNodes: options.selectedNodes,
    visibleNodeIds: options.visibleNodeIds,
    selectedNodeId: options.selectedNodeId,
    directNodeNeighbors: options.directNodeNeighbors,
    nodeFocusActive: options.nodeFocusActive,
    batteryQuality: options.batteryQuality,
    narrowViewport: options.narrowViewport,
    highQuality: options.highQuality,
    nodeScaleFactor: options.nodeScaleFactor,
    focusHaloScale: options.focusHaloScale,
    primary: options.primary,
    green: options.green,
  });

  return {
    defaultEndpointPulseMap,
    edgeVisuals,
    endpointMeshes,
    focusHaloMeshes,
    glowMeshes,
    highResPackets,
    packetTextureVariant,
    pulseBeamMeshes,
    pulseLights,
    pulseMeshes,
    pulseTailMeshes,
    pulseTextureAnisotropy: options.textureAnisotropy,
    roleMeshes,
    routeHeatVisuals,
    selectedSunGroup,
  };
}
