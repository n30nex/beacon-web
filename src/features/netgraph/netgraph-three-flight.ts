import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import type { NetgraphHoverState } from "./NetgraphCanvasHud";
import { clamp } from "./netgraph-three-geometry";
import type { NetgraphTouchFlightState } from "./useNetgraphTouchFlightControls";

export interface NetgraphFlightKeys {
  backward: boolean;
  down: boolean;
  fast: boolean;
  forward: boolean;
  left: boolean;
  right: boolean;
  slow: boolean;
  up: boolean;
}

export function createFlightKeys(): NetgraphFlightKeys {
  return {
    backward: false,
    down: false,
    fast: false,
    forward: false,
    left: false,
    right: false,
    slow: false,
    up: false,
  };
}

export function resetFlightKeys(keys: NetgraphFlightKeys) {
  keys.backward = false;
  keys.down = false;
  keys.fast = false;
  keys.forward = false;
  keys.left = false;
  keys.right = false;
  keys.slow = false;
  keys.up = false;
}

export function setFlightKeyFromKeyboardEvent(keys: NetgraphFlightKeys, event: KeyboardEvent, pressed: boolean): boolean {
  switch (event.code) {
    case "KeyW":
    case "ArrowUp":
      keys.forward = pressed;
      return true;
    case "KeyS":
    case "ArrowDown":
      keys.backward = pressed;
      return true;
    case "KeyA":
    case "ArrowLeft":
      keys.left = pressed;
      return true;
    case "KeyD":
    case "ArrowRight":
      keys.right = pressed;
      return true;
    case "KeyQ":
      keys.down = pressed;
      return true;
    case "KeyE":
    case "Space":
      keys.up = pressed;
      return true;
    case "ShiftLeft":
    case "ShiftRight":
      keys.fast = pressed;
      return true;
    case "ControlLeft":
    case "ControlRight":
      keys.slow = pressed;
      return true;
    default:
      return false;
  }
}

export interface NetgraphFlightCommandHandlers {
  enterFlightMode: () => void;
  exitFlightMode: () => void;
  onFlightLock: () => void;
  onFlightUnlock: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

export function createNetgraphFlightCommandHandlers(options: {
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  flightControls: PointerLockControls;
  flightKeys: NetgraphFlightKeys;
  markUserInteracted: () => void;
  onCameraTweenCancel: () => void;
  onFlightError: (message: string) => void;
  setControlMode: (mode: "orbit" | "flight") => void;
  setHovered: (hovered: NetgraphHoverState | null) => void;
  setOrbit: (active: boolean) => void;
  syncOrbitTargetToCamera: () => void;
}): NetgraphFlightCommandHandlers {
  const enterFlightMode = () => {
    if (options.flightControls.isLocked) return;
    const fail = () => {
      options.controls.enabled = true;
      options.setControlMode("orbit");
      options.onFlightError("Pointer lock was unavailable or declined by the browser.");
    };
    try {
      const request = options.canvas.requestPointerLock();
      if (request && typeof request.catch === "function") void request.catch(fail);
    } catch {
      fail();
    }
  };

  const exitFlightMode = () => {
    if (!options.flightControls.isLocked) {
      options.setControlMode("orbit");
      options.controls.enabled = true;
      options.syncOrbitTargetToCamera();
      return;
    }
    try {
      options.flightControls.unlock();
    } catch {
      options.controls.enabled = true;
      options.setControlMode("orbit");
      options.syncOrbitTargetToCamera();
    }
  };

  const onFlightLock = () => {
    options.onCameraTweenCancel();
    options.controls.enabled = false;
    options.setOrbit(false);
    options.markUserInteracted();
    options.setControlMode("flight");
    options.canvas.style.cursor = "crosshair";
    options.setHovered(null);
  };

  const onFlightUnlock = () => {
    resetFlightKeys(options.flightKeys);
    options.controls.enabled = true;
    options.syncOrbitTargetToCamera();
    options.canvas.style.cursor = "grab";
    options.setControlMode("orbit");
  };

  const setFlightKey = (event: KeyboardEvent, pressed: boolean) => {
    const handled = setFlightKeyFromKeyboardEvent(options.flightKeys, event, pressed);
    if (handled && options.flightControls.isLocked) {
      event.preventDefault();
      options.markUserInteracted();
    }
  };

  return {
    enterFlightMode,
    exitFlightMode,
    onFlightLock,
    onFlightUnlock,
    onKeyDown: (event: KeyboardEvent) => setFlightKey(event, true),
    onKeyUp: (event: KeyboardEvent) => setFlightKey(event, false),
  };
}

interface DesktopFlightOptions {
  camera: THREE.PerspectiveCamera;
  clampCameraDistance: () => void;
  deltaSeconds: number;
  flightControls: PointerLockControls;
  flightKeys: NetgraphFlightKeys;
  markUserInteracted: () => void;
  narrowViewport: boolean;
  radius: number;
}

export function applyDesktopFlightControls({
  camera,
  clampCameraDistance,
  deltaSeconds,
  flightControls,
  flightKeys,
  markUserInteracted,
  narrowViewport,
  radius,
}: DesktopFlightOptions) {
  const speedScale = flightKeys.fast ? 2.45 : flightKeys.slow ? 0.28 : 1;
  const baseRadius = clamp(radius, narrowViewport ? 34 : 42, narrowViewport ? 180 : 260);
  const distance = baseRadius * (narrowViewport ? 0.9 : 1.06) * speedScale * deltaSeconds;
  let moved = false;
  if (flightKeys.forward) {
    flightControls.moveForward(distance);
    moved = true;
  }
  if (flightKeys.backward) {
    flightControls.moveForward(-distance);
    moved = true;
  }
  if (flightKeys.left) {
    flightControls.moveRight(-distance);
    moved = true;
  }
  if (flightKeys.right) {
    flightControls.moveRight(distance);
    moved = true;
  }
  if (flightKeys.up || flightKeys.down) {
    camera.position.y += (Number(flightKeys.up) - Number(flightKeys.down)) * distance;
    moved = true;
  }
  if (moved) {
    markUserInteracted();
    clampCameraDistance();
  }
}

interface TouchFlightOptions {
  camera: THREE.PerspectiveCamera;
  clampCameraDistance: () => void;
  deltaSeconds: number;
  markUserInteracted: () => void;
  onActive: () => void;
  radius: number;
  state: NetgraphTouchFlightState;
  syncOrbitTargetToCamera: () => void;
  viewDirection: THREE.Vector3;
  viewRight: THREE.Vector3;
  viewUp: THREE.Vector3;
}

export function applyTouchFlightControls({
  camera,
  clampCameraDistance,
  deltaSeconds,
  markUserInteracted,
  onActive,
  radius,
  state,
  syncOrbitTargetToCamera,
  viewDirection,
  viewRight,
  viewUp,
}: TouchFlightOptions): boolean {
  const active = state.movePointerId >= 0 || state.lookPointerId >= 0;
  if (!active) return false;
  onActive();
  if (Math.abs(state.lookDX) > 0.01 || Math.abs(state.lookDY) > 0.01) {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    euler.y -= state.lookDX * 0.0034;
    euler.x = clamp(euler.x - state.lookDY * 0.0034, -Math.PI / 2 + 0.08, Math.PI / 2 - 0.08);
    camera.quaternion.setFromEuler(euler);
    state.lookDX = 0;
    state.lookDY = 0;
    markUserInteracted();
  }
  const moveMagnitude = Math.min(1, Math.hypot(state.moveX, state.moveY));
  if (moveMagnitude > 0.04) {
    camera.getWorldDirection(viewDirection).normalize();
    viewRight.crossVectors(viewDirection, viewUp).normalize();
    const speed = radius * (0.72 + moveMagnitude * 0.58) * deltaSeconds;
    camera.position.addScaledVector(viewDirection, -state.moveY * speed);
    camera.position.addScaledVector(viewRight, state.moveX * speed);
    clampCameraDistance();
    markUserInteracted();
  }
  syncOrbitTargetToCamera();
  return true;
}
