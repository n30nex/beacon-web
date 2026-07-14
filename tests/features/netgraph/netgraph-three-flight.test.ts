import { describe, expect, it, vi } from "vitest";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { createFlightKeys, createNetgraphFlightCommandHandlers } from "../../../src/features/netgraph/netgraph-three-flight";

function harness(requestPointerLock: () => Promise<void>) {
  const canvas = document.createElement("canvas");
  canvas.requestPointerLock = vi.fn(requestPointerLock);
  const controls = { enabled: true } as OrbitControls;
  const flightControls = { isLocked: false, unlock: vi.fn() } as unknown as PointerLockControls;
  const setControlMode = vi.fn();
  const onFlightError = vi.fn();
  const handlers = createNetgraphFlightCommandHandlers({
    canvas,
    controls,
    flightControls,
    flightKeys: createFlightKeys(),
    markUserInteracted: vi.fn(),
    onCameraTweenCancel: vi.fn(),
    onFlightError,
    setControlMode,
    setHovered: vi.fn(),
    setOrbit: vi.fn(),
    syncOrbitTargetToCamera: vi.fn(),
  });
  return { canvas, controls, handlers, onFlightError, setControlMode };
}

describe("Netgraph free-flight entry", () => {
  it("recovers cleanly when pointer lock rejects", async () => {
    const test = harness(() => Promise.reject(new DOMException("denied", "NotAllowedError")));

    test.handlers.enterFlightMode();
    await Promise.resolve();
    await Promise.resolve();

    expect(test.onFlightError).toHaveBeenCalledWith(expect.stringContaining("Pointer lock"));
    expect(test.controls.enabled).toBe(true);
    expect(test.setControlMode).toHaveBeenCalledWith("orbit");
  });

  it("does not enter flight mode until the lock event succeeds", async () => {
    const test = harness(() => Promise.resolve());

    test.handlers.enterFlightMode();
    await Promise.resolve();
    expect(test.setControlMode).not.toHaveBeenCalledWith("flight");
    expect(test.controls.enabled).toBe(true);

    test.handlers.onFlightLock();
    expect(test.setControlMode).toHaveBeenCalledWith("flight");
    expect(test.controls.enabled).toBe(false);
  });
});
