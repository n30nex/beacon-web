import * as THREE from "three";

import type { NetgraphGraph } from "./netgraph-model";
import { nodeScale } from "./netgraph-three-geometry";
import { ROLE_COLORS } from "./netgraph-three-nodes";

export interface FocusVisuals {
  focusHaloMeshes: THREE.Mesh[];
  selectedSunGroup: THREE.Group;
}

export function createFocusVisuals(options: {
  group: THREE.Group;
  graph: NetgraphGraph;
  selectedNodes: Set<string>;
  visibleNodeIds: Set<string>;
  selectedNodeId?: string | null;
  directNodeNeighbors: Set<string>;
  nodeFocusActive: boolean;
  batteryQuality: boolean;
  narrowViewport: boolean;
  highQuality: boolean;
  nodeScaleFactor: number;
  focusHaloScale: number;
  primary: THREE.Color;
  green: THREE.Color;
}): FocusVisuals {
  const focusHaloGeometry = new THREE.SphereGeometry(1, 18, 10);
  const focusHaloNodeIds = Array.from(options.selectedNodes)
    .filter((nodeId) => options.visibleNodeIds.has(nodeId))
    .sort((a, b) => Number(b === options.selectedNodeId) - Number(a === options.selectedNodeId) || Number(options.directNodeNeighbors.has(b)) - Number(options.directNodeNeighbors.has(a)))
    .slice(0, options.batteryQuality ? 14 : options.narrowViewport ? 22 : 38);
  const focusHaloMeshes = focusHaloNodeIds.map((nodeId) => {
    const node = options.graph.nodeById.get(nodeId);
    const material = new THREE.MeshBasicMaterial({
      color: nodeId === options.selectedNodeId ? 0xffffff : options.directNodeNeighbors.has(nodeId) ? options.primary : options.green,
      transparent: true,
      opacity: nodeId === options.selectedNodeId ? 0.29 : options.directNodeNeighbors.has(nodeId) ? 0.16 : 0.07,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(focusHaloGeometry, material);
    if (node) {
      const baseScale = nodeScale(node, options.nodeScaleFactor) * options.focusHaloScale * (nodeId === options.selectedNodeId ? 3.55 : options.directNodeNeighbors.has(nodeId) ? 2.65 : 1.82);
      mesh.position.set(node.position.x, node.position.y, node.position.z);
      mesh.scale.setScalar(baseScale);
      mesh.userData.baseScale = baseScale;
    }
    mesh.visible = Boolean(node);
    options.group.add(mesh);
    return mesh;
  });

  const selectedSunGroup = new THREE.Group();
  const selectedSunNode = options.selectedNodeId ? options.graph.nodeById.get(options.selectedNodeId) : null;
  if (options.nodeFocusActive && selectedSunNode) {
    const sunColor = new THREE.Color(ROLE_COLORS[selectedSunNode.role]).lerp(new THREE.Color("#ffffff"), 0.38);
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(1, options.highQuality ? 32 : 20, options.highQuality ? 20 : 12),
      new THREE.MeshStandardMaterial({
        color: sunColor,
        emissive: sunColor,
        emissiveIntensity: options.highQuality ? 2.05 : 1.46,
        metalness: 0.08,
        roughness: 0.24,
      }),
    );
    sunCore.scale.setScalar(nodeScale(selectedSunNode, options.nodeScaleFactor) * 1.86);
    selectedSunGroup.add(sunCore);

    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 16),
      new THREE.MeshBasicMaterial({
        color: sunColor,
        transparent: true,
        opacity: options.highQuality ? 0.34 : 0.23,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    corona.scale.setScalar(nodeScale(selectedSunNode, options.nodeScaleFactor) * 5.2);
    selectedSunGroup.add(corona);

    for (let index = 0; index < 4; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(nodeScale(selectedSunNode, options.nodeScaleFactor) * (3.05 + index * 1.18), 0.04, 8, 112),
        new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? options.primary : options.green,
          transparent: true,
          opacity: 0.23 - index * 0.035,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.rotation.set(0.7 + index * 0.2, 0.35 + index * 0.42, index * 0.72);
      selectedSunGroup.add(ring);
    }
    selectedSunGroup.position.set(selectedSunNode.position.x, selectedSunNode.position.y, selectedSunNode.position.z);
    options.group.add(selectedSunGroup);
  }

  return { focusHaloMeshes, selectedSunGroup };
}
