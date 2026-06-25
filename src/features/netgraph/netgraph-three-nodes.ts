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
}

export const ROLE_COLORS: Record<NetgraphRole, string> = {
  repeater: "#48df7b",
  companion: "#6aa2ff",
  room: "#ba66ff",
  observer: "#ffb21f",
  sensor: "#a6f43b",
  other: "#9aa6bb",
};

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
        emissive: new THREE.Color(ROLE_COLORS[role]).multiplyScalar(0.62),
        emissiveIntensity: options.highQuality ? 0.72 : options.narrowViewport ? 0.5 : 0.42,
        vertexColors: true,
        metalness: 0.12,
        roughness: 0.42,
      });
    const mesh = new THREE.InstancedMesh(usePlanetNode ? planetGeometry(options.highQuality, options.batteryQuality) : roleGeometry(role, options.highQuality && !options.batteryQuality), material, nodeIndices.length);
    mesh.userData.nodeIndices = nodeIndices;
    nodeIndices.forEach((nodeIndex, instanceIndex) => {
      const node = options.graph.nodes[nodeIndex]!;
      const size = nodeScale(node, options.nodeScaleFactor) * (options.narrowViewport ? 2.18 : 2.05) * (usePlanetNode ? 1.34 : 1.1);
      matrix.compose(
        new THREE.Vector3(node.position.x, node.position.y, node.position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(usePlanetNode ? 0.12 : 0.35, 0, node.role === "room" && !usePlanetNode ? Math.PI / 4 : 0)),
        new THREE.Vector3(size, size, size),
      );
      mesh.setMatrixAt(instanceIndex, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    roleMeshes.push({ mesh, nodeIndices });
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
  primary: THREE.Color;
  bg: THREE.Color;
  muted: THREE.Color;
  now?: number;
}): void {
  const color = new THREE.Color();
  const now = options.now ?? Date.now();
  for (const { mesh, nodeIndices } of options.roleMeshes) {
    nodeIndices.forEach((nodeIndex, instanceIndex) => {
      const node = options.graph.nodes[nodeIndex]!;
      color.set(ROLE_COLORS[node.role]);
      if (node.id === options.selectedNodeId || node.id === options.hoverNodeId) {
        color.lerp(new THREE.Color("#ffffff"), 0.5);
      } else if (options.directNodeNeighbors.has(node.id)) {
        color.lerp(new THREE.Color("#ffffff"), 0.28);
      } else if (options.secondHopNeighbors.has(node.id)) {
        color.lerp(options.primary, 0.16);
      } else if (options.searchMatches.size > 0 && !options.searchMatches.has(node.id)) {
        color.lerp(options.bg, 0.58);
      } else if (options.selectedNodes.size > 0 && !options.selectedNodes.has(node.id)) {
        color.lerp(options.bg, options.nodeFocusActive ? 0.82 : 0.72);
      } else if (options.selectedNodes.has(node.id)) {
        color.lerp(options.primary, 0.36);
      } else if (node.degree <= 1) {
        color.lerp(options.muted, 0.18);
      }
      if (options.showDataQuality && nodeMissingGeo(node)) color.lerp(new THREE.Color("#ffd45a"), 0.22);
      if (options.showDataQuality && nodeIsStale(node, now)) color.lerp(options.muted, 0.48);
      mesh.setColorAt(instanceIndex, color);
    });
    mesh.instanceColor!.needsUpdate = true;
  }
}
