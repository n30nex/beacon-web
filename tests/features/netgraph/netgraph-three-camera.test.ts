import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createZoomCameraFrame,
  setOverviewCameraBounds,
} from "../../../src/features/netgraph/netgraph-three-camera";

function fakeControls(): OrbitControls {
  return {
    minDistance: 0,
    maxDistance: 0,
    target: new THREE.Vector3(),
  } as OrbitControls;
}

describe("netgraph camera bounds", () => {
  it("allows focus views to zoom closer than overview views", () => {
    const overviewCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
    const focusCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
    const overviewControls = fakeControls();
    const focusControls = fakeControls();
    const frame = {
      position: new THREE.Vector3(0, 0, 180),
      target: new THREE.Vector3(0, 0, 0),
      maxDistance: 620,
    };

    setOverviewCameraBounds({ camera: overviewCamera, controls: overviewControls }, frame, 180, 0.92, false, false);
    setOverviewCameraBounds({ camera: focusCamera, controls: focusControls }, frame, 180, 0.92, false, true);

    expect(focusControls.minDistance).toBeLessThan(overviewControls.minDistance);
    expect(focusControls.minDistance).toBeLessThan(8);
    expect(focusCamera.near).toBeLessThan(overviewCamera.near);
  });

  it("clamps zoom frames to the configured close inspection floor", () => {
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
    const controls = fakeControls();
    controls.minDistance = 4;
    controls.maxDistance = 200;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0, 12);

    const frame = createZoomCameraFrame({ camera, controls }, 0.1);

    expect(frame.position.distanceTo(frame.target)).toBe(4);
  });
});
