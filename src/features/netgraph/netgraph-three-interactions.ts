import * as THREE from "three";
import type { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import type { NetgraphHoverState } from "./NetgraphCanvasHud";
import type { NetgraphGraph, NetgraphNode } from "./netgraph-model";
import { updateHoverEdgeVisual, type EdgeVisuals } from "./netgraph-three-edges";
import {
  edgeFocusPoint,
  nearestEdgeId,
  nearestProjectedNode,
  routeIdForEdge,
} from "./netgraph-three-geometry";
import { paintRoleMeshes, type RoleMesh } from "./netgraph-three-nodes";

interface PointerStart {
  id: number;
  x: number;
  y: number;
  time: number;
}

export interface NetgraphPointerHandlers {
  onCanvasClick: (event: MouseEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerLeave: () => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}

export function createNetgraphPointerHandlers(options: {
  bg: THREE.Color;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  directNodeNeighbors: Set<string>;
  edgeOpacityScale: number;
  edgeVisuals: EdgeVisuals;
  flightControls: PointerLockControls;
  flyRoute: (routeId: number | null | undefined) => void;
  focusDirectionForPoint: (target: THREE.Vector3) => THREE.Vector3;
  focusNode: (node: NetgraphNode, animate?: boolean) => void;
  focusPoint: (target: THREE.Vector3, distance: number, animate?: boolean, direction?: THREE.Vector3) => void;
  frameCamera: (animate?: boolean, guidedIntro?: boolean) => void;
  graph: NetgraphGraph;
  host: HTMLElement;
  muted: THREE.Color;
  nodeFocusActive: boolean;
  nodeScaleFactor: number;
  onSelectNode: (nodeId: string) => void;
  onSelectRoute: (routeId: number) => void;
  pickableEdgeIds: Set<string>;
  pickableNodeIds: Set<string>;
  primary: THREE.Color;
  radius: number;
  roleMeshes: RoleMesh[];
  searchMatches: Set<string>;
  secondHopNeighbors: Set<string>;
  selectedNodeId?: string | null;
  selectedNodes: Set<string>;
  selectedRouteId?: number | null;
  setHovered: (hovered: NetgraphHoverState | null) => void;
  showDataQuality: boolean;
}): NetgraphPointerHandlers {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let hoverNodeId: string | null = null;
  let hoverEdgeId: string | null = null;
  let pointerStart: PointerStart | null = null;
  let lastTap: PointerStart | null = null;

  const paintNodes = () => {
    paintRoleMeshes({
      roleMeshes: options.roleMeshes,
      graph: options.graph,
      selectedNodeId: options.selectedNodeId,
      hoverNodeId,
      directNodeNeighbors: options.directNodeNeighbors,
      secondHopNeighbors: options.secondHopNeighbors,
      searchMatches: options.searchMatches,
      selectedNodes: options.selectedNodes,
      nodeFocusActive: options.nodeFocusActive,
      showDataQuality: options.showDataQuality,
      primary: options.primary,
      bg: options.bg,
      muted: options.muted,
    });
  };
  paintNodes();

  const setHoverEdge = (edgeId: string | null) => {
    if (edgeId === hoverEdgeId) return;
    hoverEdgeId = edgeId;
    updateHoverEdgeVisual({
      graph: options.graph,
      hoverGeometry: options.edgeVisuals.hoverGeometry,
      hoverMaterial: options.edgeVisuals.hoverMaterial,
      edgeId,
      edgeOpacityScale: options.edgeOpacityScale,
    });
  };

  const setPointerFromClient = (clientX: number, clientY: number) => {
    const rect = options.canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pickNodeAtClient = (clientX: number, clientY: number, pointerType: string): NetgraphNode | null => {
    setPointerFromClient(clientX, clientY);
    raycaster.setFromCamera(pointer, options.camera);
    const hits = raycaster.intersectObjects(options.roleMeshes.map((item) => item.mesh), false);
    for (const hit of hits) {
      if (typeof hit.instanceId !== "number") continue;
      const indices = hit.object.userData.nodeIndices as number[] | undefined;
      const nodeIndex = indices?.[hit.instanceId];
      const node = typeof nodeIndex === "number" ? options.graph.nodes[nodeIndex] ?? null : null;
      if (node && options.pickableNodeIds.has(node.id)) return node;
    }
    const rect = options.canvas.getBoundingClientRect();
    return nearestProjectedNode(options.graph, options.camera, rect, clientX, clientY, pointerType === "touch" ? 30 : 15, options.pickableNodeIds);
  };

  const pickNode = (event: PointerEvent): NetgraphNode | null => {
    return pickNodeAtClient(event.clientX, event.clientY, event.pointerType);
  };

  const pickRouteAtClient = (clientX: number, clientY: number): { edgeId: string; routeId: number } | null => {
    const rect = options.canvas.getBoundingClientRect();
    const edgeId = nearestEdgeId(options.graph, options.camera, rect, clientX, clientY, options.pickableEdgeIds);
    const routeId = edgeId ? routeIdForEdge(options.graph, edgeId) : null;
    return edgeId && routeId != null ? { edgeId, routeId } : null;
  };

  const selectAtClientPoint = (clientX: number, clientY: number, pointerType: string): boolean => {
    const node = pickNodeAtClient(clientX, clientY, pointerType);
    if (node) {
      options.focusNode(node);
      options.onSelectNode(node.id);
      return true;
    }
    const route = pickRouteAtClient(clientX, clientY);
    if (route) {
      const focus = edgeFocusPoint(options.graph, route.edgeId);
      if (focus) {
        options.focusPoint(
          focus,
          Math.max(12, Math.min(options.radius * 0.52, 28)),
          true,
          options.focusDirectionForPoint(focus),
        );
      }
      options.onSelectRoute(route.routeId);
      return true;
    }
    return false;
  };

  const selectAtPointer = (event: PointerEvent): boolean => {
    return selectAtClientPoint(event.clientX, event.clientY, event.pointerType);
  };

  return {
    onCanvasClick: (event: MouseEvent) => {
      if (!options.flightControls.isLocked) return;
      event.preventDefault();
      const rect = options.canvas.getBoundingClientRect();
      selectAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, "mouse");
    },
    onPointerCancel: (event: PointerEvent) => {
      pointerStart = null;
      options.canvas.releasePointerCapture?.(event.pointerId);
      options.canvas.style.cursor = "grab";
    },
    onPointerDown: (event: PointerEvent) => {
      if (options.flightControls.isLocked) return;
      pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
      options.canvas.setPointerCapture?.(event.pointerId);
      options.canvas.style.cursor = "grabbing";
    },
    onPointerLeave: () => {
      hoverNodeId = null;
      pointerStart = null;
      setHoverEdge(null);
      paintNodes();
      options.canvas.style.cursor = "grab";
      options.setHovered(null);
    },
    onPointerMove: (event: PointerEvent) => {
      if (options.flightControls.isLocked) return;
      if (event.pointerType === "touch" || pointerStart) return;
      const node = pickNode(event);
      const nextId = node?.id ?? null;
      if (nextId !== hoverNodeId) {
        hoverNodeId = nextId;
        paintNodes();
      }
      const hostRect = options.host.getBoundingClientRect();
      if (!node) {
        const edgeId = nearestEdgeId(options.graph, options.camera, options.canvas.getBoundingClientRect(), event.clientX, event.clientY, options.pickableEdgeIds);
        setHoverEdge(edgeId);
        const edge = edgeId ? options.graph.edgeById.get(edgeId) : null;
        if (!edge) {
          options.canvas.style.cursor = "grab";
          options.setHovered(null);
          return;
        }
        const from = options.graph.nodeById.get(edge.fromId)?.label ?? edge.fromId.slice(0, 8);
        const to = options.graph.nodeById.get(edge.toId)?.label ?? edge.toId.slice(0, 8);
        options.canvas.style.cursor = "pointer";
        options.setHovered({
          kind: "route",
          label: `${from} -> ${to}`,
          detail: `${edge.routeCount.toLocaleString()} routes / ${edge.observationCount.toLocaleString()} obs`,
          x: event.clientX - hostRect.left,
          y: event.clientY - hostRect.top,
        });
        return;
      }
      setHoverEdge(null);
      options.canvas.style.cursor = "pointer";
      options.setHovered({
        kind: "node",
        label: node.label,
        detail: `${node.role} / ${node.routeCount.toLocaleString()} routes / ${node.observationCount.toLocaleString()} obs`,
        x: event.clientX - hostRect.left,
        y: event.clientY - hostRect.top,
      });
    },
    onPointerUp: (event: PointerEvent) => {
      if (options.flightControls.isLocked) return;
      const start = pointerStart;
      pointerStart = null;
      options.canvas.style.cursor = hoverNodeId || hoverEdgeId ? "pointer" : "grab";
      if (!start || start.id !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      const elapsed = performance.now() - start.time;
      options.canvas.releasePointerCapture?.(event.pointerId);
      if (moved > (event.pointerType === "touch" ? 12 : 7) || elapsed > 650) return;
      const now = performance.now();
      const doubleTap = lastTap && now - lastTap.time < 360 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < (event.pointerType === "touch" ? 36 : 20);
      lastTap = { id: event.pointerId, x: event.clientX, y: event.clientY, time: now };
      const selected = selectAtPointer(event);
      if (!selected) options.setHovered(null);
      if (doubleTap) {
        const node = pickNode(event);
        if (node) options.focusNode(node);
        else if (options.selectedRouteId != null) options.flyRoute(options.selectedRouteId);
        else options.frameCamera(true);
      }
    },
  };
}
