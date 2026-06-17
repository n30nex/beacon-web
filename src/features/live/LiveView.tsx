import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "../map/useMapLibre";
import { useMapNodes } from "../map/useMapNodes";
import { useMapNodesData } from "../map/useMapNodesData";
import { useVerifiedRouteNeighborhoodOverlay } from "../map/useRouteOverlays";
import { nodesToFeatureCollection, filterByNodeType } from "../map/node-geojson";
import { MapAppearanceControls } from "../map/MapAppearanceControls";
import { MapStyleSwitcher } from "../map/MapStyleSwitcher";
import { SegmentedControl } from "../map/SegmentedControl";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, NODE_TYPE_FILTER_OPTIONS, NODES_SOURCE_ID, resolveMapStyle } from "../map/types";
import {
  mapVisualProfileStyle,
  persistMapAppearanceSettings,
  readMapAppearanceSettings,
  resolveMapVisualProfile,
  type MapAppearanceSettings,
} from "../map/appearance";
import { LoadingPill } from "../../components/LoadingPill";
import { TerminalCursor, TerminalProgress, TerminalSpinner } from "../../components/TerminalLoader";
import { EmptyState } from "../../components/EmptyState";
import { BottomSheet } from "../../components/BottomSheet";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsLaggedHandler, useWsNodeUpdateHandler, useWsPacketHandler } from "../../hooks/useWsHandlers";
import { getIatas, getLiveBackfill, getLiveSummary } from "../../api/client";
import { useCoalescedNodeUpdates } from "../map/useNodeUpdates";
import { formatAbsolute, formatCount, formatHex, timeAgoMs } from "../../lib/formatters";
import { nullableDisplayLabel } from "../../lib/display-label";
import type { WsManager } from "../../api/ws-manager";
import type { IataCode, LiveSummary } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import type { WsLagged, WsPacketObservation } from "../../types/ws";
import {
  LIVE_FEED_CAP,
  buildTrueRoutePath,
  countRecent,
  hashColor,
  hashSeed,
  hexBytes,
  mergeLiveEventsByObservation,
  payloadColor,
  payloadLabel,
  sameRouteCoord,
  toLivePacketEvent,
  topPayloads,
  type LivePacketEvent,
  type LiveRoutePathPoint,
} from "./live-model";

interface LiveViewProps {
  wsManager: WsManager;
  onAnalyze: (hash: string) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  nodePanelOpen?: boolean;
}

interface Coord {
  lng: number;
  lat: number;
}

interface LiveAnimation {
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

interface LiveTrail {
  id: string;
  from: Coord;
  to: Coord;
  path: LivePathPoint[];
  createdAt: number;
  lifetimeMs: number;
  color: string;
}

type LivePathPoint = LiveRoutePathPoint;

interface LivePulse {
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

interface LiveRainDrop {
  id: string;
  bytes: string[];
  xRatio: number;
  createdAt: number;
  durationMs: number;
  maxYRatio: number;
  color: string;
}

interface LiveHeatPoint {
  id: string;
  coord: Coord;
  createdAt: number;
  lifetimeMs: number;
  intensity: number;
}

interface PropagationGroup {
  events: LivePacketEvent[];
  timer: ReturnType<typeof setTimeout>;
}

interface LiveAnimationRequest {
  event: LivePacketEvent;
  waveIndex: number;
  waveCount: number;
}

interface NodeCoord extends Coord {
  id: string;
  name: string | null;
  publicKey: string;
  iatas: string[];
}

const MAX_PENDING_ANIMATIONS = 48;
const MAX_PROPAGATION_WAVE_PATHS = 6;
const MAX_HOPS_PER_PACKET = 6;
const MAX_ACTIVE_ANIMATIONS = 8;
const MAX_HEAT_POINTS = 52;
const MAX_TRAILS = 18;
const MAX_PULSES = 20;
const MAX_RAIN_DROPS = 4;
const COMPACT_LIVE_WIDTH = 640;
const COMPACT_ACTIVE_ANIMATIONS = 7;
const COMPACT_HEAT_POINTS = 42;
const COMPACT_TRAILS = 16;
const COMPACT_PULSES = 18;
const COMPACT_RAIN_DROPS = 3;
const MAX_RAIN_BYTES = 14;
const MAX_MATRIX_FLIGHT_BYTES = 8;
const LIVE_VISUAL_COALESCE_MS = 750;
const LIVE_PROPAGATION_GROUP_HARD_CAP = 12;
const VISUAL_DRAIN_INTERVAL_MS = 115;
const LIVE_RESIDUE_FRAME_INTERVAL_MS = 240;
const LIVE_PERF_SAMPLE_LIMIT = 180;
const LIVE_PERF_IDLE_GAP_MS = 250;
const LIVE_FRAME_TARGET_MS = 1000 / 60;
const LIVE_FRAME_TOLERANCE_MS = 3;
const LIVE_DRAW_PRESSURE_MS = 5.5;
const LIVE_DRAW_RECOVERY_MS = 2.4;
const LIVE_DRAW_PRESSURE_WARMUP_FRAMES = 18;
const LIVE_DRAW_PRESSURE_SLOW_FRAMES = 5;
const LIVE_DRAW_PRESSURE_RECOVERY_FRAMES = 180;
const LIVE_STATE_FLUSH_MS = 250;
const LIVE_PACKET_WAIT_PROGRESS_MS = 30_000;
const LIVE_INITIAL_SEED_LIMIT = 72;
const LIVE_VIEWPORT_PADDING_PX = 96;
const LIVE_NODE_ACTIVITY_MS = 5_800;
const LIVE_NODE_ACTIVITY_THROTTLE_MS = 700;
const LIVE_PACKET_FLIGHT_BASE_MS = 2_550;
const LIVE_PACKET_FLIGHT_HOP_MS = 380;
const LIVE_PACKET_FLIGHT_EXTRA_MAX_MS = 1_450;
const LIVE_DESKTOP_PANEL_STORAGE_KEY = "beacon-live-desktop-panel";
const AUDIO_MIN_INTERVAL_MS = 85;
const AUDIO_SCALE = [220, 247, 277, 330, 370, 415, 494, 554, 659, 740, 831, 988];
const LIVE_DESKTOP_LAYOUT_WIDTH = 1024;

type LiveVisualQuality = "high" | "balanced" | "constrained";

interface LivePerfSnapshot {
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

interface LiveVisualCaps {
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

function liveCommandDockStyle(desktop: boolean): CSSProperties {
  if (desktop) {
    return {
      bottom: "0.75rem",
      flexWrap: "wrap",
      gap: "0.5rem",
      left: "auto",
      maxWidth: "calc(100vw - 372px)",
      overflowX: "auto",
      padding: "0.5rem",
      right: 360,
      width: "fit-content",
    };
  }
  return {
    bottom: "0.375rem",
    flexWrap: "nowrap",
    gap: "0.25rem",
    left: "0.5rem",
    maxWidth: "calc(100vw - 1rem)",
    overflowX: "auto",
    padding: "0.25rem",
    right: "0.5rem",
  };
}

function liveInspectorRailStyle(desktop: boolean, expanded: boolean): CSSProperties {
  if (desktop) {
    return {
      bottom: 86,
      left: "auto",
      maxHeight: "none",
      right: "0.75rem",
      top: "0.75rem",
      width: 340,
    };
  }
  return {
    bottom: 58,
    height: expanded ? undefined : 96,
    left: "0.5rem",
    maxHeight: expanded ? "46dvh" : 96,
    right: "0.5rem",
  };
}

function liveVisualCaps(width?: number, pressure = 0): LiveVisualCaps {
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

function key(value: string): string {
  return value.trim().toLowerCase();
}

function buildNodeCoordMaps(nodes: NodeSummary[]) {
  const byKey = new Map<string, NodeCoord>();
  const byPathPrefix = new Map<string, NodeCoord[]>();

  for (const node of nodes) {
    if (node.lat == null || node.lng == null) continue;
    const coord: NodeCoord = {
      id: node.id,
      name: nullableDisplayLabel(node.name),
      publicKey: node.publicKey,
      lng: node.lng,
      lat: node.lat,
      iatas: node.iatas.map((i) => i.iata.toUpperCase()),
    };
    byKey.set(key(node.id), coord);
    byKey.set(key(node.publicKey), coord);
    if (node.observerId) byKey.set(key(node.observerId), coord);
    const publicKey = node.publicKey.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    for (let length = 2; length <= Math.min(16, publicKey.length); length += 2) {
      const prefix = publicKey.slice(0, length);
      const bucket = byPathPrefix.get(prefix) ?? [];
      bucket.push(coord);
      byPathPrefix.set(prefix, bucket);
    }
  }

  return { byKey, byPathPrefix };
}

function buildIataCoordMap(iatas: IataCode[] | undefined): Map<string, Coord> {
  const map = new Map<string, Coord>();
  for (const iata of iatas ?? []) {
    if (iata.lat == null || iata.lon == null) continue;
    map.set(iata.iata.toUpperCase(), { lat: iata.lat, lng: iata.lon });
  }
  return map;
}

function readCssVar(name: string, fallback: string, scope?: Element | null): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(scope ?? document.documentElement).getPropertyValue(name).trim() || fallback;
}

function cssColorToRgb(color: string, fallback: [number, number, number]): [number, number, number] {
  const hex = color.trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return fallback;
}

function rgba(parts: [number, number, number], alpha: number): string {
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.max(0, Math.min(1, alpha))})`;
}

function storedNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number.parseFloat(localStorage.getItem(key) ?? "");
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function packetFrequency(byte: number, payloadType: number, hopCount: number): number {
  const octave = byte > 205 ? 2 : byte > 122 ? 1 : 0;
  const scaleIndex = (byte + payloadType + hopCount) % AUDIO_SCALE.length;
  return AUDIO_SCALE[scaleIndex]! * 2 ** octave;
}

function resolveObserverTarget(
  event: LivePacketEvent,
  nodeCoords: Map<string, NodeCoord>,
  iataCoords: Map<string, Coord>,
): { coord: Coord; node: NodeCoord | null; label: string } | null {
  const observerNode = nodeCoords.get(key(event.observerId));
  if (observerNode) {
    return {
      coord: { lat: observerNode.lat, lng: observerNode.lng },
      node: observerNode,
      label: observerNode.name || observerNode.publicKey.slice(0, 8),
    };
  }

  const iataCoord = iataCoords.get(event.iata.toUpperCase());
  if (!iataCoord) return null;
  return { coord: iataCoord, node: null, label: event.iata.toUpperCase() };
}

function samplePropagationEvents(events: LivePacketEvent[], cap = MAX_PROPAGATION_WAVE_PATHS): LivePacketEvent[] {
  if (events.length <= cap) return events;
  if (cap <= 1) return events.slice(-1);

  const last = events.length - 1;
  return Array.from({ length: cap }, (_, index) => events[Math.round((index * last) / (cap - 1))]!);
}

function tailWindow<T>(items: T[], count: number): T[] {
  return items.length > count ? items.slice(-count) : items;
}

function easeInOutSmooth(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return p * p * (3 - 2 * p);
}

function coordInMapViewport(map: MapLibreMap, coord: Coord, paddingPx = LIVE_VIEWPORT_PADDING_PX): boolean {
  const container = map.getContainer();
  const width = container.clientWidth || container.getBoundingClientRect().width || 1;
  const height = container.clientHeight || container.getBoundingClientRect().height || 1;
  const point = map.project([coord.lng, coord.lat]);
  return point.x >= -paddingPx && point.x <= width + paddingPx && point.y >= -paddingPx && point.y <= height + paddingPx;
}

function pathHasVisibleNode(map: MapLibreMap, path: Array<{ coord: Coord }>, paddingPx = LIVE_VIEWPORT_PADDING_PX): boolean {
  return path.some((point) => coordInMapViewport(map, point.coord, paddingPx));
}

type LiveNodeMarkerRole = "tx" | "relay" | "rx";

const liveNodeActivityTimers = new WeakMap<MapLibreMap, Map<string, number>>();
const liveNodeActivityState = new WeakMap<MapLibreMap, Map<string, { role: LiveNodeMarkerRole; updatedAt: number }>>();

function flashMapNodeActivity(
  map: MapLibreMap,
  nodeId: string | undefined,
  role: LiveNodeMarkerRole,
  durationMs = LIVE_NODE_ACTIVITY_MS,
): void {
  if (!nodeId || nodeId.includes(":") || !map.getSource(NODES_SOURCE_ID)) return;
  let timers = liveNodeActivityTimers.get(map);
  if (!timers) {
    timers = new Map();
    liveNodeActivityTimers.set(map, timers);
  }
  let states = liveNodeActivityState.get(map);
  if (!states) {
    states = new Map();
    liveNodeActivityState.set(map, states);
  }
  const priorTimer = timers.get(nodeId);
  if (priorTimer !== undefined) window.clearTimeout(priorTimer);

  const now = performance.now();
  const priorState = states.get(nodeId);
  if (!priorState || priorState.role !== role || now - priorState.updatedAt > LIVE_NODE_ACTIVITY_THROTTLE_MS) {
    try {
      map.setFeatureState({ source: NODES_SOURCE_ID, id: nodeId }, { active: true, activityRole: role });
      states.set(nodeId, { role, updatedAt: now });
    } catch {
      return;
    }
  }

  const timer = window.setTimeout(() => {
    timers?.delete(nodeId);
    states?.delete(nodeId);
    if (!map.getSource(NODES_SOURCE_ID)) return;
    try {
      map.setFeatureState({ source: NODES_SOURCE_ID, id: nodeId }, { active: false, activityRole: "" });
    } catch {
      /* source/style may have been replaced while the marker was fading */
    }
  }, durationMs);
  timers.set(nodeId, timer);
}

function drawHexPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * side) / 6;
    const hx = x + Math.cos(angle) * radius;
    const hy = y + Math.sin(angle) * radius;
    if (side === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
}

function drawDirectionalChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  distance: number,
  size: number,
  inverted = false,
): void {
  const centerX = x + Math.cos(angle) * distance;
  const centerY = y + Math.sin(angle) * distance;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle + (inverted ? Math.PI : 0));
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.55, -size * 0.52);
  ctx.lineTo(-size * 0.28, 0);
  ctx.lineTo(-size * 0.55, size * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function livePulseShortLabel(role: LivePulse["role"]): string {
  switch (role) {
    case "origin":
      return "TX";
    case "destination":
      return "RX";
    case "relay":
      return "HOP";
    default:
      return "ACT";
  }
}

function drawTerminalTag(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.font = "700 9px Share Tech Mono, JetBrains Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = Math.max(22, ctx.measureText(label).width + 10);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 0.48));
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - width / 2, y - 7, width, 14);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function useLiveAnimationCanvas(
  mapRef: RefObject<MapLibreMap | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  frameRequestRef: MutableRefObject<(() => void) | null>,
  isReady: boolean,
  animationsRef: RefObject<LiveAnimation[]>,
  trailsRef: RefObject<LiveTrail[]>,
  pulsesRef: RefObject<LivePulse[]>,
  rainRef: RefObject<LiveRainDrop[]>,
  heatRef: RefObject<LiveHeatPoint[]>,
  trailsEnabled: boolean,
  rainEnabled: boolean,
  heatEnabled: boolean,
  matrixMode: boolean,
  pressureRef: MutableRefObject<number>,
  onActiveCount: (count: number) => void,
  profileKey: string,
) {
  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas || !isReady) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    let raf = 0;
    let idleTimer = 0;
    let drawCount = 0;
    let lastPublishedCount = -1;
    let lastActivePublishedAt = 0;
    let lastPerfPublishedAt = 0;
    let lastRenderedAt = 0;
    let canvasHasContent = false;
    let cssHeight = 1;
    let cssWidth = 1;
    let canvasDpr = 1;
    let drawPressure = 0;
    pressureRef.current = 0;
    let drawCostEma = 0;
    let recoveryFrames = 0;
    let slowFrames = 0;
    const frameSamples: number[] = [];
    const profileScope = canvas.closest("[data-map-profile]");
    const matrixColor = readCssVar("--map-primary", readCssVar("--crt-phosphor", "#ffb000"), profileScope);
    const originPulseColor = readCssVar("--map-route-primary", "#ffb000", profileScope);
    const destinationPulseColor = readCssVar("--map-route-green", "#42ff7c", profileScope);
    const relayPulseColor = readCssVar("--map-route-secondary", "#7cffec", profileScope);
    const heatCoreColor = cssColorToRgb(readCssVar("--map-live-heat-core", "#ffb000", profileScope), [255, 176, 0]);
    const heatMidColor = cssColorToRgb(readCssVar("--map-live-heat-mid", "#ff7a18", profileScope), [255, 122, 24]);
    const heatEdgeColor = cssColorToRgb(readCssVar("--map-live-heat-edge", "#42ff7c", profileScope), [66, 255, 124]);
    const glowFactor = Number(readCssVar("--map-glow-factor", "1", profileScope)) || 1;
    const debugPerf = new URLSearchParams(window.location.search).has("livePerf");

    const HEAT_SPRITE_R = 128;
    const heatSprite = document.createElement("canvas");
    heatSprite.width = heatSprite.height = HEAT_SPRITE_R * 2;
    const heatSpriteCtx = heatSprite.getContext("2d");
    if (heatSpriteCtx) {
      const ramp = heatSpriteCtx.createRadialGradient(HEAT_SPRITE_R, HEAT_SPRITE_R, 0, HEAT_SPRITE_R, HEAT_SPRITE_R, HEAT_SPRITE_R);
      ramp.addColorStop(0, rgba(heatCoreColor, 1));
      ramp.addColorStop(0.38, rgba(heatMidColor, 0.5));
      ramp.addColorStop(0.72, rgba(heatEdgeColor, 0.24));
      ramp.addColorStop(1, rgba(heatCoreColor, 0));
      heatSpriteCtx.fillStyle = ramp;
      heatSpriteCtx.fillRect(0, 0, HEAT_SPRITE_R * 2, HEAT_SPRITE_R * 2);
    }

    type ProjectedPoint = { x: number; y: number };
    interface ProjectedLivePath {
      distances: number[];
      points: ProjectedPoint[];
      totalDistance: number;
    }
    const projectedCoordCache = new Map<string, ProjectedPoint>();
    let projectedPathCache = new WeakMap<LivePathPoint[], ProjectedLivePath>();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const fallbackRect = canvas.parentElement?.getBoundingClientRect();
      const width = rect.width || fallbackRect?.width || 1;
      const height = rect.height || fallbackRect?.height || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, liveVisualCaps(width, drawPressure).dprLimit);
      const canvasWidth = Math.max(1, Math.floor(width * dpr));
      const canvasHeight = Math.max(1, Math.floor(height * dpr));
      const sizeChanged = canvas.width !== canvasWidth || canvas.height !== canvasHeight || canvasDpr !== dpr;
      cssWidth = width;
      cssHeight = height;
      if (sizeChanged) {
        canvasDpr = dpr;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        projectedPathCache = new WeakMap();
        projectedCoordCache.clear();
        requestFrame();
      } else if (canvasHasContent || hasFrameWork()) {
        requestFrame();
      }
    };

    const projectPath = (path: LivePathPoint[]): ProjectedLivePath => {
      const cached = projectedPathCache.get(path);
      if (cached) return cached;

      const points = path.map((point) => map.project([point.coord.lng, point.coord.lat]));
      const distances: number[] = [];
      let totalDistance = 0;
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index]!;
        const to = points[index + 1]!;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        distances.push(distance);
        totalDistance += distance;
      }
      const projected = { distances, points, totalDistance };
      projectedPathCache.set(path, projected);
      return projected;
    };
    const projectCoord = (coord: Coord): ProjectedPoint => {
      const cacheKey = `${coord.lng.toFixed(5)}:${coord.lat.toFixed(5)}`;
      const cached = projectedCoordCache.get(cacheKey);
      if (cached) return cached;
      const projected = map.project([coord.lng, coord.lat]);
      projectedCoordCache.set(cacheKey, projected);
      return projected;
    };
    const drawProjectedPath = (path: ProjectedLivePath) => {
      const { points } = path;
      if (points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index]!.x, points[index]!.y);
      }
    };
    const pointAlongPath = (path: ProjectedLivePath, progress: number) => {
      const { distances, points, totalDistance } = path;
      if (points.length === 0) return { x: 0, y: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, totalDistance: 0 };
      if (points.length === 1) return { x: points[0]!.x, y: points[0]!.y, from: points[0]!, to: points[0]!, totalDistance: 0 };

      let remaining = totalDistance * progress;
      for (let index = 0; index < distances.length; index += 1) {
        const distance = distances[index]!;
        if (remaining <= distance || index === distances.length - 1) {
          const from = points[index]!;
          const to = points[index + 1]!;
          const segmentT = distance <= 0 ? 1 : Math.max(0, Math.min(1, remaining / distance));
          return {
            x: from.x + (to.x - from.x) * segmentT,
            y: from.y + (to.y - from.y) * segmentT,
            from,
            to,
            totalDistance,
          };
        }
        remaining -= distance;
      }

      const last = points[points.length - 1]!;
      return { x: last.x, y: last.y, from: points[points.length - 2]!, to: last, totalDistance };
    };

    const strokeProgressPath = (path: ProjectedLivePath, progress: number) => {
      const { distances, points } = path;
      if (points.length === 0) return { x: 0, y: 0 };
      const current = pointAlongPath(path, progress);
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      let drawnDistance = 0;
      const targetDistance = current.totalDistance * progress;
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index]!;
        const to = points[index + 1]!;
        const distance = distances[index] ?? Math.hypot(to.x - from.x, to.y - from.y);
        if (drawnDistance + distance < targetDistance) {
          ctx.lineTo(to.x, to.y);
          drawnDistance += distance;
          continue;
        }
        ctx.lineTo(current.x, current.y);
        break;
      }
      return current;
    };
    const pointInViewport = (point: ProjectedPoint, paddingPx = LIVE_VIEWPORT_PADDING_PX) =>
      point.x >= -paddingPx && point.x <= cssWidth + paddingPx && point.y >= -paddingPx && point.y <= cssHeight + paddingPx;
    const projectedPathHasVisibleNode = (path: ProjectedLivePath, paddingPx = LIVE_VIEWPORT_PADDING_PX) =>
      path.points.some((point) => pointInViewport(point, paddingPx));

    const hasFrameWork = () =>
      animationsRef.current.length > 0 ||
      pulsesRef.current.length > 0 ||
      (trailsEnabled && trailsRef.current.length > 0) ||
      (rainEnabled && rainRef.current.length > 0) ||
      (heatEnabled && heatRef.current.length > 0);

    const publishPerfSnapshot = (now: number, frameMs: number, drawStartedAt: number, caps: LiveVisualCaps) => {
      if (!debugPerf) return;

      const sampledFrameMs = frameMs > 0 && frameMs < LIVE_PERF_IDLE_GAP_MS ? frameMs : 0;
      if (sampledFrameMs > 0) {
        frameSamples.push(sampledFrameMs);
        if (frameSamples.length > LIVE_PERF_SAMPLE_LIMIT) frameSamples.shift();
      }
      if (now - lastPerfPublishedAt < 500) return;
      lastPerfPublishedAt = now;

      const sorted = frameSamples.slice().sort((a, b) => a - b);
      const avgFrameMs = frameSamples.length > 0 ? frameSamples.reduce((total, value) => total + value, 0) / frameSamples.length : 0;
      const p95FrameMs = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
      const snapshot: LivePerfSnapshot = {
        activeAnimations: animationsRef.current.length,
        avgFrameMs,
        canvasHeight: Math.round(cssHeight),
        canvasWidth: Math.round(cssWidth),
        drawCount,
        drawPressure,
        heatPoints: heatRef.current.length,
        lastDrawMs: performance.now() - drawStartedAt,
        lastFrameMs: sampledFrameMs,
        p95FrameMs,
        pulses: pulsesRef.current.length,
        quality: caps.quality,
        rainDrops: rainRef.current.length,
        targetFrameMs: caps.targetFrameMs,
        timestamp: Date.now(),
        trails: trailsRef.current.length,
      };
      const perfWindow = window as Window & { __beaconLivePerf?: LivePerfSnapshot };
      perfWindow.__beaconLivePerf = snapshot;
      canvas.dataset.livePerf = JSON.stringify(snapshot);
    };

    const clearCanvas = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      canvasHasContent = false;
    };

    const requestFrame = (delayMs = 0) => {
      if (raf !== 0) return;
      if (delayMs > 0) {
        if (idleTimer !== 0) return;
        idleTimer = window.setTimeout(() => {
          idleTimer = 0;
          requestFrame();
        }, delayMs);
        return;
      }
      if (idleTimer !== 0) {
        window.clearTimeout(idleTimer);
        idleTimer = 0;
      }
      raf = requestAnimationFrame(draw);
    };

    const handleMapMotion = () => {
      projectedPathCache = new WeakMap();
      projectedCoordCache.clear();
      if (canvasHasContent || hasFrameWork()) requestFrame();
    };

    const draw = (now: number) => {
      raf = 0;
      if (!hasFrameWork()) {
        if (canvasHasContent) clearCanvas();
        if (lastPublishedCount !== 0) {
          lastPublishedCount = 0;
          onActiveCount(0);
        }
        return;
      }

      const frameAge = now - lastRenderedAt;
      const frameCaps = liveVisualCaps(cssWidth, drawPressure);
      if (lastRenderedAt > 0 && frameAge >= 0 && frameAge < frameCaps.targetFrameMs - LIVE_FRAME_TOLERANCE_MS) {
        requestFrame(Math.max(1, frameCaps.targetFrameMs - frameAge - LIVE_FRAME_TOLERANCE_MS));
        return;
      }
      const frameMs = lastRenderedAt > 0 ? frameAge : 0;
      lastRenderedAt = now;
      drawCount += 1;
      const drawStartedAt = performance.now();

      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const nextHeat: LiveHeatPoint[] = [];
      if (heatEnabled) {
        for (const heat of heatRef.current) {
          const age = now - heat.createdAt;
          if (age > heat.lifetimeMs) continue;

          const progress = Math.max(0, Math.min(1, age / heat.lifetimeMs));
          const point = projectCoord(heat.coord);
          if (!pointInViewport(point)) continue;
          nextHeat.push(heat);
          const radius = 28 + Math.min(36, heat.intensity * 8) + 24 * (1 - progress);
          const alpha = (1 - progress) * Math.min(0.24, (0.055 + heat.intensity * 0.026) * glowFactor);

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha;
          ctx.drawImage(heatSprite, point.x - radius, point.y - radius, radius * 2, radius * 2);
          ctx.restore();
        }
      } else if (heatRef.current.length) {
        heatRef.current = [];
      }

      const nextTrails: LiveTrail[] = [];
      if (trailsEnabled) {
        for (const trail of trailsRef.current) {
          const age = now - trail.createdAt;
          if (age > trail.lifetimeMs) continue;

          const progress = Math.max(0, Math.min(1, age / trail.lifetimeMs));
          const trailPath = trail.path.length >= 2 ? trail.path : [
            { coord: trail.from, label: "source", nodeId: `${trail.id}:source` },
            { coord: trail.to, label: "observer", nodeId: `${trail.id}:observer` },
          ];
          const projectedTrail = projectPath(trailPath);
          if (!projectedPathHasVisibleNode(projectedTrail)) continue;
          nextTrails.push(trail);
          const color = matrixMode ? matrixColor : trail.color;

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (1 - progress) * (matrixMode ? 0.28 : 0.19) * glowFactor;
          ctx.strokeStyle = color;
          ctx.lineWidth = matrixMode ? 1.4 : 1.8;
          ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 8 : 7) : 0;
          ctx.shadowColor = color;
          drawProjectedPath(projectedTrail);
          ctx.stroke();
          if (!matrixMode) {
            ctx.globalAlpha = (1 - progress) * 0.08 * glowFactor;
            ctx.lineWidth = 4.5;
            ctx.shadowBlur = frameCaps.shadows ? 12 : 0;
            drawProjectedPath(projectedTrail);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else if (trailsRef.current.length) {
        trailsRef.current = [];
      }

      const nextPulses: LivePulse[] = [];
      for (const pulse of pulsesRef.current) {
        const age = now - pulse.createdAt;
        const point = projectCoord(pulse.coord);
        if (!pointInViewport(point)) continue;
        if (age < 0) {
          nextPulses.push(pulse);
          continue;
        }
        if (age > pulse.lifetimeMs) continue;
        nextPulses.push(pulse);

        const progress = Math.max(0, Math.min(1, age / pulse.lifetimeMs));
        const headingPoint = pulse.headingTo ? projectCoord(pulse.headingTo) : null;
        const role = pulse.role ?? "activity";
        const color = matrixMode
          ? matrixColor
          : role === "origin"
            ? originPulseColor
            : role === "destination"
              ? destinationPulseColor
              : role === "relay"
                ? relayPulseColor
                : pulse.color;
        const energy = Math.min(3.2, Math.max(1, pulse.strength));
        const endpoint = role === "origin" || role === "destination";
        const rippleRadius = endpoint ? 52 : 28;
        const coreRadius = endpoint ? 6.2 + energy : 3.4 + energy * 0.8;
        const roleLabel = livePulseShortLabel(role);
        const ringCount = endpoint ? Math.max(2, frameCaps.pulseRings + 1) : Math.max(1, frameCaps.pulseRings);
        const headingAngle = headingPoint
          ? role === "destination"
            ? Math.atan2(point.y - headingPoint.y, point.x - headingPoint.x)
            : Math.atan2(headingPoint.y - point.y, headingPoint.x - point.x)
          : -Math.PI / 2;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = frameCaps.shadows ? (endpoint ? 18 : matrixMode ? 8 : 5) : 0;

        ctx.globalAlpha = (endpoint ? 0.52 : matrixMode ? 0.24 : 0.2) * (1 - progress) * glowFactor;
        ctx.lineWidth = (endpoint ? 2.2 : 1.3) + energy * 0.3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, (endpoint ? 8 : 6) + rippleRadius * progress, 0, Math.PI * 2);
        ctx.stroke();

        if (frameCaps.pulseRings > 1 || endpoint) {
          ctx.globalAlpha = (endpoint ? 0.2 : 0.04) * (1 - progress);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(point.x, point.y, (endpoint ? 16 : 12) + (endpoint ? 72 : 36) * progress, 0, Math.PI * 2);
          ctx.stroke();
        }

        for (let ring = 0; ring < ringCount; ring += 1) {
          const wave = (progress * (endpoint ? 1.65 : 1.28) + ring / ringCount) % 1;
          const waveAlpha = (endpoint ? 0.32 : 0.13) * (1 - wave) * (1 - progress * 0.36) * glowFactor;
          if (waveAlpha <= 0.01) continue;
          ctx.globalAlpha = waveAlpha;
          ctx.lineWidth = endpoint ? 1.35 : 0.95;
          ctx.beginPath();
          ctx.arc(point.x, point.y, coreRadius + 10 + wave * (endpoint ? 58 : 30), 0, Math.PI * 2);
          ctx.stroke();
        }

        if (!endpoint) {
          const flash = 0.5 + 0.5 * Math.sin(progress * Math.PI * 8);
          const nodeFlash = Math.max(0, 1 - progress * 1.18);
          const relayRadius = role === "relay" ? 12 : 15;

          ctx.globalAlpha = Math.max(0.08, 0.2 * nodeFlash);
          ctx.shadowBlur = frameCaps.shadows ? 12 : 0;
          drawHexPath(ctx, point.x, point.y, relayRadius + flash * 3);
          ctx.fill();

          ctx.globalAlpha = Math.max(0.12, 0.36 * (1 - progress));
          ctx.lineWidth = 1 + flash * 0.25;
          ctx.shadowBlur = frameCaps.shadows ? 10 : 0;
          drawHexPath(ctx, point.x, point.y, relayRadius + 1 + flash * 2);
          ctx.stroke();

          if (headingPoint) {
            ctx.globalAlpha = Math.max(0.16, 0.48 * (1 - progress));
            ctx.shadowBlur = frameCaps.shadows ? 9 : 0;
            drawDirectionalChevron(ctx, point.x, point.y, headingAngle, 19 + 8 * progress, role === "relay" ? 5.6 : 6.4);
          }

          if (frameCaps.labels && progress < 0.86) {
            drawTerminalTag(ctx, roleLabel, point.x, point.y - 19 - 4 * progress, color, Math.max(0.2, 0.78 * (1 - progress)));
          }
        }

        if (endpoint) {
          const tick = 8 + Math.sin(progress * Math.PI * 6) * 2;
          const flash = 0.5 + 0.5 * Math.sin(progress * Math.PI * 9);
          const hexRadius = 15 + flash * 4;
          const nodeFlash = Math.max(0, 1 - progress * 1.35);
          const sweep = Math.sin(progress * Math.PI * 4);

          ctx.globalAlpha = Math.max(0.12, 0.34 * nodeFlash);
          ctx.shadowBlur = frameCaps.shadows ? 24 : 0;
          drawHexPath(ctx, point.x, point.y, 18 + flash * 6);
          ctx.fill();

          ctx.globalAlpha = Math.max(0.16, 0.54 * (1 - progress));
          ctx.lineWidth = 1.4 + flash * 0.45;
          ctx.shadowBlur = frameCaps.shadows ? 20 : 0;
          drawHexPath(ctx, point.x, point.y, hexRadius);
          ctx.stroke();

          ctx.globalAlpha = Math.max(0.12, 0.4 * (1 - progress));
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 22 + 18 * progress, headingAngle - 0.82, headingAngle + 0.82);
          ctx.stroke();

          ctx.globalAlpha = Math.max(0.14, 0.46 * (1 - progress));
          ctx.lineWidth = 1.55;
          ctx.beginPath();
          ctx.moveTo(point.x - tick - 5, point.y);
          ctx.lineTo(point.x - tick, point.y);
          ctx.moveTo(point.x + tick, point.y);
          ctx.lineTo(point.x + tick + 5, point.y);
          ctx.moveTo(point.x, point.y - tick - 5);
          ctx.lineTo(point.x, point.y - tick);
          ctx.moveTo(point.x, point.y + tick);
          ctx.lineTo(point.x, point.y + tick + 5);
          ctx.stroke();

          if (headingPoint) {
            const beamStart = role === "destination" ? -56 + 8 * progress : 8;
            const beamEnd = role === "destination" ? -7 : 58 - 12 * progress;
            ctx.globalAlpha = Math.max(0.12, 0.36 * (1 - progress));
            ctx.lineWidth = 2.2;
            ctx.shadowBlur = frameCaps.shadows ? 18 : 0;
            ctx.setLineDash([7, 7]);
            ctx.beginPath();
            ctx.moveTo(point.x + Math.cos(headingAngle) * beamStart, point.y + Math.sin(headingAngle) * beamStart);
            ctx.lineTo(point.x + Math.cos(headingAngle) * beamEnd, point.y + Math.sin(headingAngle) * beamEnd);
            ctx.stroke();
            ctx.setLineDash([]);

            const chevronBase = role === "origin" ? 23 + 12 * progress : -(34 - 12 * progress);
            const chevronSize = role === "origin" ? 8.5 : 7.5;
            ctx.globalAlpha = Math.max(0.2, 0.74 * (1 - progress));
            ctx.shadowBlur = frameCaps.shadows ? 14 : 0;
            drawDirectionalChevron(ctx, point.x, point.y, headingAngle, chevronBase, chevronSize);

            ctx.globalAlpha = Math.max(0.1, 0.38 * (1 - progress));
            drawDirectionalChevron(
              ctx,
              point.x,
              point.y,
              headingAngle,
              chevronBase + (role === "origin" ? 15 + sweep * 3 : -15 - sweep * 3),
              chevronSize * 0.78,
            );
          }

          if (frameCaps.labels) {
            ctx.globalAlpha = Math.max(0.22, 0.78 * (1 - progress));
            ctx.shadowBlur = frameCaps.shadows ? 5 : 0;
            ctx.font = "700 10px Share Tech Mono, JetBrains Mono, monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pulse.label ?? (role === "origin" ? "TX ORIGIN" : "RX DEST"), point.x, point.y - 24 - 9 * progress);
          }

          drawTerminalTag(
            ctx,
            roleLabel,
            point.x + Math.cos(headingAngle) * (role === "destination" ? -34 : 34),
            point.y + Math.sin(headingAngle) * (role === "destination" ? -34 : 34),
            color,
            Math.max(0.24, 0.86 * (1 - progress)),
          );
        }

        ctx.globalAlpha = Math.max(endpoint ? 0.18 : 0.07, (endpoint ? 0.5 : 0.24) * (1 - progress));
        ctx.shadowBlur = frameCaps.shadows ? (endpoint ? 16 : matrixMode ? 6 : 4) : 0;
        ctx.beginPath();
        ctx.arc(point.x, point.y, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const nextRain: LiveRainDrop[] = [];
      if (rainEnabled) {
        for (const drop of rainRef.current) {
          const age = now - drop.createdAt;
          if (age < 0) {
            nextRain.push(drop);
            continue;
          }
          if (age > drop.durationMs) continue;
          nextRain.push(drop);

          const progress = Math.max(0, Math.min(1, age / drop.durationMs));
          const x = 24 + drop.xRatio * Math.max(1, cssWidth - 48);
          const maxY = cssHeight * drop.maxYRatio;
          const headY = progress * maxY;
          const charHeight = matrixMode ? 17 : 15;
          const scrollOffset = Math.floor(progress * drop.bytes.length);
          const lifeFade = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const visibleBytes = Math.min(drop.bytes.length, MAX_RAIN_BYTES);
          for (let i = 0; i < visibleBytes; i += 1) {
            const y = headY - i * charHeight;
            if (y < -charHeight || y > cssHeight + charHeight) continue;
            const fade = Math.max(0, (1 - i / visibleBytes) * lifeFade);
            if (fade <= 0) continue;
            const byte = drop.bytes[(scrollOffset + i) % drop.bytes.length]!;
            if (i === 0) {
              ctx.globalAlpha = Math.min(0.72, fade);
              ctx.font = `700 ${matrixMode ? 16 : 14}px Share Tech Mono, JetBrains Mono, monospace`;
              ctx.fillStyle = matrixMode ? "#FFFFFF" : drop.color;
              ctx.shadowColor = matrixMode ? matrixColor : drop.color;
              ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 9 : 6) : 0;
            } else {
              ctx.globalAlpha = fade * (matrixMode ? 0.42 : 0.26);
              ctx.font = `${matrixMode ? 13 : 12}px Share Tech Mono, JetBrains Mono, monospace`;
              ctx.fillStyle = matrixMode ? matrixColor : drop.color;
              ctx.shadowColor = matrixMode ? matrixColor : drop.color;
              ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 3 : 2) : 0;
            }
            ctx.fillText(byte, x, y);
          }
          ctx.restore();
        }
      } else if (rainRef.current.length) {
        rainRef.current = [];
      }

      const next: LiveAnimation[] = [];
      const finishedTrails: LiveTrail[] = [];
      const animations = animationsRef.current;
      const animationStartIndex = Math.max(0, animations.length - frameCaps.activeAnimations);
      for (let animationIndex = animationStartIndex; animationIndex < animations.length; animationIndex += 1) {
        const anim = animations[animationIndex]!;
        const age = now - anim.startedAt;
        const animPath = anim.path.length >= 2 ? anim.path : [
          { coord: anim.from, label: "source", nodeId: `${anim.id}:source` },
          { coord: anim.to, label: "observer", nodeId: `${anim.id}:observer` },
        ];
        const projectedPath = projectPath(animPath);
        if (!projectedPathHasVisibleNode(projectedPath)) continue;
        if (age < 0) {
          next.push(anim);
          continue;
        }
        if (age > anim.durationMs) {
          if (trailsEnabled) {
            finishedTrails.push({
              id: `${anim.id}-${Math.round(now)}`,
              from: anim.from,
              to: anim.to,
              path: anim.path,
              createdAt: now,
              lifetimeMs: matrixMode ? 22_000 : 28_000,
              color: anim.color,
            });
          }
          continue;
        }

        const progress = Math.min(1, Math.max(0, age / anim.durationMs));
        const eased = easeInOutSmooth(progress);
        next.push(anim);
        const current = pointAlongPath(projectedPath, eased);
        const from = projectedPath.points[0]!;
        const to = projectedPath.points[projectedPath.points.length - 1]!;
        const x = current.x;
        const y = current.y;
        const alpha = Math.max(0.18, 1 - progress * 0.64);
        const color = matrixMode ? matrixColor : anim.color;
        const pathDistance = current.totalDistance || Math.hypot(to.x - from.x, to.y - from.y);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = matrixMode ? 0.055 : 0.032;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 2.8 : 2.9;
        ctx.shadowBlur = frameCaps.shadows ? 2 : 0;
        ctx.shadowColor = color;
        drawProjectedPath(projectedPath);
        ctx.stroke();

        ctx.globalAlpha = matrixMode ? 0.14 : 0.085;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 1.1 : 1.2;
        ctx.setLineDash([4, 9]);
        drawProjectedPath(projectedPath);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = alpha * (matrixMode ? 0.4 : 0.34);
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 1.8 : 1.9;
        ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 4 : 2.5) : 0;
        ctx.shadowColor = color;
        strokeProgressPath(projectedPath, eased);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.8 + 1.2 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.max(0.1, alpha * (matrixMode ? 0.32 : 0.46));
        ctx.lineWidth = matrixMode ? 1.1 : 1.35;
        ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 7 : 11) : 0;
        ctx.beginPath();
        ctx.arc(x, y, 8 + 5 * Math.sin(progress * Math.PI * 5) ** 2, 0, Math.PI * 2);
        ctx.stroke();

        if (pathDistance > 18) {
          const dx = current.to.x - current.from.x;
          const dy = current.to.y - current.from.y;
          const angle = Math.atan2(dy, dx);
          const arrowSize = matrixMode ? 8 : 10;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.globalAlpha = Math.max(0.22, alpha * (matrixMode ? 0.52 : 0.72));
          ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 7 : 10) : 0;
          ctx.shadowColor = color;
          ctx.beginPath();
          ctx.moveTo(arrowSize, 0);
          ctx.lineTo(-arrowSize * 0.42, -arrowSize * 0.45);
          ctx.lineTo(-arrowSize * 0.18, 0);
          ctx.lineTo(-arrowSize * 0.42, arrowSize * 0.45);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        if (!matrixMode && frameCaps.shadows && frameCaps.sparkCount > 0) {
          const seed = hashSeed(anim.id);
          for (let i = 0; i < frameCaps.sparkCount; i += 1) {
            const phase = ((seed % 97) / 97 + progress * 2.8 + i * 0.31) % 1;
            const angle = phase * Math.PI * 2;
            const distance = 5 + i * 3 + 7 * (1 - progress);
            ctx.globalAlpha = Math.max(0, 0.18 * (1 - progress) * (1 - i * 0.18));
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 1.2 + i * 0.25, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (matrixMode && frameCaps.labels) {
          if (pathDistance > 44 && anim.bytes.length > 0) {
            const dx = current.to.x - current.from.x;
            const dy = current.to.y - current.from.y;
            const pathLength = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / pathLength;
            const ny = dx / pathLength;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < Math.min(4, anim.bytes.length); i += 1) {
              const offset = (i + 1) * 22;
              const t = Math.max(0, 1 - offset / pathLength);
              const bx = current.from.x + dx * t + nx * 10;
              const by = current.from.y + dy * t + ny * 10;
              const alphaByte = Math.max(0.08, (1 - i / 4) * (1 - progress * 0.28) * 0.58);
              ctx.globalAlpha = i === 0 ? Math.min(0.72, alphaByte + 0.12) : alphaByte;
              ctx.font = `${i === 0 ? "700 " : ""}${Math.max(10, 15 - i)}px Share Tech Mono, JetBrains Mono, monospace`;
              ctx.fillStyle = i === 0 ? "#FFFFFF" : matrixColor;
              ctx.shadowBlur = i === 0 ? 9 : 4;
              ctx.shadowColor = matrixColor;
              ctx.fillText(anim.bytes[(Math.floor(progress * anim.bytes.length * 1.8) + i) % anim.bytes.length]!, bx, by);
            }
          }
        }

        ctx.globalAlpha = Math.max(0.06, 0.2 * (1 - progress));
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(from.x, from.y, 5 + 10 * Math.min(1, progress * 2.5), 0, Math.PI * 2);
        ctx.stroke();

        if (anim.waveCount > 1 && progress < 0.58) {
          const ripple = Math.max(0, progress / 0.58);
          ctx.globalAlpha = 0.055 * (1 - ripple);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(from.x, from.y, 7 + (12 + anim.waveIndex * 2) * ripple, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (progress > 0.7) {
          const pulse = (progress - 0.7) / 0.3;
          ctx.globalAlpha = 0.16 * (1 - pulse);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 8 + 18 * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (frameCaps.labels && pathDistance > 64) {
          if (progress < 0.34) {
            drawTerminalTag(ctx, "TX", from.x, from.y - 24, color, Math.max(0.18, 0.62 * (1 - progress / 0.34)));
          }
          if (progress > 0.66) {
            const arrive = (progress - 0.66) / 0.34;
            drawTerminalTag(ctx, "RX", to.x, to.y - 24, color, Math.max(0.18, 0.62 * arrive));
          }
        }

        if (frameCaps.labels && pathDistance > 72 && progress > 0.16 && progress < 0.9) {
          ctx.globalAlpha = matrixMode ? 0.28 : 0.19;
          ctx.shadowBlur = 0;
          ctx.font = "10px Share Tech Mono, JetBrains Mono, monospace";
          ctx.fillStyle = color;
          ctx.fillText(payloadLabel(anim.event.payloadTypeName).slice(0, 10), x + 8, y - 8);
        }
        ctx.restore();
      }

      const cappedNext = tailWindow(next, frameCaps.activeAnimations);
      animationsRef.current = cappedNext;
      const trailsNext = finishedTrails.length > 0 ? [...nextTrails, ...finishedTrails] : nextTrails;
      trailsRef.current = tailWindow(trailsNext, frameCaps.trails);
      pulsesRef.current = tailWindow(nextPulses, frameCaps.pulses);
      rainRef.current = tailWindow(nextRain, frameCaps.rainDrops);
      heatRef.current = tailWindow(nextHeat, frameCaps.heatPoints);
      if (lastPublishedCount !== cappedNext.length && (cappedNext.length === 0 || now - lastActivePublishedAt > 250)) {
        lastActivePublishedAt = now;
        lastPublishedCount = cappedNext.length;
        onActiveCount(cappedNext.length);
      }

      const hasActiveMotion = cappedNext.length > 0 || pulsesRef.current.length > 0 || rainRef.current.length > 0;
      const hasResidue =
        (trailsEnabled && trailsRef.current.length > 0) ||
        (heatEnabled && heatRef.current.length > 0);
      canvasHasContent = hasActiveMotion || hasResidue;
      const drawMs = performance.now() - drawStartedAt;
      drawCostEma = drawCostEma === 0 ? drawMs : drawCostEma * 0.9 + drawMs * 0.1;
      if (drawCount > LIVE_DRAW_PRESSURE_WARMUP_FRAMES && drawCostEma > LIVE_DRAW_PRESSURE_MS && drawPressure < 2) {
        slowFrames += 1;
        if (slowFrames >= LIVE_DRAW_PRESSURE_SLOW_FRAMES) {
          drawPressure += 1;
          recoveryFrames = 0;
          slowFrames = 0;
        }
      } else if (drawCostEma < LIVE_DRAW_RECOVERY_MS && drawPressure > 0) {
        recoveryFrames += 1;
        slowFrames = 0;
        if (recoveryFrames > LIVE_DRAW_PRESSURE_RECOVERY_FRAMES) {
          drawPressure -= 1;
          recoveryFrames = 0;
        }
      } else {
        recoveryFrames = 0;
        slowFrames = 0;
      }
      pressureRef.current = drawPressure;
      publishPerfSnapshot(now, frameMs, drawStartedAt, frameCaps);
      if (hasActiveMotion) {
        requestFrame();
      } else if (hasResidue) {
        requestFrame(LIVE_RESIDUE_FRAME_INTERVAL_MS);
      }
    };

    resize();
    frameRequestRef.current = () => {
      requestFrame();
    };
    window.addEventListener("resize", resize);
    map.on("resize", resize);
    map.on("move", handleMapMotion);
    map.on("zoom", handleMapMotion);
    requestFrame();

    return () => {
      cancelAnimationFrame(raf);
      if (idleTimer !== 0) window.clearTimeout(idleTimer);
      if (frameRequestRef.current) frameRequestRef.current = null;
      window.removeEventListener("resize", resize);
      map.off("resize", resize);
      map.off("move", handleMapMotion);
      map.off("zoom", handleMapMotion);
      pressureRef.current = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [
    animationsRef,
    canvasRef,
    frameRequestRef,
    heatEnabled,
    heatRef,
    isReady,
    mapRef,
    matrixMode,
    onActiveCount,
    pressureRef,
    pulsesRef,
    profileKey,
    rainEnabled,
    rainRef,
    trailsEnabled,
    trailsRef,
  ]);
}

const LiveStat = memo(function LiveStat({
  className = "",
  label,
  value,
  tone = "primary",
}: {
  className?: string;
  label: string;
  value: string | number;
  tone?: "primary" | "green" | "warn";
}) {
  const toneClass = tone === "green" ? "text-green" : tone === "warn" ? "text-warn" : "text-primary";
  return (
    <div className={`crt-float-panel min-w-18 rounded-sm border border-border px-3 py-2 ${className}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`font-mono text-lg leading-none font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
});

function LiveControlButton({
  active,
  className = "",
  compact = false,
  danger,
  icon,
  label,
  onClick,
  title,
}: {
  active?: boolean;
  className?: string;
  compact?: boolean;
  danger?: boolean;
  icon?: LiveIconName;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  const activeClass = danger
    ? "text-danger border-danger/35 bg-danger/8 hover:bg-danger/12"
    : active
      ? "text-primary border-primary/35 bg-primary/10 hover:bg-primary/15"
      : "text-text-normal border-border bg-bg-raised hover:text-text-bright hover:border-primary/35";
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors md:text-[11px] ${
        compact ? "h-8 w-8 px-0" : "h-9 px-2 md:px-2.5"
      } ${activeClass} ${className}`}
      onClick={onClick}
      aria-pressed={active}
      title={title ?? label}
    >
      {icon && <LiveIcon name={icon} />}
      <span className={icon ? (compact ? "sr-only" : "hidden sm:inline") : ""}>{label}</span>
    </button>
  );
}

type LiveIconName = "audio" | "bytes" | "clear" | "color" | "crt" | "feed" | "heat" | "pace" | "pause" | "play" | "settings" | "trail";

function LiveIcon({ name }: { name: LiveIconName }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "play":
      return <svg {...common}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
    case "pause":
      return <svg {...common}><path d="M8 5v14M16 5v14" /></svg>;
    case "trail":
      return <svg {...common}><path d="M4 17c4-7 8 2 16-8" /><path d="M4 17h.01M12 13h.01M20 9h.01" /></svg>;
    case "pace":
      return <svg {...common}><path d="M4 12h3l2-5 4 10 2-5h5" /><circle cx="12" cy="12" r="9" /></svg>;
    case "heat":
      return <svg {...common}><path d="M12 3c2 3-1 4 1 7 1.5 2.2 4 2.5 4 6a5 5 0 0 1-10 0c0-2.5 1.8-4.1 3.3-5.6C11.6 9 12.5 7.2 12 3z" /></svg>;
    case "color":
      return <svg {...common}><circle cx="12" cy="12" r="7" /><path d="M12 5v14M5 12h14" /></svg>;
    case "settings":
      return <svg {...common}><path d="M4 7h10M4 17h10" /><circle cx="17" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>;
    case "feed":
      return <svg {...common}><path d="M5 6h14M5 12h14M5 18h9" /></svg>;
    case "clear":
      return <svg {...common}><path d="M5 6h14M9 6v12m6-12v12M8 6l1-2h6l1 2M6 6l1 14h10l1-14" /></svg>;
    case "crt":
      return <svg {...common}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case "bytes":
      return <svg {...common}><path d="M7 5v14M17 5v14M4 8h6M4 16h6M14 12h6" /></svg>;
    case "audio":
      return <svg {...common}><path d="M5 14H3v-4h2l4-4v12z" /><path d="M14 9c1 1 1 5 0 6M17 7c2 2 2 8 0 10" /></svg>;
  }
}

const LiveControlDock = memo(function LiveControlDock({
  activeAnimations,
  colorByHash,
  compact,
  consoleOpen,
  heatVisible,
  laggedCount,
  onToggleColorByHash,
  onToggleConsole,
  onToggleHeat,
  onTogglePaused,
  onTogglePropagation,
  onToggleSettings,
  onToggleTrails,
  paused,
  quality,
  queuedCount,
  ratePerMin,
  realisticPropagation,
  settingsOpen,
  style,
  totalPackets,
  trails,
  visualDroppedCount,
  visualQueueSize,
}: {
  activeAnimations: number;
  colorByHash: boolean;
  compact: boolean;
  consoleOpen: boolean;
  heatVisible: boolean;
  laggedCount: number;
  onToggleColorByHash: () => void;
  onToggleConsole: () => void;
  onToggleHeat: () => void;
  onTogglePaused: () => void;
  onTogglePropagation: () => void;
  onToggleSettings: () => void;
  onToggleTrails: () => void;
  paused: boolean;
  quality: LiveVisualQuality;
  queuedCount: number;
  ratePerMin: number;
  realisticPropagation: boolean;
  settingsOpen: boolean;
  style: CSSProperties;
  totalPackets: number;
  trails: boolean;
  visualDroppedCount: number;
  visualQueueSize: number;
}) {
  if (compact) {
    return (
      <div className="crt-float-panel live-command-dock absolute z-30 flex items-center rounded-sm border border-border" style={style}>
        <LiveControlButton compact icon={paused ? "play" : "pause"} label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded border px-2 font-mono text-[10px] font-semibold tracking-wider ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`crt-glow-dot h-1.5 w-1.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          {paused ? "PAUSE" : "LIVE"}
        </div>
        <LiveControlButton compact icon="trail" label="Trails" active={trails} onClick={onToggleTrails} title="Toggle persistent map trails" />
        <LiveControlButton compact icon="pace" label="Pace" active={realisticPropagation} onClick={onTogglePropagation} title="Pace repeated observations before rendering" />
        <LiveControlButton compact icon="heat" label="Heat" active={heatVisible} onClick={onToggleHeat} title="Toggle live activity heat overlay" />
        <LiveControlButton compact icon="color" label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
        <LiveControlButton compact icon="feed" label="Console" active={consoleOpen} onClick={onToggleConsole} title="Open Live console" />
        <LiveControlButton compact icon="settings" label="Settings" active={settingsOpen} onClick={onToggleSettings} title="Open Live settings" />
      </div>
    );
  }

  return (
    <div className="crt-float-panel live-command-dock absolute z-30 flex items-center rounded-sm border border-border" style={style}>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 pr-1 md:gap-2">
        <LiveControlButton icon={paused ? "play" : "pause"} label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-wider md:px-2.5 md:text-[11px] ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`crt-glow-dot h-1.5 w-1.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          {paused ? "PAUSED" : "LIVE"}
        </div>
        <div className="hidden min-w-0 items-center gap-3 font-mono text-[11px] text-text-muted xl:flex">
          <span>{formatCount(totalPackets)} pkts</span>
          <span>{ratePerMin}/m</span>
          <span>{activeAnimations} active</span>
          <span>{quality}</span>
          {queuedCount > 0 && <span className="text-warn">{queuedCount} queued</span>}
          {visualQueueSize > 0 && <span className="text-primary">{visualQueueSize} visual q</span>}
          {laggedCount > 0 && <span className="text-danger">{laggedCount} dropped</span>}
          {visualDroppedCount > 0 && <span className="text-warn">{visualDroppedCount} visual skipped</span>}
        </div>
      </div>

      <LiveControlButton icon="trail" label="Trails" active={trails} onClick={onToggleTrails} title="Toggle persistent map trails" />
      <LiveControlButton icon="pace" label="Pace" active={realisticPropagation} onClick={onTogglePropagation} title="Pace repeated observations before rendering" />
      <LiveControlButton icon="heat" className="hidden sm:inline-flex" label="Heat" active={heatVisible} onClick={onToggleHeat} title="Toggle live activity heat overlay" />
      <LiveControlButton icon="color" className="hidden sm:inline-flex" label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
      <LiveControlButton icon="feed" label="Console" active={consoleOpen} onClick={onToggleConsole} title="Toggle Live console rail" />
      <LiveControlButton icon="settings" label="Settings" active={settingsOpen} onClick={onToggleSettings} title="Open Live settings" />
    </div>
  );
});

function formatLiveWait(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function livePacketWaitProgress(ms: number) {
  return Math.min(96, 8 + (Math.max(0, ms) / LIVE_PACKET_WAIT_PROGRESS_MS) * 88);
}

function LivePacketWaitState({
  backfillStatus,
  compact = false,
  now,
  summary,
  waitStartedAt,
}: {
  backfillStatus: string;
  compact?: boolean;
  now: number;
  summary?: LiveSummary;
  waitStartedAt: number;
}) {
  const elapsedMs = waitStartedAt > 0 ? Math.max(0, now - waitStartedAt) : 0;
  const hasServerActivity = (summary?.latestObservationId ?? 0) > 0 || (summary?.observationCount ?? 0) > 0;
  const label =
    backfillStatus === "priming"
      ? "PRIMING RECENT PACKETS"
      : backfillStatus === "sync"
        ? "SYNCING LIVE CURSOR"
        : hasServerActivity
          ? "LISTENING FOR NEXT PACKET"
          : "WAITING FOR PACKETS";
  const detail = hasServerActivity
    ? `cursor ${summary?.latestObservationId ?? "--"} / ${formatCount(summary?.observationCount ?? 0)} obs / ${summary?.activeObservers ?? "--"} observers`
    : `elapsed ${formatLiveWait(elapsedMs)} / broker listener armed`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`terminal-loading-state text-text-muted ${compact ? "terminal-loading-state-compact px-2 py-2" : "px-3 py-6"}`}
    >
      <div className="terminal-loading-line justify-center">
        <TerminalSpinner />
        <span className="terminal-loading-label">{label}</span>
        <TerminalCursor />
      </div>
      {!compact && <div className="terminal-loading-detail">{detail}</div>}
      {compact && <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">{detail}</div>}
      <TerminalProgress value={livePacketWaitProgress(elapsedMs)} className="mt-3" />
    </div>
  );
}

const LiveFeedPanel = memo(function LiveFeedPanel({
  backfillStatus,
  clockTick,
  events,
  now,
  onSelect,
  onAnalyze,
  selectedId,
  summary,
  waitStartedAt,
}: {
  backfillStatus: string;
  clockTick: number;
  events: LivePacketEvent[];
  now: number;
  onSelect: (event: LivePacketEvent) => void;
  onAnalyze: (hash: string) => void;
  selectedId?: string;
  summary?: LiveSummary;
  waitStartedAt: number;
}) {
  return (
    <div
      data-live-clock={clockTick}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Packet Feed</div>
        <div className="font-mono text-[11px] text-text-dim">{events.length}/{LIVE_FEED_CAP}</div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <LivePacketWaitState backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
        ) : (
          events.slice(0, 18).map((event) => (
            <button
              key={event.id}
              type="button"
              className={`w-full grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 px-3 py-2 text-left border-b border-border-subtle/70 transition-colors hover:bg-primary/8 ${selectedId === event.id ? "bg-primary/10" : ""}`}
              onClick={() => onSelect(event)}
              onDoubleClick={() => onAnalyze(event.packetHash)}
            >
              <span
                className="crt-glow-dot mt-1 h-2.5 w-2.5 rounded-full"
                style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-semibold text-text-bright truncate">{payloadLabel(event.payloadTypeName)}</span>
                  <span className="font-mono text-[10px] text-primary">{formatHex(event.packetHash)}</span>
                  {event.scope && <span className="font-mono text-[10px] text-secondary">{event.scope}</span>}
                </span>
                <span className="block font-mono text-[11px] text-text-muted truncate">
                  {event.observerName || event.observerId.slice(0, 8)} / {event.iata} / {event.routeTypeName}
                </span>
              </span>
              <span className="text-right font-mono text-[10px] text-text-dim">
                <span className="block">{timeAgoMs(event.receivedAt)}</span>
                <span className="block">{event.snr.toFixed(1)} dB</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

function LiveKV({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "primary" | "green" | "warn" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "green" ? "text-green" : tone === "warn" ? "text-warn" : "text-text-bright";
  return (
    <div className="min-w-0 rounded border border-border-subtle bg-bg-base/45 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`truncate font-mono text-xs font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LiveMixList({ title, items }: { title: string; items: Array<{ label: string; count: number; color?: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{title}</div>
      {(items.length ? items : [{ label: "No data", count: 0 }]).slice(0, 5).map((item) => (
        <div key={item.label} className="space-y-1 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? "var(--color-border)", color: item.color }} />
            <span className="min-w-0 flex-1 truncate text-text-muted">{item.label}</span>
            <span className="text-text-dim">{item.count}</span>
          </div>
          <div className="h-1 overflow-hidden rounded bg-bg-base">
            <div className="h-full bg-primary/70" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveSettingsPanel({
  audioBpm,
  audioEnabled,
  audioVolume,
  appearanceSettings,
  clustered,
  matrixMode,
  matrixRain,
  onAppearanceChange,
  onAudioBpmChange,
  onAudioVolumeChange,
  onClusteredChange,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  styleId,
  typeFilter,
}: {
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  appearanceSettings: MapAppearanceSettings;
  clustered: boolean;
  matrixMode: boolean;
  matrixRain: boolean;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
  onAudioBpmChange: (value: number) => void;
  onAudioVolumeChange: (value: number) => void;
  onClusteredChange: (value: boolean) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  styleId: string;
  typeFilter: string;
}) {
  return (
    <div className="border-b border-border-subtle p-3">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-muted">Live Settings</div>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Map Tiles</div>
          <MapStyleSwitcher styleId={styleId} onChange={onStyleChange} className="w-full" />
        </div>
        <MapAppearanceControls settings={appearanceSettings} onChange={onAppearanceChange} includeRelief={false} />
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Node Type</div>
          <SegmentedControl
            wrap
            ariaLabel="Live node type"
            options={[{ value: "", label: "All" }, ...NODE_TYPE_FILTER_OPTIONS]}
            value={typeFilter}
            onChange={onTypeChange}
          />
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">Clustering</div>
          <SegmentedControl
            ariaLabel="Live clustering"
            options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]}
            value={clustered ? "on" : "off"}
            onChange={(value) => onClusteredChange(value === "on")}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LiveControlButton icon="crt" label="CRT" active={matrixMode} onClick={onToggleMatrix} title="Toggle phosphor scan view" />
          <LiveControlButton icon="bytes" label="Bytes" active={matrixRain} onClick={onToggleRain} title="Toggle packet byte phosphor rain" />
          <LiveControlButton icon="audio" label="Audio" active={audioEnabled} onClick={onToggleAudio} title="Toggle packet sonification" />
        </div>
        {audioEnabled && (
          <div className="space-y-3 rounded border border-border-subtle bg-bg-base/45 p-2 font-mono text-[10px] text-text-muted">
            <label className="flex items-center gap-2">
              VOL
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audioVolume * 100)}
                onChange={(event) => onAudioVolumeChange(Number(event.currentTarget.value) / 100)}
                className="h-1.5 flex-1 accent-primary"
                aria-label="Audio volume"
              />
            </label>
            <label className="flex items-center gap-2">
              BPM
              <input
                type="range"
                min={60}
                max={240}
                value={audioBpm}
                onChange={(event) => onAudioBpmChange(Number(event.currentTarget.value))}
                className="h-1.5 flex-1 accent-primary"
                aria-label="Audio BPM"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveInspectorRail({
  activeAnimations,
  audioBpm,
  audioEnabled,
  audioVolume,
  appearanceSettings,
  backfillCount,
  backfillStatus,
  clockTick,
  clustered,
  compact,
  events,
  feedVisible,
  laggedCount,
  matrixMode,
  matrixRain,
  now,
  onAnalyze,
  onAudioBpmChange,
  onAppearanceChange,
  onAudioVolumeChange,
  onClusteredChange,
  onSelect,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  quality,
  ratePerMin,
  selectedEvent,
  settingsOpen,
  styleId,
  style,
  summary,
  totalPackets,
  typeFilter,
  visualDroppedCount,
  waitStartedAt,
}: {
  activeAnimations: number;
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  appearanceSettings: MapAppearanceSettings;
  backfillCount: number;
  backfillStatus: string;
  clockTick: number;
  clustered: boolean;
  compact: boolean;
  events: LivePacketEvent[];
  feedVisible: boolean;
  laggedCount: number;
  matrixMode: boolean;
  matrixRain: boolean;
  now: number;
  onAnalyze: (hash: string) => void;
  onAudioBpmChange: (value: number) => void;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
  onAudioVolumeChange: (value: number) => void;
  onClusteredChange: (value: boolean) => void;
  onSelect: (event: LivePacketEvent) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  quality: LiveVisualQuality;
  ratePerMin: number;
  selectedEvent?: LivePacketEvent;
  settingsOpen: boolean;
  styleId: string;
  style: CSSProperties;
  summary?: LiveSummary;
  totalPackets: number;
  typeFilter: string;
  visualDroppedCount: number;
  waitStartedAt: number;
}) {
  const event = selectedEvent ?? events[0];
  const payloadItems =
    summary?.payloadMix.map((item) => ({ label: payloadLabel(item.payloadTypeName), count: item.count, color: payloadColor(item.payloadTypeName) })) ??
    topPayloads(events).map((item) => ({ label: item.typeName, count: item.count, color: item.color }));
  const routeItems =
    summary?.routeMix.map((item) => ({ label: item.routeTypeName, count: item.count })) ??
    Array.from(events.reduce((map, item) => map.set(item.routeTypeName, (map.get(item.routeTypeName) ?? 0) + 1), new Map<string, number>()), ([label, count]) => ({ label, count }));

  if (compact) {
    if (settingsOpen) {
      return (
        <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Live Settings</div>
            <div className="font-mono text-[10px] uppercase text-text-dim">{quality}</div>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <LiveSettingsPanel
              audioBpm={audioBpm}
              audioEnabled={audioEnabled}
              audioVolume={audioVolume}
              appearanceSettings={appearanceSettings}
              clustered={clustered}
              matrixMode={matrixMode}
              matrixRain={matrixRain}
              onAppearanceChange={onAppearanceChange}
              onAudioBpmChange={onAudioBpmChange}
              onAudioVolumeChange={onAudioVolumeChange}
              onClusteredChange={onClusteredChange}
              onStyleChange={onStyleChange}
              onToggleAudio={onToggleAudio}
              onToggleMatrix={onToggleMatrix}
              onToggleRain={onToggleRain}
              onTypeChange={onTypeChange}
              styleId={styleId}
              typeFilter={typeFilter}
            />
          </div>
        </div>
      );
    }

    if (feedVisible) {
      return (
        <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Packet Feed</div>
            <div className="font-mono text-[10px] uppercase text-text-dim">{events.length}/{LIVE_FEED_CAP}</div>
          </div>
          <div className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-border-subtle p-2">
            <LiveKV label="Pkts" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
            <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
            <LiveKV label="Act" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
            <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
          </div>
          <LiveFeedPanel
            backfillStatus={backfillStatus}
            clockTick={clockTick}
            events={events}
            now={now}
            onAnalyze={onAnalyze}
            onSelect={onSelect}
            selectedId={selectedEvent?.id}
            summary={summary}
            waitStartedAt={waitStartedAt}
          />
        </div>
      );
    }

    return (
      <div className="crt-float-panel live-inspector-rail absolute z-20 flex flex-col justify-between overflow-hidden rounded-sm border border-border" style={style}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 p-2">
          <LiveKV label="Packets" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
          <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
          <LiveKV label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
          <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
        </div>
        {event ? (
          <button type="button" className="mx-2 mb-2 min-w-0 rounded border border-border-subtle bg-bg-base/35 px-2 py-1.5 text-left" onClick={() => onSelect(event)}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="crt-glow-dot h-2 w-2 shrink-0 rounded-full" style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
              <span className="font-mono text-[10px] text-primary">{event.iata}</span>
              <span className="font-mono text-[10px] text-text-dim">{timeAgoMs(event.receivedAt)}</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
              {event.routeTypeName} / {event.rssi} dBm / {event.snr.toFixed(1)} dB
            </div>
          </button>
        ) : (
          <div className="mx-2 mb-2 rounded border border-border-subtle bg-bg-base/35">
            <LivePacketWaitState compact backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="crt-float-panel live-inspector-rail absolute z-20 flex min-h-0 flex-col overflow-hidden rounded-sm border border-border" style={style}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Live Console</div>
        <div className="font-mono text-[10px] uppercase text-text-dim">{quality}</div>
      </div>
      {settingsOpen && (
        <LiveSettingsPanel
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={onAppearanceChange}
          onAudioBpmChange={onAudioBpmChange}
          onAudioVolumeChange={onAudioVolumeChange}
          onClusteredChange={onClusteredChange}
          onStyleChange={onStyleChange}
          onToggleAudio={onToggleAudio}
          onToggleMatrix={onToggleMatrix}
          onToggleRain={onToggleRain}
          onTypeChange={onTypeChange}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      )}
      <div className="grid grid-cols-4 gap-2 border-b border-border-subtle p-3">
        <LiveKV label="Packets" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
        <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
        <LiveKV label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
        <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
      </div>
      <div className="border-b border-border-subtle p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">Packet Inspector</div>
          {backfillCount > 0 && <div className="font-mono text-[10px] text-green">{backfillCount} recovered</div>}
        </div>
        {event ? (
          <button type="button" className="w-full text-left" onClick={() => onAnalyze(event.packetHash)}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
              <span className="font-mono text-xs text-primary">{formatHex(event.packetHash)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <LiveKV label="IATA" value={event.iata} />
              <LiveKV label="Route" value={event.routeTypeName} />
              <LiveKV label="RSSI" value={`${event.rssi} dBm`} />
              <LiveKV label="SNR" value={`${event.snr.toFixed(1)} dB`} />
            </div>
            <div className="mt-2 truncate font-mono text-[10px] text-text-dim" title={formatAbsolute(event.heardAt, { ms: true })}>
              {event.observerName || event.observerId} / {timeAgoMs(event.receivedAt)}
            </div>
          </button>
        ) : (
          <LivePacketWaitState backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-border-subtle p-3">
        <LiveMixList title="Payload Mix" items={payloadItems} />
        <LiveMixList title="Route Mix" items={routeItems} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-border-subtle p-3">
        <LiveKV label="Obs" value={formatCount(summary?.observationCount ?? events.length)} />
        <LiveKV label="Observers" value={summary?.activeObservers ?? "--"} />
        <LiveKV label="Skipped" value={visualDroppedCount} tone={visualDroppedCount > 0 ? "warn" : "normal"} />
      </div>
      {feedVisible && (
        <LiveFeedPanel
          backfillStatus={backfillStatus}
          clockTick={clockTick}
          events={events}
          now={now}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
          selectedId={selectedEvent?.id}
          summary={summary}
          waitStartedAt={waitStartedAt}
        />
      )}
    </div>
  );
}

function LiveMobileConsoleSheet({
  activeAnimations,
  backfillStatus,
  clockTick,
  events,
  laggedCount,
  now,
  onAnalyze,
  onClose,
  onSelect,
  ratePerMin,
  selectedEvent,
  summary,
  totalPackets,
  waitStartedAt,
}: {
  activeAnimations: number;
  backfillStatus: string;
  clockTick: number;
  events: LivePacketEvent[];
  laggedCount: number;
  now: number;
  onAnalyze: (hash: string) => void;
  onClose: () => void;
  onSelect: (event: LivePacketEvent) => void;
  ratePerMin: number;
  selectedEvent?: LivePacketEvent;
  summary?: LiveSummary;
  totalPackets: number;
  waitStartedAt: number;
}) {
  const event = selectedEvent ?? events[0];
  const payloadItems =
    summary?.payloadMix.map((item) => ({ label: payloadLabel(item.payloadTypeName), count: item.count, color: payloadColor(item.payloadTypeName) })) ??
    topPayloads(events).map((item) => ({ label: item.typeName, count: item.count, color: item.color }));
  const routeItems =
    summary?.routeMix.map((item) => ({ label: item.routeTypeName, count: item.count })) ??
    Array.from(events.reduce((map, item) => map.set(item.routeTypeName, (map.get(item.routeTypeName) ?? 0) + 1), new Map<string, number>()), ([label, count]) => ({ label, count }));

  return (
    <BottomSheet label="Live console" onClose={onClose}>
      <div className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Live Console</div>
          <button type="button" className="font-mono text-[10px] uppercase text-text-muted" onClick={onClose}>Close</button>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-1.5 border-b border-border-subtle p-2">
          <LiveKV label="Pkts" value={formatCount(summary?.packetCount ?? totalPackets)} tone="green" />
          <LiveKV label="Rate" value={`${ratePerMin}/m`} tone="primary" />
          <LiveKV label="Act" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "normal"} />
          <LiveKV label="Lag" value={laggedCount > 0 ? laggedCount : backfillStatus} tone={laggedCount > 0 ? "warn" : "normal"} />
        </div>
        <div className="shrink-0 border-b border-border-subtle p-3">
          {event ? (
            <button type="button" className="w-full rounded border border-border-subtle bg-bg-base/35 px-2 py-1.5 text-left" onClick={() => onAnalyze(event.packetHash)}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="crt-glow-dot h-2 w-2 shrink-0 rounded-full" style={{ color: payloadColor(event.payloadTypeName), backgroundColor: payloadColor(event.payloadTypeName) }} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text-bright">{payloadLabel(event.payloadTypeName)}</span>
                <span className="font-mono text-[10px] text-primary">{event.iata}</span>
                <span className="font-mono text-[10px] text-text-dim">{timeAgoMs(event.receivedAt)}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
                {event.routeTypeName} / {event.rssi} dBm / {event.snr.toFixed(1)} dB / {formatHex(event.packetHash)}
              </div>
            </button>
          ) : (
            <LivePacketWaitState compact backfillStatus={backfillStatus} now={now} summary={summary} waitStartedAt={waitStartedAt} />
          )}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border-subtle p-3">
          <LiveMixList title="Payload Mix" items={payloadItems} />
          <LiveMixList title="Route Mix" items={routeItems} />
        </div>
        <LiveFeedPanel
          backfillStatus={backfillStatus}
          clockTick={clockTick}
          events={events}
          now={now}
          onAnalyze={onAnalyze}
          onSelect={onSelect}
          selectedId={selectedEvent?.id}
          summary={summary}
          waitStartedAt={waitStartedAt}
        />
      </div>
    </BottomSheet>
  );
}

function LiveMobileSettingsSheet({
  audioBpm,
  audioEnabled,
  audioVolume,
  appearanceSettings,
  clustered,
  matrixMode,
  matrixRain,
  onAppearanceChange,
  onAudioBpmChange,
  onAudioVolumeChange,
  onClose,
  onClusteredChange,
  onStyleChange,
  onToggleAudio,
  onToggleMatrix,
  onToggleRain,
  onTypeChange,
  styleId,
  typeFilter,
}: {
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  appearanceSettings: MapAppearanceSettings;
  clustered: boolean;
  matrixMode: boolean;
  matrixRain: boolean;
  onAppearanceChange: (patch: Partial<MapAppearanceSettings>) => void;
  onAudioBpmChange: (value: number) => void;
  onAudioVolumeChange: (value: number) => void;
  onClose: () => void;
  onClusteredChange: (value: boolean) => void;
  onStyleChange: (id: string) => void;
  onToggleAudio: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTypeChange: (value: string) => void;
  styleId: string;
  typeFilter: string;
}) {
  return (
    <BottomSheet label="Live settings" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Live Settings</div>
        <button type="button" className="font-mono text-[10px] uppercase text-text-muted" onClick={onClose}>Close</button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <LiveSettingsPanel
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={onAppearanceChange}
          onAudioBpmChange={onAudioBpmChange}
          onAudioVolumeChange={onAudioVolumeChange}
          onClusteredChange={onClusteredChange}
          onStyleChange={onStyleChange}
          onToggleAudio={onToggleAudio}
          onToggleMatrix={onToggleMatrix}
          onToggleRain={onToggleRain}
          onTypeChange={onTypeChange}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      </div>
    </BottomSheet>
  );
}

export function LiveView({ wsManager, onAnalyze, selectedNodeId, onSelectNode, nodePanelOpen }: LiveViewProps) {
  const { iatas: selectedIatas, regionKey } = useRegion();
  const { themeId, themes, paletteRev } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationsRef = useRef<LiveAnimation[]>([]);
  const trailsRef = useRef<LiveTrail[]>([]);
  const pulsesRef = useRef<LivePulse[]>([]);
  const rainRef = useRef<LiveRainDrop[]>([]);
  const heatRef = useRef<LiveHeatPoint[]>([]);
  const requestCanvasFrameRef = useRef<(() => void) | null>(null);
  const liveStateFlushTimerRef = useRef(0);
  const pendingEventsRef = useRef<LivePacketEvent[]>([]);
  const pendingQueuedEventsRef = useRef<LivePacketEvent[]>([]);
  const pendingTotalPacketsRef = useRef(0);
  const pendingVisualDroppedRef = useRef(0);
  const visualQueueRef = useRef<LiveAnimationRequest[]>([]);
  const visualPressureRef = useRef(0);
  const lastVisualByPacketRef = useRef(new Map<string, number>());
  const publishedVisualQueueSizeRef = useRef(0);
  const publishedVisualQualityRef = useRef<LiveVisualQuality>("high");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioEnabledRef = useRef(false);
  const audioVolumeRef = useRef(0.22);
  const audioBpmRef = useRef(132);
  const lastAudioAtRef = useRef(0);
  const propagationGroupsRef = useRef(new Map<string, PropagationGroup>());
  const sequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const lastObservationIdRef = useRef(0);
  const backfillInFlightRef = useRef(false);
  const seededLiveCursorRef = useRef("");
  const seenObservationIdsRef = useRef(new Set<number>());
  const seenObservationOrderRef = useRef<number[]>([]);

  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
  const [appearanceSettings, setAppearanceSettings] = useState(readMapAppearanceSettings);
  const visualProfile = useMemo(
    () => resolveMapVisualProfile(styleId, appearanceSettings),
    [appearanceSettings, paletteRev, styleId],
  );
  const visualProfileStyle = useMemo(() => mapVisualProfileStyle(visualProfile) as CSSProperties, [visualProfile]);
  const profileKey = `${themeKey}:${visualProfile.key}`;
  const [typeFilter, setTypeFilter] = useState("");
  const [clustered, setClustered] = useState(false);
  const [events, setEvents] = useState<LivePacketEvent[]>([]);
  const [queuedEvents, setQueuedEvents] = useState<LivePacketEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [trails, setTrails] = useState(true);
  const [realisticPropagation, setRealisticPropagation] = useState(true);
  const [heatVisible, setHeatVisible] = useState(false);
  const [colorByHash, setColorByHash] = useState(true);
  const [matrixMode, setMatrixMode] = useState(false);
  const [matrixRain, setMatrixRain] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(() => storedNumber("live-audio-volume", 0.22, 0, 1));
  const [audioBpm, setAudioBpm] = useState(() => Math.round(storedNumber("live-audio-bpm", 132, 60, 240)));
  const [totalPackets, setTotalPackets] = useState(0);
  const [laggedCount, setLaggedCount] = useState(0);
  const [visualQueueSize, setVisualQueueSize] = useState(0);
  const [visualDroppedCount, setVisualDroppedCount] = useState(0);
  const [activeAnimations, setActiveAnimations] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<LivePacketEvent | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileConsoleOpen, setMobileConsoleOpen] = useState(false);
  const [desktopRailOpen, setDesktopRailOpen] = useState(() => localStorage.getItem(LIVE_DESKTOP_PANEL_STORAGE_KEY) !== "collapsed");
  const [backfillStatus, setBackfillStatus] = useState("ok");
  const [backfillCount, setBackfillCount] = useState(0);
  const [visualQuality, setVisualQuality] = useState<LiveVisualQuality>("high");
  const [now, setNow] = useState(() => Date.now());
  const [packetWaitStartedAt, setPacketWaitStartedAt] = useState(() => Date.now());
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? LIVE_DESKTOP_LAYOUT_WIDTH : window.innerWidth));

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const flushLiveState = useCallback(() => {
    if (liveStateFlushTimerRef.current !== 0) {
      window.clearTimeout(liveStateFlushTimerRef.current);
      liveStateFlushTimerRef.current = 0;
    }

    const pendingTotal = pendingTotalPacketsRef.current;
    if (pendingTotal > 0) {
      pendingTotalPacketsRef.current = 0;
      setTotalPackets((count) => count + pendingTotal);
    }

    const pendingEvents = pendingEventsRef.current;
    if (pendingEvents.length > 0) {
      pendingEventsRef.current = [];
      const newestFirst = pendingEvents.slice().reverse();
      setEvents((items) => mergeLiveEventsByObservation(items, newestFirst, LIVE_FEED_CAP));
    }

    const pendingQueuedEvents = pendingQueuedEventsRef.current;
    if (pendingQueuedEvents.length > 0) {
      pendingQueuedEventsRef.current = [];
      const newestFirst = pendingQueuedEvents.slice().reverse();
      setQueuedEvents((items) => mergeLiveEventsByObservation(items, newestFirst, LIVE_FEED_CAP));
    }

    const pendingVisualDropped = pendingVisualDroppedRef.current;
    if (pendingVisualDropped > 0) {
      pendingVisualDroppedRef.current = 0;
      setVisualDroppedCount((count) => count + pendingVisualDropped);
    }
  }, []);

  const scheduleLiveStateFlush = useCallback(() => {
    if (liveStateFlushTimerRef.current !== 0) return;
    liveStateFlushTimerRef.current = window.setTimeout(flushLiveState, LIVE_STATE_FLUSH_MS);
  }, [flushLiveState]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    let context = audioContextRef.current;
    if (context?.state === "closed") {
      audioContextRef.current = null;
      audioGainRef.current = null;
      context = null;
    }
    if (!context) {
      const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
      const gain = context.createGain();
      gain.gain.value = audioVolumeRef.current;
      gain.connect(context.destination);
      audioContextRef.current = context;
      audioGainRef.current = gain;
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context.state === "closed" ? null : context;
  }, []);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    localStorage.setItem("live-audio-enabled", String(audioEnabled));
    if (audioEnabled) void ensureAudioContext();
  }, [audioEnabled, ensureAudioContext]);

  useEffect(() => {
    const safeVolume = Math.max(0, Math.min(1, audioVolume));
    audioVolumeRef.current = safeVolume;
    localStorage.setItem("live-audio-volume", String(safeVolume));
    const gain = audioGainRef.current;
    const context = audioContextRef.current;
    if (gain && context && context.state !== "closed") {
      gain.gain.setTargetAtTime(safeVolume, context.currentTime, 0.025);
    }
  }, [audioVolume]);

  useEffect(() => {
    const safeBpm = Math.max(60, Math.min(240, Math.round(audioBpm)));
    audioBpmRef.current = safeBpm;
    localStorage.setItem("live-audio-bpm", String(safeBpm));
  }, [audioBpm]);

  useEffect(() => {
    return () => {
      if (liveStateFlushTimerRef.current !== 0) {
        window.clearTimeout(liveStateFlushTimerRef.current);
        liveStateFlushTimerRef.current = 0;
      }
      const context = audioContextRef.current;
      audioContextRef.current = null;
      audioGainRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  useEffect(() => {
    const propagationGroups = propagationGroupsRef.current;
    return () => {
      for (const group of propagationGroups.values()) {
        clearTimeout(group.timer);
      }
      propagationGroups.clear();
    };
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, 2_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      lastObservationIdRef.current = 0;
      seededLiveCursorRef.current = "";
      seenObservationIdsRef.current.clear();
      seenObservationOrderRef.current = [];
      setEvents([]);
      setQueuedEvents([]);
      setSelectedEvent(null);
      setLaggedCount(0);
      setBackfillCount(0);
      setBackfillStatus("ok");
      setPacketWaitStartedAt(Date.now());
    }, 0);
    return () => window.clearTimeout(id);
  }, [regionKey]);

  const handleStyleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  }, []);

  const handleAppearanceChange = useCallback((patch: Partial<MapAppearanceSettings>) => {
    setAppearanceSettings((current) => {
      const next = { ...current, ...patch };
      persistMapAppearanceSettings(next);
      return next;
    });
  }, []);

  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);

  const { data: iataCodes } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });
  const { data: liveSummary } = useQuery({
    queryKey: ["live-summary", regionKey],
    queryFn: () => getLiveSummary(selectedIatas),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
  const nodesKey = useMemo(() => ["map-nodes", regionKey], [regionKey]);
  const { nodes, loadedCount, isPaging, isError: nodesError } = useMapNodesData(selectedIatas, regionKey);
  const { byKey: nodeCoords, byPathPrefix } = useMemo(() => buildNodeCoordMaps(nodes), [nodes]);
  const iataCoords = useMemo(() => buildIataCoordMap(iataCodes), [iataCodes]);

  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, null, handleStyleError, {
    visualProfile,
  });
  const isDark = resolveMapStyle(styleId).dark;

  useMapNodes(mapRef, isReady, geojson, isDark, profileKey, clustered, onSelectNode, selectedNodeId, `${regionKey}:${typeFilter}`);
  useVerifiedRouteNeighborhoodOverlay(mapRef, isReady, selectedNodeId, selectedIatas, profileKey);

  const playPacketAudio = useCallback(
    (event: LivePacketEvent) => {
      if (!audioEnabledRef.current) return;
      const performanceNow = performance.now();
      if (performanceNow - lastAudioAtRef.current < AUDIO_MIN_INTERVAL_MS) return;
      lastAudioAtRef.current = performanceNow;

      void ensureAudioContext().then((context) => {
        const masterGain = audioGainRef.current;
        if (!context || !masterGain || context.state !== "running") return;

        const bytes = hexBytes(event.rawHex || event.packetHash, 8).map((byte) => Number.parseInt(byte, 16));
        if (bytes.length === 0) return;

        const hopCount = Math.max(1, event.hopCount ?? 1);
        const observationEnergy = Math.min(3, Math.max(1, event.observationCount));
        const stepSeconds = Math.max(0.045, Math.min(0.15, 60 / audioBpmRef.current / 3));
        const start = context.currentTime + 0.018;
        const packetGain = context.createGain();
        const filter = context.createBiquadFilter();
        const pan = context.createStereoPanner();
        const seed = hashSeed(event.packetHash);

        packetGain.gain.setValueAtTime(0.0001, start);
        packetGain.gain.exponentialRampToValueAtTime(Math.max(0.015, 0.045 * observationEnergy), start + 0.012);
        packetGain.gain.exponentialRampToValueAtTime(0.0001, start + bytes.length * stepSeconds + 0.18);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.max(640, 6_400 - hopCount * 560), start);
        filter.Q.value = 0.85;
        pan.pan.setValueAtTime(((seed % 200) - 100) / 120, start);
        filter.connect(pan);
        pan.connect(packetGain);
        packetGain.connect(masterGain);

        bytes.slice(0, 5).forEach((byte, index) => {
          const oscillator = context.createOscillator();
          const noteGain = context.createGain();
          const noteStart = start + index * stepSeconds;
          const noteEnd = noteStart + stepSeconds * 1.65;
          oscillator.type = event.payloadTypeName.includes("TXT") || event.payloadTypeName.includes("GRP") ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(packetFrequency(byte, event.payloadType, hopCount), noteStart);
          oscillator.frequency.exponentialRampToValueAtTime(packetFrequency((byte + seed) % 256, event.payloadType, hopCount), noteEnd);
          noteGain.gain.setValueAtTime(0.0001, noteStart);
          noteGain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.01);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
          oscillator.connect(noteGain);
          noteGain.connect(filter);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        });

        const cleanupMs = Math.max(250, (bytes.length * stepSeconds + 0.5) * 1000);
        window.setTimeout(() => {
          filter.disconnect();
          pan.disconnect();
          packetGain.disconnect();
        }, cleanupMs);
      });
    },
    [ensureAudioContext],
  );

  const playAnimation = useCallback(
    (event: LivePacketEvent, waveIndex = 0, waveCount = 1) => {
      const map = mapRef.current;
      if (!map) return false;
      const caps = liveVisualCaps(undefined, visualPressureRef.current);
      const color = colorByHash ? hashColor(event.packetHash) : payloadColor(event.payloadTypeName);
      const startedAt = performance.now();
      const observerTarget = resolveObserverTarget(event, nodeCoords, iataCoords);
      const path = buildTrueRoutePath(event, observerTarget?.node ?? null, byPathPrefix, MAX_HOPS_PER_PACKET);
      const routeFrom = path?.[0]?.coord;
      const routeTo = path?.at(-1)?.coord;
      const hasRoute = Boolean(routeFrom && routeTo && !sameRouteCoord(routeFrom, routeTo));
      const targetCoord = observerTarget?.coord ?? routeTo;
      if (!targetCoord && !hasRoute) return false;

      const pulsePath = path && path.length > 0 ? path : targetCoord ? [{ coord: targetCoord, label: observerTarget?.label ?? event.iata, nodeId: `${event.id}:target` }] : [];
      if (!pathHasVisibleNode(map, pulsePath)) return false;
      const flightDurationMs = hasRoute && path
        ? LIVE_PACKET_FLIGHT_BASE_MS + Math.min(LIVE_PACKET_FLIGHT_EXTRA_MAX_MS, Math.max(0, path.length - 2) * LIVE_PACKET_FLIGHT_HOP_MS)
        : 0;
      const activityPulses: LivePulse[] = [];
      const originPoint = pulsePath[0];
      const destinationPoint = pulsePath.at(-1);
      const originHeading = pulsePath[1]?.coord;
      const destinationHeading = pulsePath.length > 1 ? pulsePath.at(-2)?.coord : undefined;
      if (originPoint) {
        flashMapNodeActivity(map, originPoint.nodeId, pulsePath.length >= 2 ? "tx" : "rx");
        activityPulses.push({
          id: `${event.id}:origin:${originPoint.nodeId}`,
          coord: originPoint.coord,
          headingTo: originHeading,
          createdAt: startedAt,
          lifetimeMs: matrixMode ? 3_600 : 5_200,
          color,
          strength: Math.max(2.2, event.observationCount + 0.75),
          role: pulsePath.length >= 2 ? "origin" : "activity",
          label: pulsePath.length >= 2 ? "TX ORIGIN" : "LIVE NODE",
        });
      }
      const relayPulses = pulsePath.length > 2 ? pulsePath.slice(1, -1).slice(-4) : [];
      relayPulses.forEach((point, index) => {
        const hopIndex = pulsePath.indexOf(point);
        const routeFraction = pulsePath.length > 1 && hopIndex > 0 ? hopIndex / (pulsePath.length - 1) : (index + 1) / Math.max(2, relayPulses.length + 1);
        activityPulses.push({
          id: `${event.id}:relay:${point.nodeId}:${index}`,
          coord: point.coord,
          headingTo: pulsePath[hopIndex + 1]?.coord,
          createdAt: startedAt + (flightDurationMs ? Math.max(140, flightDurationMs * routeFraction * 0.78) : 120 * (index + 1)),
          lifetimeMs: matrixMode ? 2_400 : 3_300,
          color,
          strength: 1.35,
          role: "relay",
          label: "HOP",
        });
      });
      if (
        destinationPoint &&
        (!originPoint || pulsePath.length < 2 || !sameRouteCoord(originPoint.coord, destinationPoint.coord))
      ) {
        flashMapNodeActivity(map, destinationPoint.nodeId, "rx", LIVE_NODE_ACTIVITY_MS * 1.15);
        activityPulses.push({
          id: `${event.id}:destination:${destinationPoint.nodeId}`,
          coord: destinationPoint.coord,
          headingTo: destinationHeading,
          createdAt: startedAt + (flightDurationMs ? Math.max(520, flightDurationMs * 0.82) : Math.min(560, 140 * Math.max(1, pulsePath.length - 1))),
          lifetimeMs: matrixMode ? 4_200 : 6_000,
          color,
          strength: Math.max(2.3, event.observationCount + 0.85),
          role: "destination",
          label: "RX DEST",
        });
      }
      if (activityPulses.length > 0) {
        pulsesRef.current = [
          ...pulsesRef.current.slice(-Math.max(0, caps.pulses - activityPulses.length)),
          ...activityPulses,
        ].slice(-caps.pulses);
      }

      const heatSource = path && path.length > 0 ? path : targetCoord ? [{ coord: targetCoord }] : [];
      const heatPoints = heatSource.slice(-MAX_HOPS_PER_PACKET).map((point, index) => ({
        id: `${event.id}:heat:${index}`,
        coord: point.coord,
        createdAt: startedAt,
        lifetimeMs: 28_000,
        intensity: Math.max(1, Math.min(4, event.observationCount + 0.6)),
      }));
      heatRef.current = [...heatRef.current.slice(-Math.max(0, caps.heatPoints - heatPoints.length)), ...heatPoints].slice(-caps.heatPoints);

      if (matrixRain && rainRef.current.length < caps.rainDrops) {
        const shouldSampleRain = visualQueueRef.current.length < 12 || (event.sequence + hashSeed(event.packetHash)) % 3 === 0;
        const bytes = shouldSampleRain ? hexBytes(event.rawHex || event.packetHash, MAX_RAIN_BYTES) : [];
        if (bytes.length > 0) {
          const seed = hashSeed(`${event.packetHash}:${event.sequence}:rain`);
          const hopCount = Math.max(1, event.hopCount ?? 1);
          const maxYRatio = Math.min(1, Math.max(0.28, hopCount / 4));
          rainRef.current = [
            ...rainRef.current.slice(-(caps.rainDrops - 1)),
            {
              id: `${event.id}:rain`,
              bytes,
              xRatio: (seed % 10_000) / 10_000,
              createdAt: startedAt,
              durationMs: 1_300 + maxYRatio * 2_700,
              maxYRatio,
              color,
            },
          ];
        }
      }

      playPacketAudio(event);

      if (hasRoute && path && routeFrom && routeTo && animationsRef.current.length < caps.activeAnimations) {
        animationsRef.current = [
          ...animationsRef.current.slice(-(caps.activeAnimations - 1)),
          {
            id: event.id,
            event,
            from: routeFrom,
            to: routeTo,
            path,
            startedAt,
            durationMs: flightDurationMs,
            color,
            waveIndex,
            waveCount,
            bytes: hexBytes(event.rawHex || event.packetHash, MAX_MATRIX_FLIGHT_BYTES),
          },
        ];
      }

      requestCanvasFrameRef.current?.();
      return true;
    },
    [byPathPrefix, colorByHash, iataCoords, mapRef, matrixMode, matrixRain, nodeCoords, playPacketAudio],
  );

  const queueAnimation = useCallback(
    (request: LiveAnimationRequest) => {
      const caps = liveVisualCaps(undefined, visualPressureRef.current);
      const maxPendingAnimations = Math.min(MAX_PENDING_ANIMATIONS, caps.activeAnimations * 3);
      visualQueueRef.current.push(request);
      if (visualQueueRef.current.length > maxPendingAnimations) {
        const dropped = visualQueueRef.current.length - maxPendingAnimations;
        visualQueueRef.current = visualQueueRef.current.slice(-maxPendingAnimations);
        pendingVisualDroppedRef.current += dropped;
        scheduleLiveStateFlush();
      }
    },
    [scheduleLiveStateFlush],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const caps = liveVisualCaps(undefined, visualPressureRef.current);
      const active = animationsRef.current.length;
      const queued = visualQueueRef.current.length;
      if (queued > 0 && active < caps.activeAnimations) {
        const batchSize = active < caps.activeAnimations / 2 ? 2 : 1;
        const slots = Math.min(batchSize, caps.activeAnimations - active, queued);
        const maxAttempts = Math.min(queued, Math.max(slots, slots * 5));
        let played = 0;
        let skipped = 0;
        for (let attempts = 0; attempts < maxAttempts && played < slots; attempts += 1) {
          const next = visualQueueRef.current.shift();
          if (!next) break;
          if (playAnimation(next.event, next.waveIndex, next.waveCount)) {
            played += 1;
          } else {
            skipped += 1;
          }
        }
        if (skipped > 0) {
          pendingVisualDroppedRef.current += skipped;
          scheduleLiveStateFlush();
        }
      }
      if (publishedVisualQueueSizeRef.current !== visualQueueRef.current.length) {
        publishedVisualQueueSizeRef.current = visualQueueRef.current.length;
        setVisualQueueSize(visualQueueRef.current.length);
      }
      if (publishedVisualQualityRef.current !== caps.quality) {
        publishedVisualQualityRef.current = caps.quality;
        setVisualQuality(caps.quality);
      }
    }, VISUAL_DRAIN_INTERVAL_MS);

    return () => clearInterval(id);
  }, [playAnimation, scheduleLiveStateFlush]);

  const flushPropagationGroup = useCallback(
    (packetHash: string) => {
      const group = propagationGroupsRef.current.get(packetHash);
      if (!group) return;
      propagationGroupsRef.current.delete(packetHash);

      const ordered = group.events
        .slice()
        .sort((a, b) => a.receivedAt - b.receivedAt || a.sequence - b.sequence);
      const pressure = visualPressureRef.current;
      const cap = pressure >= 2 ? 3 : pressure >= 1 ? 4 : MAX_PROPAGATION_WAVE_PATHS;
      const sampled = samplePropagationEvents(ordered, cap);
      const skipped = ordered.length - sampled.length;
      if (skipped > 0) {
        pendingVisualDroppedRef.current += skipped;
        scheduleLiveStateFlush();
      }
      sampled.forEach((event, index) => {
        queueAnimation({ event, waveIndex: index, waveCount: sampled.length });
      });
    },
    [queueAnimation, scheduleLiveStateFlush],
  );

  const scheduleAnimation = useCallback(
    (event: LivePacketEvent) => {
      if (!realisticPropagation) {
        queueAnimation({ event, waveIndex: 0, waveCount: 1 });
        return;
      }

      const current = propagationGroupsRef.current.get(event.packetHash);
      if (current) {
        if (current.events.length >= LIVE_PROPAGATION_GROUP_HARD_CAP) {
          pendingVisualDroppedRef.current += 1;
          scheduleLiveStateFlush();
          return;
        }
        current.events.push(event);
        return;
      }

      const timer = setTimeout(() => flushPropagationGroup(event.packetHash), visualPressureRef.current >= 2 ? 260 : 420);
      propagationGroupsRef.current.set(event.packetHash, { events: [event], timer });
    },
    [flushPropagationGroup, queueAnimation, realisticPropagation, scheduleLiveStateFlush],
  );

  useEffect(() => {
    if (realisticPropagation) return;
    for (const hash of Array.from(propagationGroupsRef.current.keys())) {
      flushPropagationGroup(hash);
    }
  }, [flushPropagationGroup, realisticPropagation]);

  useLiveAnimationCanvas(
    mapRef,
    canvasRef,
    requestCanvasFrameRef,
    isReady,
    animationsRef,
    trailsRef,
    pulsesRef,
    rainRef,
    heatRef,
    trails,
    matrixRain,
    heatVisible,
    matrixMode,
    visualPressureRef,
    setActiveAnimations,
    profileKey,
  );

  const shouldAnimateEvent = useCallback((event: LivePacketEvent) => {
    const now = performance.now();
    const seen = lastVisualByPacketRef.current;
    const previous = seen.get(event.packetHash);
    seen.set(event.packetHash, now);
    if (seen.size > 256) {
      for (const key of seen.keys()) {
        seen.delete(key);
        if (seen.size <= 192) break;
      }
    }
    return previous == null || now - previous > LIVE_VISUAL_COALESCE_MS;
  }, []);

  const rememberObservation = useCallback((event: LivePacketEvent) => {
    const id = event.observationId;
    if (typeof id !== "number" || id <= 0) return true;
    lastObservationIdRef.current = Math.max(lastObservationIdRef.current, id);
    const seen = seenObservationIdsRef.current;
    if (seen.has(id)) return false;
    seen.add(id);
    seenObservationOrderRef.current.push(id);
    if (seenObservationOrderRef.current.length > 1_200) {
      for (const old of seenObservationOrderRef.current.splice(0, 300)) {
        seen.delete(old);
      }
    }
    return true;
  }, []);

  const acceptLiveEvent = useCallback(
    (event: LivePacketEvent, options: { animate?: boolean } = {}) => {
      if (!rememberObservation(event)) return false;
      pendingTotalPacketsRef.current += 1;
      if (pausedRef.current) {
        pendingQueuedEventsRef.current.push(event);
        if (pendingQueuedEventsRef.current.length > LIVE_FEED_CAP) {
          pendingQueuedEventsRef.current = pendingQueuedEventsRef.current.slice(-LIVE_FEED_CAP);
        }
        scheduleLiveStateFlush();
        return true;
      }
      const animate = options.animate ?? true;
      if (animate && shouldAnimateEvent(event)) {
        scheduleAnimation(event);
      } else if (animate) {
        pendingVisualDroppedRef.current += 1;
      }
      pendingEventsRef.current.push(event);
      if (pendingEventsRef.current.length > LIVE_FEED_CAP) {
        pendingEventsRef.current = pendingEventsRef.current.slice(-LIVE_FEED_CAP);
      }
      scheduleLiveStateFlush();
      return true;
    },
    [rememberObservation, scheduleAnimation, scheduleLiveStateFlush, shouldAnimateEvent],
  );

  const fetchLiveBackfill = useCallback(
    async (afterObservationId: number, options: { seed?: boolean; limit?: number } = {}) => {
      if (backfillInFlightRef.current || afterObservationId < 0) return;
      backfillInFlightRef.current = true;
      setBackfillStatus(options.seed ? "priming" : "sync");
      try {
        const limit = options.limit ?? (options.seed ? LIVE_INITIAL_SEED_LIMIT : 100);
        const page = await getLiveBackfill(selectedIatas, { afterObservationId, limit });
        const normalized = page.items.map((item) => toLivePacketEvent(item, ++sequenceRef.current));
        const animateCap = options.seed ? Math.min(12, liveVisualCaps(undefined, visualPressureRef.current).activeAnimations + 4) : Math.min(8, liveVisualCaps(undefined, visualPressureRef.current).activeAnimations);
        const animateIds = new Set(normalized.slice(-animateCap).map((event) => event.id));
        let accepted = 0;
        for (const event of normalized) {
          if (acceptLiveEvent(event, { animate: animateIds.has(event.id) })) {
            accepted += 1;
          }
        }
        if (accepted > 0) {
          setBackfillCount((count) => count + accepted);
          setPacketWaitStartedAt(Date.now());
          flushLiveState();
        }
        setBackfillStatus(options.seed ? "ok" : page.hasMore ? "more" : "ok");
      } catch {
        setBackfillStatus("degraded");
      } finally {
        backfillInFlightRef.current = false;
      }
    },
    [acceptLiveEvent, flushLiveState, selectedIatas],
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const event = toLivePacketEvent(data, ++sequenceRef.current);
      acceptLiveEvent(event);
    },
    [acceptLiveEvent],
  );

  useEffect(() => {
    const latestObservationId = liveSummary?.latestObservationId ?? 0;
    if (!isReady || latestObservationId <= 0 || events.length > 0) return;
    const seedKey = `${regionKey}:${latestObservationId}`;
    if (seededLiveCursorRef.current === seedKey) return;
    seededLiveCursorRef.current = seedKey;
    void fetchLiveBackfill(0, { seed: true, limit: LIVE_INITIAL_SEED_LIMIT });
  }, [events.length, fetchLiveBackfill, isReady, liveSummary?.latestObservationId, regionKey]);

  const handleLagged = useCallback(
    (data: WsLagged) => {
      setLaggedCount((count) => count + data.droppedCount);
      const cursor = lastObservationIdRef.current;
      if (cursor > 0) void fetchLiveBackfill(cursor);
    },
    [fetchLiveBackfill],
  );

  useWsPacketHandler(wsManager, handlePacketObservation);
  useWsLaggedHandler(wsManager, handleLagged);
  useWsNodeUpdateHandler(wsManager, useCoalescedNodeUpdates(nodesKey));

  const resumeLive = useCallback(() => {
    flushLiveState();
    setPaused(false);
    setQueuedEvents((queued) => {
      for (const event of queued.slice().reverse()) scheduleAnimation(event);
      setEvents((current) => mergeLiveEventsByObservation(current, queued, LIVE_FEED_CAP));
      return [];
    });
  }, [flushLiveState, scheduleAnimation]);

  const togglePaused = useCallback(() => {
    if (pausedRef.current) resumeLive();
    else setPaused(true);
  }, [resumeLive]);
  const toggleColorByHash = useCallback(() => setColorByHash((v) => !v), []);
  const toggleHeat = useCallback(() => setHeatVisible((v) => !v), []);
  const togglePropagation = useCallback(() => setRealisticPropagation((v) => !v), []);
  const toggleSettings = useCallback(() => {
    setMobileConsoleOpen(false);
    setSettingsOpen((v) => !v);
  }, []);
  const toggleTrails = useCallback(() => setTrails((v) => !v), []);

  const feedClock = Math.floor(now / 5_000);
  const ratePerMin = useMemo(() => countRecent(events, now, 60_000), [events, now]);
  const desktopLiveLayout = viewportWidth >= LIVE_DESKTOP_LAYOUT_WIDTH;
  const compactLiveLayout = viewportWidth < 768;
  const feedVisible = desktopLiveLayout && desktopRailOpen;
  const mobileConsoleExpanded = false;
  const toggleConsole = useCallback(() => {
    if (compactLiveLayout) {
      setSettingsOpen(false);
      setMobileConsoleOpen((value) => !value);
      return;
    }
    setDesktopRailOpen((value) => {
      const next = !value;
      try {
        localStorage.setItem(LIVE_DESKTOP_PANEL_STORAGE_KEY, next ? "rail" : "collapsed");
      } catch {
        // private mode / quota: the toggle remains live for this session
      }
      return next;
    });
  }, [compactLiveLayout]);
  const commandDockStyle = useMemo(() => liveCommandDockStyle(desktopLiveLayout), [desktopLiveLayout]);
  const inspectorRailStyle = useMemo(() => liveInspectorRailStyle(desktopLiveLayout, mobileConsoleExpanded), [desktopLiveLayout, mobileConsoleExpanded]);

  return (
    <div
      className="map-profile-scope relative flex flex-1 min-h-0 overflow-hidden bg-bg-base"
      data-map-profile={visualProfile.id}
      data-map-contrast={visualProfile.effectiveContrast}
      data-map-tint={visualProfile.effectiveTint}
      style={visualProfileStyle}
    >
      <div ref={containerRef} data-dark={isDark} className={`flex-1 min-w-0 ${matrixMode ? "live-map-matrix" : ""}`} />
      <canvas ref={canvasRef} className="live-map-canvas absolute inset-0 z-[5] h-full w-full pointer-events-none" aria-hidden="true" />
      {matrixMode && <div className="live-matrix-overlay absolute inset-0 pointer-events-none z-[6]" aria-hidden="true" />}

      <div className="pointer-events-none absolute top-12 left-2 right-2 z-10 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1.5 md:top-3 md:left-3 md:right-[360px] md:max-w-[calc(100vw-24px)] md:gap-2">
        <div className="crt-float-panel pointer-events-auto flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 md:px-3 md:py-2">
          <span className={`crt-glow-dot w-2.5 h-2.5 rounded-full ${paused ? "bg-warn text-warn" : "bg-green text-green animate-pulse"}`} />
          <span className="font-mono text-xs font-semibold tracking-wider text-text-bright">{paused ? "PAUSED" : "LIVE"}</span>
          <span className="hidden font-mono text-[11px] text-text-dim sm:inline">{regionKey}</span>
          {realisticPropagation && <span className="hidden font-mono text-[10px] text-primary sm:inline">PACE</span>}
          {heatVisible && <span className="hidden font-mono text-[10px] text-warn sm:inline">HEAT</span>}
          {colorByHash && <span className="hidden font-mono text-[10px] text-secondary sm:inline">COLOR</span>}
          {matrixMode && <span className="hidden font-mono text-[10px] text-primary sm:inline">CRT</span>}
          {matrixRain && <span className="hidden font-mono text-[10px] text-primary sm:inline">BYTES</span>}
          {audioEnabled && <span className="hidden font-mono text-[10px] text-primary sm:inline">AUDIO</span>}
        </div>
        <LiveStat className="hidden sm:block" label="Packets" value={formatCount(totalPackets)} tone="green" />
        <LiveStat className="hidden sm:block" label="Rate" value={`${ratePerMin}/m`} />
        <LiveStat className="hidden sm:block" label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "primary"} />
      </div>

      <LoadingPill loading={isPaging} error={nodesError} count={loadedCount} noun="nodes" />
      {!nodePanelOpen && !compactLiveLayout && (desktopRailOpen || settingsOpen) && (
        <LiveInspectorRail
          activeAnimations={activeAnimations}
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          backfillCount={backfillCount}
          backfillStatus={backfillStatus}
          clockTick={feedClock}
          clustered={clustered}
          compact={compactLiveLayout}
          events={events}
          feedVisible={feedVisible}
          laggedCount={laggedCount}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          now={now}
          onAnalyze={onAnalyze}
          onAudioBpmChange={setAudioBpm}
          onAppearanceChange={handleAppearanceChange}
          onAudioVolumeChange={setAudioVolume}
          onClusteredChange={setClustered}
          onSelect={setSelectedEvent}
          onStyleChange={handleStyleChange}
          onToggleAudio={() => setAudioEnabled((value) => !value)}
          onToggleMatrix={() => setMatrixMode((v) => !v)}
          onToggleRain={() => setMatrixRain((v) => !v)}
          onTypeChange={setTypeFilter}
          quality={visualQuality}
          ratePerMin={ratePerMin}
          selectedEvent={selectedEvent ?? undefined}
          settingsOpen={settingsOpen}
          styleId={styleId}
          style={inspectorRailStyle}
          summary={liveSummary}
          totalPackets={totalPackets}
          typeFilter={typeFilter}
          visualDroppedCount={visualDroppedCount}
          waitStartedAt={packetWaitStartedAt}
        />
      )}
      <LiveControlDock
        activeAnimations={activeAnimations}
        colorByHash={colorByHash}
        compact={compactLiveLayout}
        consoleOpen={compactLiveLayout ? mobileConsoleOpen : desktopRailOpen}
        heatVisible={heatVisible}
        laggedCount={laggedCount}
        onToggleColorByHash={toggleColorByHash}
        onToggleConsole={toggleConsole}
        onToggleHeat={toggleHeat}
        onTogglePaused={togglePaused}
        onTogglePropagation={togglePropagation}
        onToggleSettings={toggleSettings}
        onToggleTrails={toggleTrails}
        paused={paused}
        quality={visualQuality}
        queuedCount={queuedEvents.length}
        ratePerMin={ratePerMin}
        realisticPropagation={realisticPropagation}
        settingsOpen={settingsOpen}
        style={commandDockStyle}
        totalPackets={totalPackets}
        trails={trails}
        visualDroppedCount={visualDroppedCount}
        visualQueueSize={visualQueueSize}
      />

      {compactLiveLayout && settingsOpen && (
        <LiveMobileSettingsSheet
          audioBpm={audioBpm}
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          appearanceSettings={appearanceSettings}
          clustered={clustered}
          matrixMode={matrixMode}
          matrixRain={matrixRain}
          onAppearanceChange={handleAppearanceChange}
          onAudioBpmChange={setAudioBpm}
          onAudioVolumeChange={setAudioVolume}
          onClose={() => setSettingsOpen(false)}
          onClusteredChange={setClustered}
          onStyleChange={handleStyleChange}
          onToggleAudio={() => setAudioEnabled((value) => !value)}
          onToggleMatrix={() => setMatrixMode((v) => !v)}
          onToggleRain={() => setMatrixRain((v) => !v)}
          onTypeChange={setTypeFilter}
          styleId={styleId}
          typeFilter={typeFilter}
        />
      )}

      {compactLiveLayout && mobileConsoleOpen && (
        <LiveMobileConsoleSheet
          activeAnimations={activeAnimations}
          backfillStatus={backfillStatus}
          clockTick={feedClock}
          events={events}
          laggedCount={laggedCount}
          now={now}
          onAnalyze={onAnalyze}
          onClose={() => setMobileConsoleOpen(false)}
          onSelect={setSelectedEvent}
          ratePerMin={ratePerMin}
          selectedEvent={selectedEvent ?? undefined}
          summary={liveSummary}
          totalPackets={totalPackets}
          waitStartedAt={packetWaitStartedAt}
        />
      )}

      {error && (
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Live map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
