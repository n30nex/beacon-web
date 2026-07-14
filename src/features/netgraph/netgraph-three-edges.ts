import * as THREE from "three";

import type { NetgraphGraph } from "./netgraph-model";
import {
  colorForEdge,
  edgeBeamMesh,
  edgeBeamOpacityForDensity,
  edgeColors,
  edgePositions,
  nodePosition,
} from "./netgraph-three-geometry";
import {
  ambientTextureCache,
  ambientTextureFile,
  chooseAmbientPacketVariant,
  getCachedTexture,
} from "./netgraph-three-assets";

export interface EdgeVisuals {
  objects: THREE.Object3D[];
  hoverGeometry: THREE.BufferGeometry;
  hoverMaterial: THREE.LineBasicMaterial;
}

export function createEdgeVisuals(options: {
  graph: NetgraphGraph;
  visibleEdgeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  directEdgeIds: Set<string>;
  selectedEdgesCount: number;
  directNodeEdgesCount: number;
  nodeFocusActive: boolean;
  liveFocusActive: boolean;
  highQuality: boolean;
  batteryQuality: boolean;
  denseGraph: boolean;
  lowPower: boolean;
  narrowViewport: boolean;
  edgeOpacityScale: number;
  primary: THREE.Color;
  ambientMapAnisotropy: number;
}): EdgeVisuals {
  const objects: THREE.Object3D[] = [];
  const baseLineOpacity = Math.min(
    1,
    options.edgeOpacityScale * (options.selectedEdgesCount > 0
      ? options.nodeFocusActive
        ? options.narrowViewport ? 0.34 : 0.26
        : options.narrowViewport ? 0.26 : 0.18
      : options.liveFocusActive
        ? options.narrowViewport ? 0.46 : 0.34
        : options.narrowViewport ? 0.54 : 0.4),
  );
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions(options.graph, options.visibleEdgeIds), 3));
  edgeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(edgeColors(options.graph, options.visibleEdgeIds), 3));
  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: baseLineOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  objects.push(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  const selectedGeometry = new THREE.BufferGeometry();
  selectedGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions(options.graph, options.selectedEdgeIds), 3));
  const selectedMaterial = new THREE.LineBasicMaterial({
    color: options.primary,
    transparent: true,
    opacity: Math.min(1, (options.selectedEdgesCount > 0 ? 1 : 0) * options.edgeOpacityScale),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  objects.push(new THREE.LineSegments(selectedGeometry, selectedMaterial));

  const directGeometry = new THREE.BufferGeometry();
  directGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions(options.graph, options.directEdgeIds), 3));
  const directMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: Math.min(1, (options.directNodeEdgesCount > 0 ? 1 : 0) * options.edgeOpacityScale),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  objects.push(new THREE.LineSegments(directGeometry, directMaterial));

  const edgeBeamsGroup = createEdgeBeamGroup(options);
  if (edgeBeamsGroup.children.length > 0) objects.push(edgeBeamsGroup);

  const hoverGeometry = new THREE.BufferGeometry();
  hoverGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(), 3));
  const hoverMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  objects.push(new THREE.LineSegments(hoverGeometry, hoverMaterial));

  return { objects, hoverGeometry, hoverMaterial };
}

export function updateHoverEdgeVisual(options: {
  graph: NetgraphGraph;
  hoverGeometry: THREE.BufferGeometry;
  hoverMaterial: THREE.LineBasicMaterial;
  edgeId: string | null;
  edgeOpacityScale: number;
}): void {
  options.hoverGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(options.edgeId ? edgePositions(options.graph, new Set([options.edgeId])) : new Float32Array(), 3),
  );
  options.hoverMaterial.opacity = options.edgeId ? Math.min(1, 1.08 * options.edgeOpacityScale) : 0;
  options.hoverGeometry.computeBoundingSphere();
}

function createEdgeBeamGroup(options: {
  graph: NetgraphGraph;
  visibleEdgeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  directEdgeIds: Set<string>;
  selectedEdgesCount: number;
  directNodeEdgesCount: number;
  nodeFocusActive: boolean;
  highQuality: boolean;
  batteryQuality: boolean;
  denseGraph: boolean;
  lowPower: boolean;
  narrowViewport: boolean;
  edgeOpacityScale: number;
  primary: THREE.Color;
  ambientMapAnisotropy: number;
}): THREE.Group {
  const edgeBeamsGroup = new THREE.Group();
  const hasEmphasis = options.selectedEdgesCount > 0 || options.directNodeEdgesCount > 0;
  const edgeBeamEnabled = options.graph.layoutMode === "galaxy" && options.highQuality && !options.batteryQuality && (!options.denseGraph || options.nodeFocusActive || hasEmphasis) && !options.lowPower;
  if (!edgeBeamEnabled) return edgeBeamsGroup;

  const edgeBeamVariant = chooseAmbientPacketVariant(options.nodeFocusActive, options.batteryQuality);
  const edgeBeamSolid = getCachedTexture(ambientTextureCache, ambientTextureFile("edge_beam_solid", edgeBeamVariant), options.ambientMapAnisotropy);
  const edgeBeamFuzzy = getCachedTexture(ambientTextureCache, ambientTextureFile("edge_beam_fuzzy", edgeBeamVariant), options.ambientMapAnisotropy);
  const visibleEdgeIdsArray = Array.from(options.visibleEdgeIds);
  const maxRegularEdgeBeams = options.denseGraph && !options.nodeFocusActive
    ? options.narrowViewport ? 36 : 72
    : options.narrowViewport ? 96 : 180;
  const maxEmphasisEdgeBeams = options.narrowViewport ? 48 : 84;
  let beamCount = 0;
  const emphasisEdgeIds = new Set<string>();
  const edgeRadius = options.narrowViewport ? 0.024 : 0.03;

  const addBeam = (edgeId: string, color: THREE.Color, opacity: number, radius = edgeRadius, map?: THREE.Texture | null) => {
    const edge = options.graph.edgeById.get(edgeId);
    if (!edge) return;
    const from = options.graph.nodeById.get(edge.fromId);
    const to = options.graph.nodeById.get(edge.toId);
    if (!from || !to) return;
    if (beamCount >= maxRegularEdgeBeams) return;
    const start = nodePosition(from);
    const end = nodePosition(to);
    const mesh = edgeBeamMesh(start, end, color, {
      emissiveIntensity: 0.82,
      highFidelity: true,
      radius,
      opacity: Math.min(1, Math.max(0.1, opacity * (options.narrowViewport ? 0.9 : 1))),
      map,
    });
    edgeBeamsGroup.add(mesh);
    beamCount += 1;
  };

  const addEdgeBeamSet = (ids: Set<string>, color: THREE.Color, opacity: number) => {
    for (const edgeId of ids) {
      if (beamCount >= maxRegularEdgeBeams) break;
      addBeam(edgeId, color, opacity, edgeRadius, edgeBeamFuzzy);
      emphasisEdgeIds.add(edgeId);
    }
  };

  addEdgeBeamSet(options.selectedEdgeIds, new THREE.Color(0xffffff), edgeBeamOpacityForDensity(options.edgeOpacityScale, true) * 1.08);
  addEdgeBeamSet(options.directEdgeIds, options.primary.clone(), edgeBeamOpacityForDensity(options.edgeOpacityScale, true) * 1.02);

  let regularBeamCount = 0;
  const regularCap = maxRegularEdgeBeams;
  if (!options.denseGraph || options.nodeFocusActive) {
    for (const edgeId of visibleEdgeIdsArray) {
      if (beamCount >= regularCap) break;
      if (emphasisEdgeIds.has(edgeId)) continue;
      const edge = options.graph.edgeById.get(edgeId);
      if (!edge || !options.graph.nodeById.has(edge.fromId) || !options.graph.nodeById.has(edge.toId)) continue;
      if (regularBeamCount >= maxRegularEdgeBeams - Math.min(maxEmphasisEdgeBeams, 64)) continue;
      regularBeamCount += 1;
      addBeam(edgeId, colorForEdge(edge.observationCount), edgeBeamOpacityForDensity(options.edgeOpacityScale, false) * 0.82, edgeRadius * 0.66, edgeBeamSolid);
    }
  }

  return edgeBeamsGroup;
}
