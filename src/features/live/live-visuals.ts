import type { LivePacketEvent, LiveRoutePathPoint } from "./live-model";

export interface Coord {
  lng: number;
  lat: number;
}

export interface LiveAnimation {
  id: string;
  event: LivePacketEvent;
  from: Coord;
  to: Coord;
  path: LivePathPoint[];
  startedAt: number;
  durationMs: number;
  color: string;
  waveIndex: number;
  waveCount: number;
  bytes: string[];
}

export interface LiveTrail {
  id: string;
  from: Coord;
  to: Coord;
  path: LivePathPoint[];
  createdAt: number;
  lifetimeMs: number;
  color: string;
}

export type LivePathPoint = LiveRoutePathPoint;

export interface LivePulse {
  id: string;
  coord: Coord;
  headingTo?: Coord;
  createdAt: number;
  lifetimeMs: number;
  color: string;
  strength: number;
  role?: "origin" | "relay" | "destination" | "activity";
  label?: string;
}

export interface LiveRainDrop {
  id: string;
  bytes: string[];
  xRatio: number;
  createdAt: number;
  durationMs: number;
  maxYRatio: number;
  color: string;
}

export interface LiveHeatPoint {
  id: string;
  coord: Coord;
  createdAt: number;
  lifetimeMs: number;
  intensity: number;
}

export interface PropagationGroup {
  events: LivePacketEvent[];
  timer: ReturnType<typeof setTimeout>;
}

export interface LiveAnimationRequest {
  event: LivePacketEvent;
  waveIndex: number;
  waveCount: number;
}

export const MAX_PENDING_ANIMATIONS = 48;
export const MAX_PROPAGATION_WAVE_PATHS = 6;
export const MAX_HOPS_PER_PACKET = 6;
export const MAX_ACTIVE_ANIMATIONS = 8;
export const MAX_HEAT_POINTS = 52;
export const MAX_TRAILS = 18;
export const MAX_PULSES = 20;
export const MAX_RAIN_DROPS = 4;
export const COMPACT_LIVE_WIDTH = 640;
export const COMPACT_ACTIVE_ANIMATIONS = 7;
export const COMPACT_HEAT_POINTS = 42;
export const COMPACT_TRAILS = 16;
export const COMPACT_PULSES = 18;
export const COMPACT_RAIN_DROPS = 3;
export const MAX_RAIN_BYTES = 14;
export const MAX_MATRIX_FLIGHT_BYTES = 8;
export const LIVE_VISUAL_COALESCE_MS = 750;
export const LIVE_PROPAGATION_GROUP_HARD_CAP = 12;
export const VISUAL_DRAIN_INTERVAL_MS = 115;
export const LIVE_RESIDUE_FRAME_INTERVAL_MS = 240;
export const LIVE_PERF_SAMPLE_LIMIT = 180;
export const LIVE_PERF_IDLE_GAP_MS = 250;
export const LIVE_FRAME_TARGET_MS = 1000 / 60;
export const LIVE_FRAME_TOLERANCE_MS = 3;
export const LIVE_DRAW_PRESSURE_MS = 5.5;
export const LIVE_DRAW_RECOVERY_MS = 2.4;
export const LIVE_DRAW_PRESSURE_WARMUP_FRAMES = 18;
export const LIVE_DRAW_PRESSURE_SLOW_FRAMES = 5;
export const LIVE_DRAW_PRESSURE_RECOVERY_FRAMES = 180;
export const LIVE_STATE_FLUSH_MS = 250;
export const LIVE_INITIAL_SEED_LIMIT = 72;
export const LIVE_VIEWPORT_PADDING_PX = 96;
export const LIVE_NODE_ACTIVITY_MS = 5_800;
export const LIVE_NODE_ACTIVITY_THROTTLE_MS = 700;
export const LIVE_PACKET_FLIGHT_BASE_MS = 2_550;
export const LIVE_PACKET_FLIGHT_HOP_MS = 380;
export const LIVE_PACKET_FLIGHT_EXTRA_MAX_MS = 1_450;

export type LiveVisualQuality = "high" | "balanced" | "constrained";

export interface LivePerfSnapshot {
  activeAnimations: number;
  avgFrameMs: number;
  canvasHeight: number;
  canvasWidth: number;
  drawCount: number;
  drawPressure: number;
  heatPoints: number;
  lastDrawMs: number;
  lastFrameMs: number;
  p95FrameMs: number;
  pulses: number;
  quality: LiveVisualQuality;
  rainDrops: number;
  targetFrameMs: number;
  timestamp: number;
  trails: number;
}

export interface LiveVisualCaps {
  activeAnimations: number;
  dprLimit: number;
  heatPoints: number;
  labels: boolean;
  pulses: number;
  pulseRings: number;
  quality: LiveVisualQuality;
  rainDrops: number;
  shadows: boolean;
  sparkCount: number;
  targetFrameMs: number;
  trails: number;
}

export function liveVisualCaps(width?: number, pressure = 0): LiveVisualCaps {
  const resolvedWidth = typeof width === "number" ? width : typeof window === "undefined" ? COMPACT_LIVE_WIDTH : window.innerWidth;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const memory = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  const constrainedDevice = reducedMotion || (typeof memory === "number" && memory <= 4) || (typeof cores === "number" && cores <= 4);
  const compact = resolvedWidth < COMPACT_LIVE_WIDTH;
  const quality: LiveVisualQuality = pressure >= 2 || (compact && constrainedDevice) ? "constrained" : pressure >= 1 || compact || constrainedDevice ? "balanced" : "high";

  if (quality === "constrained") {
    return {
      activeAnimations: Math.min(COMPACT_ACTIVE_ANIMATIONS, 5),
      dprLimit: 1,
      heatPoints: Math.min(COMPACT_HEAT_POINTS, 20),
      labels: false,
      pulses: Math.min(COMPACT_PULSES, 8),
      pulseRings: 1,
      quality,
      rainDrops: COMPACT_RAIN_DROPS,
      shadows: false,
      sparkCount: 0,
      targetFrameMs: 1000 / 30,
      trails: Math.min(COMPACT_TRAILS, 5),
    };
  }

  if (quality === "balanced") {
    return {
      activeAnimations: compact ? COMPACT_ACTIVE_ANIMATIONS : 6,
      dprLimit: 1,
      heatPoints: compact ? COMPACT_HEAT_POINTS : 28,
      labels: false,
      pulses: compact ? COMPACT_PULSES : 10,
      pulseRings: 1,
      quality,
      rainDrops: compact ? COMPACT_RAIN_DROPS : 3,
      shadows: false,
      sparkCount: 0,
      targetFrameMs: compact ? 1000 / 45 : LIVE_FRAME_TARGET_MS,
      trails: compact ? COMPACT_TRAILS : 8,
    };
  }

  return {
    activeAnimations: Math.min(MAX_ACTIVE_ANIMATIONS, 7),
    dprLimit: 1,
    heatPoints: Math.min(MAX_HEAT_POINTS, 40),
    labels: true,
    pulses: Math.min(MAX_PULSES, 14),
    pulseRings: 1,
    quality,
    rainDrops: MAX_RAIN_DROPS,
    shadows: false,
    sparkCount: 0,
    targetFrameMs: LIVE_FRAME_TARGET_MS,
    trails: Math.min(MAX_TRAILS, 14),
  };
}
