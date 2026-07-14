import * as THREE from "three";

import {
  type NetgraphGraph,
  type NetgraphRole,
} from "./netgraph-model";
import {
  nodeMissingGeo,
  nodeScale,
  roleGeometry,
} from "./netgraph-three-geometry";
import {
  getCachedTexture,
  nodeIsStale,
  nodeTextureCache,
  nodeTextureFile,
} from "./netgraph-three-assets";

export interface RoleMesh {
  mesh: THREE.InstancedMesh;
  nodeIndices: number[];
  usesTexture: boolean;
}

export interface NodeLiveFlashPaint {
  color: string;
  direction: "tx" | "rx";
  strength: number;
}

export const ROLE_COLORS: Record<NetgraphRole, string> = {
  repeater: "#48df7b",
  companion: "#6aa2ff",
  room: "#ba66ff",
  observer: "#ffb21f",
  sensor: "#a6f43b",
  other: "#9aa6bb",
};

const WHITE = new THREE.Color("#ffffff");

function planetGeometry(highQuality: boolean, batteryQuality: boolean): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, highQuality && !batteryQuality ? 34 : 22, highQuality && !batteryQuality ? 24 : 16);
}

export function createRoleMeshes(options: {
  graph: NetgraphGraph;
  visibleNodeIds: Set<string>;
  selectedNodeId?: string | null;
  selectedNodes: Set<string>;
  useNodeTextures: boolean;
  useDetailedNodeTextures: boolean;
  nodeTextureAnisotropy: number;
  batteryQuality: boolean;
  highQuality: boolean;
  narrowViewport: boolean;
  nodeScaleFactor: number;
}): RoleMesh[] {
  const roleMeshes: RoleMesh[] = [];
  const matrix = new THREE.Matrix4();
  const nodeBuckets = new Map<string, { role: NetgraphRole; texturePath: string | null; nodeIndices: number[] }>();

  options.graph.nodes.forEach((node, index) => {
    if (!options.visibleNodeIds.has(node.id)) return;
    const texturePath = options.useNodeTextures ? nodeTextureFile(node, options.selectedNodeId, options.selectedNodes, options.useDetailedNodeTextures) : null;
    const key = `${node.role}|${texturePath ?? "solid"}`;
    const existing = nodeBuckets.get(key);
    const item = existing ?? { role: node.role, texturePath, nodeIndices: [] };
    item.nodeIndices.push(index);
    nodeBuckets.set(key, item);
  });

  for (const { role, texturePath, nodeIndices } of nodeBuckets.values()) {
    const usePlanetNode = options.useNodeTextures;
    const useTexture = usePlanetNode && texturePath != null;
    const nodeTexture = useTexture ? getCachedTexture(nodeTextureCache, texturePath, options.nodeTextureAnisotropy) : null;
    const material: THREE.Material = options.batteryQuality || !nodeTexture
      ? new THREE.MeshLambertMaterial({
        color: new THREE.Color(ROLE_COLORS[role]).lerp(new THREE.Color("#ffffff"), usePlanetNode ? 0.18 : 0.05),
        emissive: new THREE.Color(ROLE_COLORS[role]).multiplyScalar(usePlanetNode ? 0.38 : 0.22),
        emissiveIntensity: usePlanetNode ? 1.05 : 0.82,
      })
      : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: nodeTexture ?? undefined,
        emissive: new THREE.Color(ROLE_COLORS[role]).multiplyScalar(0.18),
        emissiveIntensity: options.highQuality ? 0.45 : options.narrowViewport ? 0.32 : 0.26,
        vertexColors: true,
        metalness: 0.12,
        roughness: 0.42,
      });
    const mesh = new THREE.InstancedMesh(usePlanetNode ? planetGeometry(options.highQuality, options.batteryQuality) : roleGeometry(role, options.highQuality && !options.batteryQuality), material, nodeIndices.length);
    mesh.userData.nodeIndices = nodeIndices;
    nodeIndices.forEach((nodeIndex, instanceIndex) => {
      const node = options.graph.nodes[nodeIndex]!;
      const size = nodeScale(node, options.nodeScaleFactor) * (options.narrowViewport ? 1.96 : 1.86) * (usePlanetNode ? 1.24 : 1.04);
      matrix.compose(
        new THREE.Vector3(node.position.x, node.position.y, node.position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(usePlanetNode ? 0.12 : 0.35, 0, node.role === "room" && !usePlanetNode ? Math.PI / 4 : 0)),
        new THREE.Vector3(size, size, size),
      );
      mesh.setMatrixAt(instanceIndex, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.usesTexture = useTexture;
    roleMeshes.push({ mesh, nodeIndices, usesTexture: useTexture });
  }

  return roleMeshes;
}

export function paintRoleMeshes(options: {
  roleMeshes: RoleMesh[];
  graph: NetgraphGraph;
  selectedNodeId?: string | null;
  hoverNodeId: string | null;
  directNodeNeighbors: Set<string>;
  secondHopNeighbors: Set<string>;
  searchMatches: Set<string>;
  selectedNodes: Set<string>;
  nodeFocusActive: boolean;
  showDataQuality: boolean;
  liveNodeFlashes?: Map<string, NodeLiveFlashPaint>;
  primary: THREE.Color;
  bg: THREE.Color;
  muted: THREE.Color;
  now?: number;
}): void {
  const color = new THREE.Color();
  const flashColor = new THREE.Color();
  const now = options.now ?? Date.now();
  for (const { mesh, nodeIndices, usesTexture } of options.roleMeshes) {
    nodeIndices.forEach((nodeIndex, instanceIndex) => {
      const node = options.graph.nodes[nodeIndex]!;
      const roleColor = new THREE.Color(ROLE_COLORS[node.role]);
      if (usesTexture) color.set(WHITE).lerp(roleColor, 0.1);
      else color.set(roleColor);
      if (node.id === options.selectedNodeId || node.id === options.hoverNodeId) {
        color.lerp(WHITE, usesTexture ? 0.22 : 0.5);
      } else if (options.directNodeNeighbors.has(node.id)) {
        color.lerp(WHITE, usesTexture ? 0.16 : 0.28);
      } else if (options.secondHopNeighbors.has(node.id)) {
        color.lerp(options.primary, usesTexture ? 0.08 : 0.16);
      } else if (options.searchMatches.size > 0 && !options.searchMatches.has(node.id)) {
        color.lerp(options.bg, usesTexture ? 0.32 : 0.58);
      } else if (options.selectedNodes.size > 0 && !options.selectedNodes.has(node.id)) {
        color.lerp(options.bg, usesTexture ? (options.nodeFocusActive ? 0.58 : 0.46) : (options.nodeFocusActive ? 0.82 : 0.72));
      } else if (options.selectedNodes.has(node.id)) {
        color.lerp(options.primary, usesTexture ? 0.14 : 0.36);
      } else if (node.degree <= 1) {
        color.lerp(options.muted, usesTexture ? 0.08 : 0.18);
      }
      if (options.showDataQuality && nodeMissingGeo(node)) color.lerp(new THREE.Color("#ffd45a"), usesTexture ? 0.12 : 0.22);
      if (options.showDataQuality && nodeIsStale(node, now)) color.lerp(options.muted, usesTexture ? 0.28 : 0.48);
      const liveFlash = options.liveNodeFlashes?.get(node.id);
      if (liveFlash) {
        const strength = Math.min(1.45, Math.max(0, liveFlash.strength));
        flashColor.set(liveFlash.color);
        color.lerp(flashColor, usesTexture ? Math.min(0.86, 0.52 + strength * 0.34) : Math.min(0.94, 0.66 + strength * 0.3));
        color.lerp(WHITE, Math.min(0.74, (liveFlash.direction === "rx" ? 0.3 : 0.24) + strength * 0.3));
      }
      mesh.setColorAt(instanceIndex, color);
    });
    mesh.instanceColor!.needsUpdate = true;
  }
}

export function applyLiveElevationToRoleMeshes(options: {
  roleMeshes: RoleMesh[];
  graph: NetgraphGraph;
  liveNodeFlashes: Map<string, NodeLiveFlashPaint>;
}): void {
  if (options.graph.layoutMode !== "geo") return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const base = new THREE.Vector3();
  for (const { mesh, nodeIndices } of options.roleMeshes) {
    nodeIndices.forEach((nodeIndex, instanceIndex) => {
      const node = options.graph.nodes[nodeIndex]!;
      mesh.getMatrixAt(instanceIndex, matrix);
      matrix.decompose(position, rotation, scale);
      base.set(node.position.x, node.position.y, node.position.z);
      const flash = options.liveNodeFlashes.get(node.id);
      const lift = flash ? Math.min(10, 2.2 + Math.max(0, flash.strength) * 5.4) : 0;
      if (base.lengthSq() > 0.001) base.addScaledVector(base.clone().normalize(), lift);
      matrix.compose(base, rotation, scale);
      mesh.setMatrixAt(instanceIndex, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}
