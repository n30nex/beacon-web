import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

export function registerNetgraphCanvasEvents(options: {
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  documentTarget: Document;
  flightControls: PointerLockControls;
  onCanvasClick: (event: MouseEvent) => void;
  onControlsStart: () => void;
  onFlightLock: () => void;
  onFlightUnlock: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerLeave: () => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}): () => void {
  options.controls.addEventListener("start", options.onControlsStart);
  options.flightControls.addEventListener("lock", options.onFlightLock);
  options.flightControls.addEventListener("unlock", options.onFlightUnlock);
  options.documentTarget.addEventListener("keydown", options.onKeyDown);
  options.documentTarget.addEventListener("keyup", options.onKeyUp);

  options.canvas.style.cursor = "grab";
  options.canvas.addEventListener("pointermove", options.onPointerMove);
  options.canvas.addEventListener("pointerleave", options.onPointerLeave);
  options.canvas.addEventListener("pointerdown", options.onPointerDown);
  options.canvas.addEventListener("pointerup", options.onPointerUp);
  options.canvas.addEventListener("pointercancel", options.onPointerCancel);
  options.canvas.addEventListener("click", options.onCanvasClick);

  return () => {
    options.controls.removeEventListener("start", options.onControlsStart);
    options.flightControls.removeEventListener("lock", options.onFlightLock);
    options.flightControls.removeEventListener("unlock", options.onFlightUnlock);
    options.documentTarget.removeEventListener("keydown", options.onKeyDown);
    options.documentTarget.removeEventListener("keyup", options.onKeyUp);
    options.canvas.removeEventListener("pointermove", options.onPointerMove);
    options.canvas.removeEventListener("pointerleave", options.onPointerLeave);
    options.canvas.removeEventListener("pointerdown", options.onPointerDown);
    options.canvas.removeEventListener("pointerup", options.onPointerUp);
    options.canvas.removeEventListener("pointercancel", options.onPointerCancel);
    options.canvas.removeEventListener("click", options.onCanvasClick);
  };
}
