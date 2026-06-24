import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import type { NetgraphQualityMode } from "./netgraph-model";
import { advanceCameraTween, type CameraTween } from "./netgraph-three-camera";

export interface NetgraphFrameTimingState {
  framePressure: number;
  lastRenderAt: number;
  runtimeEffectScale: number;
}

export function createNetgraphFrameTimingState(): NetgraphFrameTimingState {
  return { framePressure: 0, lastRenderAt: 0, runtimeEffectScale: 1 };
}

export function resolveNetgraphFrameTick(options: {
  animationsDisabled: boolean;
  qualityMode: NetgraphQualityMode;
  state: NetgraphFrameTimingState;
  targetFrameMs: number;
  time: number;
}): { deltaSeconds: number; state: NetgraphFrameTimingState } | null {
  const elapsedSinceRender = options.time - options.state.lastRenderAt;
  if (options.targetFrameMs > 0 && options.state.lastRenderAt > 0 && elapsedSinceRender < options.targetFrameMs) return null;
  const hadPreviousRender = options.state.lastRenderAt > 0;
  const deltaSeconds = options.state.lastRenderAt > 0 ? Math.min(0.08, Math.max(0.001, elapsedSinceRender / 1000)) : 1 / 60;
  let framePressure = options.state.framePressure;
  let runtimeEffectScale = options.state.runtimeEffectScale;
  if (options.qualityMode === "auto" && !options.animationsDisabled && hadPreviousRender) {
    if (elapsedSinceRender > 42) framePressure = Math.min(80, framePressure + 1);
    else framePressure = Math.max(0, framePressure - 2);
    runtimeEffectScale = framePressure > 24 ? 0.52 : framePressure > 12 ? 0.72 : 1;
  }
  return {
    deltaSeconds,
    state: {
      framePressure,
      lastRenderAt: options.time,
      runtimeEffectScale,
    },
  };
}

interface NetgraphCameraControls {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function advanceNetgraphCameraControlFrame(options: {
  animationsDisabled: boolean;
  applyDesktopFlight: (deltaSeconds: number) => void;
  applyTouchFlight: (deltaSeconds: number, onActive: () => void) => boolean;
  cameraControls: NetgraphCameraControls;
  cameraTween: CameraTween | null;
  flightControls: PointerLockControls;
  frameTiming: NetgraphFrameTimingState;
  liveFocusActive: boolean;
  narrowViewport: boolean;
  nodeFocusActive: boolean;
  orbitAutoRotateScale: number;
  orbitControlScale: number;
  qualityMode: NetgraphQualityMode;
  routeFocusActive: boolean;
  selectedSunGroup: THREE.Group;
  targetFrameMs: number;
  time: number;
  updateCameraFrustum: () => void;
}): { cameraTween: CameraTween | null; frameTiming: NetgraphFrameTimingState } | null {
  const frameTick = resolveNetgraphFrameTick({
    animationsDisabled: options.animationsDisabled,
    qualityMode: options.qualityMode,
    state: options.frameTiming,
    targetFrameMs: options.targetFrameMs,
    time: options.time,
  });
  if (!frameTick) return null;

  const { controls } = options.cameraControls;
  const { deltaSeconds } = frameTick;
  let cameraTween = options.cameraTween;
  if (cameraTween) {
    cameraTween = advanceCameraTween(options.cameraControls, cameraTween);
  }

  if (options.flightControls.isLocked) {
    options.applyDesktopFlight(deltaSeconds);
  } else if (!options.applyTouchFlight(deltaSeconds, () => {
    controls.enabled = false;
    cameraTween = null;
  })) {
    controls.enabled = true;
  }

  controls.autoRotateSpeed = (
    options.nodeFocusActive
      ? 0.24
      : options.routeFocusActive
        ? 0.18
        : options.liveFocusActive
          ? 0.38
          : options.narrowViewport
            ? 0.24
            : 0.36
  ) * options.orbitAutoRotateScale * options.orbitControlScale;
  if (!options.flightControls.isLocked) controls.update(deltaSeconds);
  options.updateCameraFrustum();

  if (options.selectedSunGroup.children.length > 0) {
    options.selectedSunGroup.rotation.y += deltaSeconds * 0.18;
    options.selectedSunGroup.rotation.z += deltaSeconds * 0.07;
  }

  return {
    cameraTween,
    frameTiming: frameTick.state,
  };
}

export function startNetgraphRenderLoop(options: {
  isDisposed: () => boolean;
  renderFrame: (time: number) => void;
  renderer: THREE.WebGLRenderer;
  targetFrameMs: number;
}): () => void {
  let denseLoopTimer: number | null = null;
  const scheduleDenseLoop = () => {
    if (options.isDisposed()) return;
    denseLoopTimer = window.setTimeout(() => {
      options.renderFrame(performance.now());
      scheduleDenseLoop();
    }, options.targetFrameMs);
  };

  if (options.targetFrameMs > 0) {
    options.renderFrame(performance.now());
    scheduleDenseLoop();
  } else {
    options.renderer.setAnimationLoop(options.renderFrame);
  }

  return () => {
    if (denseLoopTimer != null) window.clearTimeout(denseLoopTimer);
    options.renderer.setAnimationLoop(null);
  };
}
