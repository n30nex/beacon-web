import { useCallback, useRef, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { clamp } from "./netgraph-three-geometry";
import type { NetgraphControlMode } from "./NetgraphCanvasHud";

export interface NetgraphTouchFlightState {
  moveX: number;
  moveY: number;
  lookDX: number;
  lookDY: number;
  movePointerId: number;
  lookPointerId: number;
  lookX: number;
  lookY: number;
}

const INITIAL_TOUCH_FLIGHT_STATE: NetgraphTouchFlightState = {
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
  movePointerId: -1,
  lookPointerId: -1,
  lookX: 0,
  lookY: 0,
};

export function useNetgraphTouchFlightControls(setControlMode: Dispatch<SetStateAction<NetgraphControlMode>>) {
  const touchFlightRef = useRef<NetgraphTouchFlightState>({ ...INITIAL_TOUCH_FLIGHT_STATE });

  const finishTouchFlightIfIdle = useCallback(() => {
    const state = touchFlightRef.current;
    if (state.movePointerId < 0 && state.lookPointerId < 0) setControlMode("orbit");
  }, [setControlMode]);

  const handleMovePadPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const state = touchFlightRef.current;
    state.movePointerId = event.pointerId;
    setControlMode("touch-flight");
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    state.moveX = clamp((event.clientX - (rect.left + rect.width / 2)) / radius, -1, 1);
    state.moveY = clamp((event.clientY - (rect.top + rect.height / 2)) / radius, -1, 1);
  }, [setControlMode]);

  const handleMovePadPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = touchFlightRef.current;
    if (state.movePointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    state.moveX = clamp((event.clientX - (rect.left + rect.width / 2)) / radius, -1, 1);
    state.moveY = clamp((event.clientY - (rect.top + rect.height / 2)) / radius, -1, 1);
  }, []);

  const handleMovePadPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = touchFlightRef.current;
    if (state.movePointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    state.movePointerId = -1;
    state.moveX = 0;
    state.moveY = 0;
    finishTouchFlightIfIdle();
  }, [finishTouchFlightIfIdle]);

  const handleLookPadPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const state = touchFlightRef.current;
    state.lookPointerId = event.pointerId;
    state.lookX = event.clientX;
    state.lookY = event.clientY;
    state.lookDX = 0;
    state.lookDY = 0;
    setControlMode("touch-flight");
  }, [setControlMode]);

  const handleLookPadPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = touchFlightRef.current;
    if (state.lookPointerId !== event.pointerId) return;
    event.preventDefault();
    state.lookDX += event.clientX - state.lookX;
    state.lookDY += event.clientY - state.lookY;
    state.lookX = event.clientX;
    state.lookY = event.clientY;
  }, []);

  const handleLookPadPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = touchFlightRef.current;
    if (state.lookPointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    state.lookPointerId = -1;
    state.lookDX = 0;
    state.lookDY = 0;
    finishTouchFlightIfIdle();
  }, [finishTouchFlightIfIdle]);

  return {
    handleLookPadPointerDown,
    handleLookPadPointerEnd,
    handleLookPadPointerMove,
    handleMovePadPointerDown,
    handleMovePadPointerEnd,
    handleMovePadPointerMove,
    touchFlightRef,
  };
}
