import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { NetgraphNode } from "./netgraph-model";
import { clamp, easeInOutCubic, nodePosition } from "./netgraph-three-geometry";

export interface CameraTween {
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  startedAt: number;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  durationMs: number;
}

export interface NetgraphCameraFrame {
  maxDistance?: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface CameraControlsOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function createObliqueCameraDirection() {
  return new THREE.Vector3(0.52, -0.38, 0.76).normalize();
}

export function currentCameraDirection({ camera, controls }: CameraControlsOptions, fallbackDirection: THREE.Vector3) {
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.001) return fallbackDirection.clone();
  return direction.normalize();
}

interface FocusDirectionOptions extends CameraControlsOptions {
  center: THREE.Vector3;
  fallbackDirection: THREE.Vector3;
  radius: number;
}

export function focusDirectionForNode(options: FocusDirectionOptions & { node: NetgraphNode }) {
  const nodeVector = nodePosition(options.node).sub(options.center);
  if (nodeVector.lengthSq() < 0.001) return options.fallbackDirection.clone();
  const lateral = new THREE.Vector3(
    nodeVector.x * 0.58,
    nodeVector.y * 0.34,
    Math.max(options.radius * 0.42, Math.abs(nodeVector.z) + options.radius * 0.5),
  );
  if (lateral.lengthSq() < 0.001) return options.fallbackDirection.clone();
  return currentCameraDirection(options, options.fallbackDirection).lerp(lateral.normalize(), 0.72).normalize();
}

export function focusDirectionForPoint(options: FocusDirectionOptions & { target: THREE.Vector3 }) {
  const lateral = options.target.clone().sub(options.center);
  if (lateral.lengthSq() < 0.001) return options.fallbackDirection.clone();
  lateral.z = Math.max(options.radius * 0.36, Math.abs(lateral.z) + options.radius * 0.28);
  return currentCameraDirection(options, options.fallbackDirection).lerp(lateral.normalize(), 0.52).normalize();
}

interface OverviewFrameOptions {
  aspect: number;
  cameraDistanceScale: number;
  center: THREE.Vector3;
  narrowViewport: boolean;
  obliqueDirection: THREE.Vector3;
  radius: number;
}

export function createOverviewCameraFrame({
  aspect: rawAspect,
  cameraDistanceScale,
  center,
  narrowViewport,
  obliqueDirection,
  radius,
}: OverviewFrameOptions): Required<NetgraphCameraFrame> {
  const aspect = Math.max(0.45, Math.min(2.5, rawAspect || 1));
  const narrowBoost = aspect < 0.82 ? 0.82 / aspect : 1;
  const distance = radius * (narrowViewport ? 1.34 : 1.5) * narrowBoost * (0.84 + cameraDistanceScale * 0.54);
  const target = center.clone();
  const position = target.clone().add(obliqueDirection.clone().multiplyScalar(distance));
  if (aspect < 0.82) position.y = center.y - radius * 0.1;
  return {
    position,
    target,
    maxDistance: radius * 4.1 * narrowBoost * (0.84 + cameraDistanceScale * 0.55),
  };
}

export function createGuidedIntroCameraFrame({
  narrowViewport,
  obliqueDirection,
  overviewFrame,
  radius,
}: {
  narrowViewport: boolean;
  obliqueDirection: THREE.Vector3;
  overviewFrame: NetgraphCameraFrame;
  radius: number;
}): NetgraphCameraFrame {
  const introDistance = overviewFrame.position.distanceTo(overviewFrame.target) * (narrowViewport ? 1.72 : 2.18);
  const target = overviewFrame.target.clone().add(new THREE.Vector3(0, radius * (narrowViewport ? 0.06 : 0.1), -radius * 0.1));
  const position = target.clone()
    .add(obliqueDirection.clone().multiplyScalar(introDistance))
    .add(new THREE.Vector3(-radius * 0.34, radius * 0.18, radius * 0.28));
  return { position, target };
}

export function applyCameraFrame({ camera, controls }: CameraControlsOptions, frame: NetgraphCameraFrame) {
  camera.position.copy(frame.position);
  controls.target.copy(frame.target);
  camera.updateProjectionMatrix();
  controls.update();
}

export function createCameraTween(
  { camera, controls }: CameraControlsOptions,
  toPosition: THREE.Vector3,
  toTarget: THREE.Vector3,
  durationMs = 520,
): CameraTween {
  return {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    startedAt: performance.now(),
    toPosition,
    toTarget,
    durationMs,
  };
}

export function createFocusPointFrame(
  controls: OrbitControls,
  target: THREE.Vector3,
  distance: number,
  direction: THREE.Vector3,
): NetgraphCameraFrame {
  const clampedDistance = clamp(distance, controls.minDistance, controls.maxDistance);
  return {
    position: target.clone().add(direction.clone().normalize().multiplyScalar(clampedDistance)),
    target,
  };
}

export function focusLayoutSpan(nodeIds: Set<string>, nodeById: Map<string, NetgraphNode>) {
  if (nodeIds.size <= 1) return 0;
  const bounds = new THREE.Box3();
  const tempCenter = new THREE.Vector3();
  for (const nodeId of nodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    bounds.expandByPoint(nodePosition(node));
  }
  if (bounds.isEmpty()) return 0;
  const size = bounds.getSize(tempCenter);
  return Math.max(size.x, size.y, Math.abs(size.z) * 1.08);
}

export function setOverviewCameraBounds(
  { camera, controls }: CameraControlsOptions,
  overviewFrame: Required<NetgraphCameraFrame>,
  radius: number,
  cameraDistanceScale: number,
  narrowViewport: boolean,
  closeInspection = false,
) {
  camera.near = closeInspection ? Math.max(0.04, radius / 1400) : Math.max(0.08, radius / 850);
  camera.far = radius * 7 * Math.max(1, overviewFrame.maxDistance / Math.max(radius * 4.1, 1));
  const distanceFloor = closeInspection ? 2.8 : 5.2;
  const radiusScale = closeInspection ? (narrowViewport ? 0.045 : 0.034) : (narrowViewport ? 0.08 : 0.095);
  controls.minDistance = Math.max(distanceFloor / Math.max(0.85, cameraDistanceScale), radius * radiusScale);
  controls.maxDistance = overviewFrame.maxDistance;
  camera.updateProjectionMatrix();
}

export function syncOrbitTargetToCamera({
  camera,
  controls,
  radius,
  viewDirection,
}: CameraControlsOptions & {
  radius: number;
  viewDirection: THREE.Vector3;
}) {
  camera.getWorldDirection(viewDirection);
  const distance = Math.max(controls.minDistance, Math.min(controls.maxDistance * 0.32, radius * 0.7));
  controls.target.copy(camera.position).add(viewDirection.multiplyScalar(distance));
  controls.update();
}

export function createZoomCameraFrame({ camera, controls }: CameraControlsOptions, factor: number): NetgraphCameraFrame {
  const offset = camera.position.clone().sub(controls.target);
  const distance = clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  return {
    position: controls.target.clone().add(offset.normalize().multiplyScalar(distance)),
    target: controls.target.clone(),
  };
}

export function advanceCameraTween(
  { camera, controls }: CameraControlsOptions,
  tween: CameraTween,
  now = performance.now(),
): CameraTween | null {
  const progress = clamp((now - tween.startedAt) / tween.durationMs, 0, 1);
  const eased = easeInOutCubic(progress);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  camera.updateProjectionMatrix();
  return progress >= 1 ? null : tween;
}
