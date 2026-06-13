import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "../map/useMapLibre";
import { useMapNodes } from "../map/useMapNodes";
import { useMapNodesData } from "../map/useMapNodesData";
import { nodesToFeatureCollection, filterByNodeType } from "../map/node-geojson";
import { MapSettingsPanel } from "../map/MapSettingsPanel";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle } from "../map/types";
import { LoadingPill } from "../../components/LoadingPill";
import { EmptyState } from "../../components/EmptyState";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsLaggedHandler, useWsNodeUpdateHandler, useWsPacketHandler } from "../../hooks/useWsHandlers";
import { getIatas } from "../../api/client";
import { upsertNodePages } from "../nodes/node-updates";
import { formatAbsolute, formatCount, formatHex, timeAgoMs } from "../../lib/formatters";
import type { WsManager } from "../../api/ws-manager";
import type { IataCode, CursorPage } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import type { WsNodeUpdate, WsPacketObservation } from "../../types/ws";
import {
  LIVE_FEED_CAP,
  buildTrueRoutePath,
  countRecent,
  hashColor,
  hashSeed,
  hexBytes,
  mergeQueuedEvents,
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
  createdAt: number;
  lifetimeMs: number;
  color: string;
  strength: number;
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
const MAX_ACTIVE_ANIMATIONS = 10;
const MAX_HEAT_POINTS = 48;
const MAX_TRAILS = 12;
const MAX_PULSES = 20;
const MAX_RAIN_DROPS = 6;
const COMPACT_LIVE_WIDTH = 640;
const COMPACT_ACTIVE_ANIMATIONS = 7;
const COMPACT_HEAT_POINTS = 28;
const COMPACT_TRAILS = 8;
const COMPACT_PULSES = 12;
const COMPACT_RAIN_DROPS = 3;
const MAX_RAIN_BYTES = 14;
const MAX_MATRIX_FLIGHT_BYTES = 8;
const VISUAL_DRAIN_INTERVAL_MS = 115;
const LIVE_RESIDUE_FRAME_INTERVAL_MS = 140;
const LIVE_PERF_SAMPLE_LIMIT = 180;
const LIVE_PERF_IDLE_GAP_MS = 250;
const LIVE_FRAME_TARGET_MS = 1000 / 60;
const LIVE_FRAME_TOLERANCE_MS = 3;
const LIVE_DRAW_PRESSURE_MS = 7;
const LIVE_DRAW_RECOVERY_MS = 3;
const LIVE_DRAW_PRESSURE_WARMUP_FRAMES = 30;
const LIVE_DRAW_PRESSURE_SLOW_FRAMES = 8;
const LIVE_DRAW_PRESSURE_RECOVERY_FRAMES = 120;
const LIVE_STATE_FLUSH_MS = 250;
const AUDIO_MIN_INTERVAL_MS = 85;
const AUDIO_SCALE = [220, 247, 277, 330, 370, 415, 494, 554, 659, 740, 831, 988];

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
  targetFrameMs: number;
  trails: number;
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
      targetFrameMs: 1000 / 30,
      trails: Math.min(COMPACT_TRAILS, 5),
    };
  }

  if (quality === "balanced") {
    return {
      activeAnimations: compact ? COMPACT_ACTIVE_ANIMATIONS : 8,
      dprLimit: compact ? 1 : 1.15,
      heatPoints: compact ? COMPACT_HEAT_POINTS : 36,
      labels: !compact,
      pulses: compact ? COMPACT_PULSES : 16,
      pulseRings: 1,
      quality,
      rainDrops: compact ? COMPACT_RAIN_DROPS : 4,
      shadows: true,
      targetFrameMs: compact ? 1000 / 45 : LIVE_FRAME_TARGET_MS,
      trails: compact ? COMPACT_TRAILS : 10,
    };
  }

  return {
    activeAnimations: MAX_ACTIVE_ANIMATIONS,
    dprLimit: 1.25,
    heatPoints: MAX_HEAT_POINTS,
    labels: true,
    pulses: MAX_PULSES,
    pulseRings: 2,
    quality,
    rainDrops: MAX_RAIN_DROPS,
    shadows: true,
    targetFrameMs: LIVE_FRAME_TARGET_MS,
    trails: MAX_TRAILS,
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
      name: node.name,
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

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
  onActiveCount: (count: number) => void,
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
    let lastPerfPublishedAt = 0;
    let lastRenderedAt = 0;
    let canvasHasContent = false;
    let cssHeight = 1;
    let cssWidth = 1;
    let drawPressure = 0;
    let drawCostEma = 0;
    let recoveryFrames = 0;
    let slowFrames = 0;
    const frameSamples: number[] = [];
    const matrixColor = readCssVar("--color-green", "#22C55E");
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
      cssWidth = width;
      cssHeight = height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      projectedPathCache = new WeakMap();
      projectedCoordCache.clear();
      requestFrame();
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

    const hasFrameWork = () =>
      animationsRef.current.length > 0 ||
      pulsesRef.current.length > 0 ||
      (trailsEnabled && trailsRef.current.length > 0) ||
      (rainEnabled && rainRef.current.length > 0) ||
      (heatEnabled && heatRef.current.length > 0);

    const publishPerfSnapshot = (now: number, frameMs: number, drawStartedAt: number, caps: LiveVisualCaps) => {
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
      const currentCaps = liveVisualCaps(cssWidth, drawPressure);
      if (lastRenderedAt > 0 && frameAge >= 0 && frameAge < currentCaps.targetFrameMs - LIVE_FRAME_TOLERANCE_MS) {
        requestFrame();
        return;
      }
      const frameMs = lastRenderedAt > 0 ? frameAge : 0;
      lastRenderedAt = now;
      drawCount += 1;
      const drawStartedAt = performance.now();

      const frameCaps = liveVisualCaps(cssWidth, drawPressure);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const nextHeat: LiveHeatPoint[] = [];
      if (heatEnabled) {
        for (const heat of heatRef.current) {
          const age = now - heat.createdAt;
          if (age > heat.lifetimeMs) continue;
          nextHeat.push(heat);

          const progress = Math.max(0, Math.min(1, age / heat.lifetimeMs));
          const point = projectCoord(heat.coord);
          const radius = 16 + Math.min(22, heat.intensity * 5) + 12 * (1 - progress);
          const alpha = (1 - progress) * Math.min(0.08, 0.03 + heat.intensity * 0.014);
          const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
          gradient.addColorStop(0, `rgba(255, 87, 34, ${alpha})`);
          gradient.addColorStop(0.38, `rgba(255, 202, 40, ${alpha * 0.5})`);
          gradient.addColorStop(0.72, `rgba(66, 165, 245, ${alpha * 0.24})`);
          gradient.addColorStop(1, "rgba(13, 71, 161, 0)");

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ctx.fill();
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
          nextTrails.push(trail);

          const progress = Math.max(0, Math.min(1, age / trail.lifetimeMs));
          const trailPath = trail.path.length >= 2 ? trail.path : [
            { coord: trail.from, label: "source", nodeId: `${trail.id}:source` },
            { coord: trail.to, label: "observer", nodeId: `${trail.id}:observer` },
          ];
          const projectedTrail = projectPath(trailPath);
          const color = matrixMode ? matrixColor : trail.color;

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (1 - progress) * (matrixMode ? 0.16 : 0.085);
          ctx.strokeStyle = color;
          ctx.lineWidth = matrixMode ? 1 : 1.25;
          ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 4 : 1.75) : 0;
          ctx.shadowColor = color;
          drawProjectedPath(projectedTrail);
          ctx.stroke();
          ctx.restore();
        }
      } else if (trailsRef.current.length) {
        trailsRef.current = [];
      }

      const nextPulses: LivePulse[] = [];
      for (const pulse of pulsesRef.current) {
        const age = now - pulse.createdAt;
        if (age < 0) {
          nextPulses.push(pulse);
          continue;
        }
        if (age > pulse.lifetimeMs) continue;
        nextPulses.push(pulse);

        const progress = Math.max(0, Math.min(1, age / pulse.lifetimeMs));
        const point = projectCoord(pulse.coord);
        const color = matrixMode ? matrixColor : pulse.color;
        const energy = Math.min(2.5, Math.max(1, pulse.strength));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 8 : 5) : 0;

        ctx.globalAlpha = (matrixMode ? 0.24 : 0.18) * (1 - progress);
        ctx.lineWidth = 1.3 + energy * 0.28;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6 + 24 * progress, 0, Math.PI * 2);
        ctx.stroke();

        if (frameCaps.pulseRings > 1) {
          ctx.globalAlpha = 0.04 * (1 - progress);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 12 + 36 * progress, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = Math.max(0.07, 0.22 * (1 - progress));
        ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 6 : 4) : 0;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 + energy * 0.8, 0, Math.PI * 2);
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
              ctx.font = `700 ${matrixMode ? 16 : 14}px JetBrains Mono, monospace`;
              ctx.fillStyle = matrixMode ? "#FFFFFF" : drop.color;
              ctx.shadowColor = matrixMode ? matrixColor : drop.color;
              ctx.shadowBlur = frameCaps.shadows ? (matrixMode ? 9 : 6) : 0;
            } else {
              ctx.globalAlpha = fade * (matrixMode ? 0.42 : 0.26);
              ctx.font = `${matrixMode ? 13 : 12}px JetBrains Mono, monospace`;
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
      for (const anim of animationsRef.current.slice(-frameCaps.activeAnimations)) {
        const age = now - anim.startedAt;
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
              lifetimeMs: matrixMode ? 5_000 : 6_000,
              color: anim.color,
            });
          }
          continue;
        }
        next.push(anim);

        const progress = Math.min(1, Math.max(0, age / anim.durationMs));
        const eased = 1 - (1 - progress) ** 3;
        const animPath = anim.path.length >= 2 ? anim.path : [
          { coord: anim.from, label: "source", nodeId: `${anim.id}:source` },
          { coord: anim.to, label: "observer", nodeId: `${anim.id}:observer` },
        ];
        const projectedPath = projectPath(animPath);
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
              ctx.font = `${i === 0 ? "700 " : ""}${Math.max(10, 15 - i)}px JetBrains Mono, monospace`;
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

        if (frameCaps.labels && pathDistance > 72 && progress > 0.16 && progress < 0.9) {
          ctx.globalAlpha = matrixMode ? 0.28 : 0.19;
          ctx.shadowBlur = 0;
          ctx.font = "10px JetBrains Mono, monospace";
          ctx.fillStyle = color;
          ctx.fillText(payloadLabel(anim.event.payloadTypeName).slice(0, 10), x + 8, y - 8);
        }
        ctx.restore();
      }

      const cappedNext = next.slice(-frameCaps.activeAnimations);
      animationsRef.current = cappedNext;
      trailsRef.current = [...nextTrails, ...finishedTrails].slice(-frameCaps.trails);
      pulsesRef.current = nextPulses.slice(-frameCaps.pulses);
      rainRef.current = nextRain.slice(-frameCaps.rainDrops);
      heatRef.current = nextHeat.slice(-frameCaps.heatPoints);
      if (lastPublishedCount !== cappedNext.length) {
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
    pulsesRef,
    rainEnabled,
    rainRef,
    trailsEnabled,
    trailsRef,
  ]);
}

function LiveStat({
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
    <div className={`min-w-18 px-3 py-2 bg-bg-surface/88 border border-border rounded backdrop-blur ${className}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`font-mono text-lg leading-none font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LiveControlButton({
  active,
  className = "",
  danger,
  label,
  onClick,
  title,
}: {
  active?: boolean;
  className?: string;
  danger?: boolean;
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
      className={`shrink-0 rounded border px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors md:px-2.5 md:text-[11px] ${activeClass} ${className}`}
      onClick={onClick}
      aria-pressed={active}
      title={title}
    >
      {label}
    </button>
  );
}

function LiveControlDock({
  activeAnimations,
  audioBpm,
  audioEnabled,
  audioVolume,
  colorByHash,
  feedVisible,
  heatVisible,
  laggedCount,
  matrixRain,
  matrixMode,
  onClear,
  onAudioBpmChange,
  onAudioVolumeChange,
  onToggleColorByHash,
  onToggleAudio,
  onToggleFeed,
  onToggleHeat,
  onToggleMatrix,
  onToggleRain,
  onTogglePaused,
  onTogglePropagation,
  onToggleTrails,
  paused,
  queuedCount,
  ratePerMin,
  realisticPropagation,
  totalPackets,
  trails,
  visualDroppedCount,
  visualQueueSize,
}: {
  activeAnimations: number;
  audioBpm: number;
  audioEnabled: boolean;
  audioVolume: number;
  colorByHash: boolean;
  feedVisible: boolean;
  heatVisible: boolean;
  laggedCount: number;
  matrixRain: boolean;
  matrixMode: boolean;
  onClear: () => void;
  onAudioBpmChange: (value: number) => void;
  onAudioVolumeChange: (value: number) => void;
  onToggleAudio: () => void;
  onToggleColorByHash: () => void;
  onToggleFeed: () => void;
  onToggleHeat: () => void;
  onToggleMatrix: () => void;
  onToggleRain: () => void;
  onTogglePaused: () => void;
  onTogglePropagation: () => void;
  onToggleTrails: () => void;
  paused: boolean;
  queuedCount: number;
  ratePerMin: number;
  realisticPropagation: boolean;
  totalPackets: number;
  trails: boolean;
  visualDroppedCount: number;
  visualQueueSize: number;
}) {
  return (
    <div className="absolute left-2 right-2 bottom-2 z-20 flex max-w-[calc(100vw-16px)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded border border-border bg-bg-surface/88 p-1.5 shadow-xl backdrop-blur md:left-auto md:right-3 md:bottom-3 md:w-fit md:max-w-[calc(100vw-24px)] md:flex-wrap md:gap-2 md:p-2">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 pr-1 md:gap-2">
        <LiveControlButton label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-wider md:px-2.5 md:text-[11px] ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-warn" : "bg-green animate-pulse"}`} />
          {paused ? "PAUSED" : "LIVE"}
        </div>
        <div className="hidden min-w-0 items-center gap-3 font-mono text-[11px] text-text-muted xl:flex">
          <span>{formatCount(totalPackets)} pkts</span>
          <span>{ratePerMin}/m</span>
          <span>{activeAnimations} active</span>
          {queuedCount > 0 && <span className="text-warn">{queuedCount} queued</span>}
          {visualQueueSize > 0 && <span className="text-primary">{visualQueueSize} visual q</span>}
          {laggedCount > 0 && <span className="text-danger">{laggedCount} dropped</span>}
          {visualDroppedCount > 0 && <span className="text-warn">{visualDroppedCount} visual skipped</span>}
        </div>
      </div>

      <LiveControlButton label="Trails" active={trails} onClick={onToggleTrails} title="Toggle persistent map trails" />
      <LiveControlButton label="Pace" active={realisticPropagation} onClick={onTogglePropagation} title="Pace repeated observations before rendering" />
      <LiveControlButton className="hidden sm:inline-flex" label="Heat" active={heatVisible} onClick={onToggleHeat} title="Toggle live activity heat overlay" />
      <LiveControlButton className="hidden sm:inline-flex" label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
      <LiveControlButton className="hidden sm:inline-flex" label="Matrix" active={matrixMode} onClick={onToggleMatrix} title="Toggle matrix scan view" />
      <LiveControlButton className="hidden sm:inline-flex" label="Rain" active={matrixRain} onClick={onToggleRain} title="Toggle packet byte rain" />
      <LiveControlButton className="hidden sm:inline-flex" label="Audio" active={audioEnabled} onClick={onToggleAudio} title="Sonify paced live packets" />
      {audioEnabled && (
        <div className="hidden shrink-0 items-center gap-2 rounded border border-border bg-bg-raised px-2 py-1 font-mono text-[10px] font-semibold text-text-muted sm:flex">
          <label className="flex items-center gap-1">
            VOL
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audioVolume * 100)}
              onChange={(event) => onAudioVolumeChange(Number(event.currentTarget.value) / 100)}
              className="h-1.5 w-12 accent-primary sm:w-16"
              aria-label="Audio volume"
            />
          </label>
          <label className="hidden items-center gap-1 lg:flex">
            BPM
            <input
              type="range"
              min={60}
              max={240}
              value={audioBpm}
              onChange={(event) => onAudioBpmChange(Number(event.currentTarget.value))}
              className="h-1.5 w-14 accent-primary"
              aria-label="Audio BPM"
            />
          </label>
        </div>
      )}
      <LiveControlButton label="Feed" active={feedVisible} onClick={onToggleFeed} title="Toggle packet feed" />
      <LiveControlButton className="hidden sm:inline-flex" label="Clear" danger onClick={onClear} title="Clear local live buffer" />
    </div>
  );
}

function LiveFeed({
  events,
  onAnalyze,
}: {
  events: LivePacketEvent[];
  onAnalyze: (hash: string) => void;
}) {
  return (
    <div className="absolute left-3 bottom-[92px] md:bottom-3 z-10 w-[min(430px,calc(100vw-24px))] max-h-[36dvh] sm:max-h-[42dvh] flex flex-col bg-bg-surface/90 border border-border rounded backdrop-blur shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Packet Feed</div>
        <div className="font-mono text-[11px] text-text-dim">{events.length}/{LIVE_FEED_CAP}</div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs font-mono text-text-dim">Waiting for packets</div>
        ) : (
          events.slice(0, 18).map((event) => (
            <button
              key={event.id}
              type="button"
              className="w-full grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 px-3 py-2 text-left border-b border-border-subtle/70 hover:bg-white/3 transition-colors"
              onClick={() => onAnalyze(event.packetHash)}
            >
              <span
                className="mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]"
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
}

function PayloadLegend({ payloads }: { payloads: Array<{ typeName: string; count: number; color: string }> }) {
  return (
    <div className="absolute right-3 bottom-[86px] z-10 hidden lg:block w-56 bg-bg-surface/85 border border-border rounded backdrop-blur">
      <div className="px-3 py-2 border-b border-border-subtle font-mono text-[11px] uppercase tracking-wider text-text-muted">Payloads</div>
      <div className="p-3 space-y-2">
        {(payloads.length ? payloads : Object.entries({ ADVERT: 0, GRP_TXT: 0, TRACE: 0, ACK: 0 })).map((payload) => {
          const typeName = Array.isArray(payload) ? payload[0] : payload.typeName;
          const count = Array.isArray(payload) ? payload[1] : payload.count;
          const color = Array.isArray(payload) ? payloadColor(typeName) : payload.color;
          const label = payloadLabel(typeName);
          return (
            <div key={label} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
              <span className="flex-1 text-text-muted truncate">{label}</span>
              <span className="text-text-dim">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiveView({ wsManager, onAnalyze }: LiveViewProps) {
  const queryClient = useQueryClient();
  const { iatas: selectedIatas, regionKey } = useRegion();
  const { themeId, themes } = useTheme();
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
  const publishedVisualQueueSizeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioEnabledRef = useRef(false);
  const audioVolumeRef = useRef(0.22);
  const audioBpmRef = useRef(132);
  const lastAudioAtRef = useRef(0);
  const propagationGroupsRef = useRef(new Map<string, PropagationGroup>());
  const sequenceRef = useRef(0);
  const pausedRef = useRef(false);

  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
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
  const [feedVisible, setFeedVisible] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [totalPackets, setTotalPackets] = useState(0);
  const [laggedCount, setLaggedCount] = useState(0);
  const [visualQueueSize, setVisualQueueSize] = useState(0);
  const [visualDroppedCount, setVisualDroppedCount] = useState(0);
  const [activeAnimations, setActiveAnimations] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

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
      setEvents((items) => [...newestFirst, ...items].slice(0, LIVE_FEED_CAP));
    }

    const pendingQueuedEvents = pendingQueuedEventsRef.current;
    if (pendingQueuedEvents.length > 0) {
      pendingQueuedEventsRef.current = [];
      const newestFirst = pendingQueuedEvents.slice().reverse();
      setQueuedEvents((items) => [...newestFirst, ...items].slice(0, LIVE_FEED_CAP));
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
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const handleStyleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  }, []);

  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);

  const { data: iataCodes } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });
  const nodesKey = useMemo(() => ["map-nodes", regionKey], [regionKey]);
  const { nodes, loadedCount, isPaging, isError: nodesError } = useMapNodesData(selectedIatas, regionKey);
  const { byKey: nodeCoords, byPathPrefix } = useMemo(() => buildNodeCoordMaps(nodes), [nodes]);
  const iataCoords = useMemo(() => buildIataCoordMap(iataCodes), [iataCodes]);

  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, null, handleStyleError);
  const isDark = resolveMapStyle(styleId).dark;

  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, clustered, setSelectedNodeId, selectedNodeId, `${regionKey}:${typeFilter}`);

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
      const caps = liveVisualCaps();
      const color = colorByHash ? hashColor(event.packetHash) : payloadColor(event.payloadTypeName);
      const startedAt = performance.now();
      const observerTarget = resolveObserverTarget(event, nodeCoords, iataCoords);
      const path = buildTrueRoutePath(event, observerTarget?.node ?? null, byPathPrefix, MAX_HOPS_PER_PACKET);
      const routeFrom = path?.[0]?.coord;
      const routeTo = path?.at(-1)?.coord;
      const hasRoute = Boolean(routeFrom && routeTo && !sameRouteCoord(routeFrom, routeTo));
      const targetCoord = observerTarget?.coord ?? routeTo;
      if (!targetCoord && !hasRoute) return false;

      if (targetCoord) {
        pulsesRef.current = [
          ...pulsesRef.current.slice(-(caps.pulses - 1)),
          {
            id: `${event.id}:observer`,
            coord: targetCoord,
            createdAt: startedAt,
            lifetimeMs: matrixMode ? 2_600 : 3_400,
            color,
            strength: event.observationCount,
          },
        ];
      }

      const knownHopPulses = path?.slice(0, -1).slice(-4) ?? [];
      if (knownHopPulses.length > 0) {
        pulsesRef.current = [
          ...pulsesRef.current.slice(-Math.max(0, caps.pulses - knownHopPulses.length)),
          ...knownHopPulses.map((point, index) => ({
            id: `${event.id}:hop:${point.nodeId}:${index}`,
            coord: point.coord,
            createdAt: startedAt + 100 * index,
            lifetimeMs: matrixMode ? 2_200 : 2_900,
            color,
            strength: 1,
          })),
        ];
      }

      if (heatVisible) {
        const heatSource = path && path.length > 0 ? path : targetCoord ? [{ coord: targetCoord }] : [];
        const heatPoints = heatSource.slice(-MAX_HOPS_PER_PACKET).map((point, index) => ({
          id: `${event.id}:heat:${index}`,
          coord: point.coord,
          createdAt: startedAt,
          lifetimeMs: 14_000,
          intensity: Math.max(1, Math.min(4, event.observationCount + 0.4)),
        }));
        heatRef.current = [...heatRef.current.slice(-Math.max(0, caps.heatPoints - heatPoints.length)), ...heatPoints].slice(-caps.heatPoints);
      }

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
        const durationMs = 1_850 + Math.min(1_000, Math.max(0, path.length - 2) * 280);
        animationsRef.current = [
          ...animationsRef.current.slice(-(caps.activeAnimations - 1)),
          {
            id: event.id,
            event,
            from: routeFrom,
            to: routeTo,
            path,
            startedAt,
            durationMs,
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
    [byPathPrefix, colorByHash, heatVisible, iataCoords, matrixMode, matrixRain, nodeCoords, playPacketAudio],
  );

  const queueAnimation = useCallback(
    (request: LiveAnimationRequest) => {
      const caps = liveVisualCaps();
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
      const caps = liveVisualCaps();
      const active = animationsRef.current.length;
      const queued = visualQueueRef.current.length;
      if (queued > 0 && active < caps.activeAnimations) {
        const batchSize = active < caps.activeAnimations / 2 ? 2 : 1;
        const slots = Math.min(batchSize, caps.activeAnimations - active, queued);
        for (let i = 0; i < slots; i += 1) {
          const next = visualQueueRef.current.shift();
          if (!next) break;
          playAnimation(next.event, next.waveIndex, next.waveCount);
        }
      }
      if (publishedVisualQueueSizeRef.current !== visualQueueRef.current.length) {
        publishedVisualQueueSizeRef.current = visualQueueRef.current.length;
        setVisualQueueSize(visualQueueRef.current.length);
      }
    }, VISUAL_DRAIN_INTERVAL_MS);

    return () => clearInterval(id);
  }, [playAnimation]);

  const flushPropagationGroup = useCallback(
    (packetHash: string) => {
      const group = propagationGroupsRef.current.get(packetHash);
      if (!group) return;
      propagationGroupsRef.current.delete(packetHash);

      const ordered = group.events
        .slice()
        .sort((a, b) => a.receivedAt - b.receivedAt || a.sequence - b.sequence);
      const sampled = samplePropagationEvents(ordered);
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
        current.events.push(event);
        return;
      }

      const timer = setTimeout(() => flushPropagationGroup(event.packetHash), 420);
      propagationGroupsRef.current.set(event.packetHash, { events: [event], timer });
    },
    [flushPropagationGroup, queueAnimation, realisticPropagation],
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
    setActiveAnimations,
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const event = toLivePacketEvent(data, ++sequenceRef.current);
      pendingTotalPacketsRef.current += 1;
      if (pausedRef.current) {
        pendingQueuedEventsRef.current.push(event);
        if (pendingQueuedEventsRef.current.length > LIVE_FEED_CAP) {
          pendingQueuedEventsRef.current = pendingQueuedEventsRef.current.slice(-LIVE_FEED_CAP);
        }
        scheduleLiveStateFlush();
        return;
      }
      scheduleAnimation(event);
      pendingEventsRef.current.push(event);
      if (pendingEventsRef.current.length > LIVE_FEED_CAP) {
        pendingEventsRef.current = pendingEventsRef.current.slice(-LIVE_FEED_CAP);
      }
      scheduleLiveStateFlush();
    },
    [scheduleAnimation, scheduleLiveStateFlush],
  );

  const handleLagged = useCallback((data: { droppedCount: number }) => {
    setLaggedCount((count) => count + data.droppedCount);
  }, []);

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(nodesKey, (old) =>
        upsertNodePages(old, data),
      );
    },
    [nodesKey, queryClient],
  );

  useWsPacketHandler(wsManager, handlePacketObservation);
  useWsLaggedHandler(wsManager, handleLagged);
  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  const resumeLive = () => {
    flushLiveState();
    setPaused(false);
    setQueuedEvents((queued) => {
      for (const event of queued.slice().reverse()) scheduleAnimation(event);
      setEvents((current) => mergeQueuedEvents(current, queued));
      return [];
    });
  };

  const clearFeed = () => {
    if (liveStateFlushTimerRef.current !== 0) {
      window.clearTimeout(liveStateFlushTimerRef.current);
      liveStateFlushTimerRef.current = 0;
    }
    for (const group of propagationGroupsRef.current.values()) clearTimeout(group.timer);
    propagationGroupsRef.current.clear();
    pendingEventsRef.current = [];
    pendingQueuedEventsRef.current = [];
    pendingTotalPacketsRef.current = 0;
    pendingVisualDroppedRef.current = 0;
    setEvents([]);
    setQueuedEvents([]);
    setLaggedCount(0);
    animationsRef.current = [];
    trailsRef.current = [];
    pulsesRef.current = [];
    rainRef.current = [];
    heatRef.current = [];
    visualQueueRef.current = [];
    publishedVisualQueueSizeRef.current = 0;
    setVisualQueueSize(0);
    setVisualDroppedCount(0);
    requestCanvasFrameRef.current?.();
  };

  const ratePerMin = countRecent(events, now, 60_000);
  const payloads = topPayloads(events);
  const newest = events[0];

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-bg-base">
      <div ref={containerRef} data-dark={isDark} className={`flex-1 min-w-0 ${matrixMode ? "live-map-matrix" : ""}`} />
      <canvas ref={canvasRef} className="absolute inset-0 z-[5] h-full w-full pointer-events-none" aria-hidden="true" />
      {matrixMode && <div className="live-matrix-overlay absolute inset-0 pointer-events-none z-[6]" aria-hidden="true" />}

      <div className="pointer-events-none absolute top-12 left-2 right-2 z-10 flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1.5 md:top-3 md:left-[268px] md:right-3 md:max-w-[calc(100vw-24px)] md:gap-2 xl:right-[308px]">
        <div className="pointer-events-auto flex items-center gap-2 rounded border border-border bg-bg-surface/86 px-2.5 py-1.5 backdrop-blur md:px-3 md:py-2">
          <span className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-warn" : "bg-green animate-pulse"}`} />
          <span className="font-mono text-xs font-semibold tracking-wider text-text-bright">{paused ? "PAUSED" : "LIVE"}</span>
          <span className="hidden font-mono text-[11px] text-text-dim sm:inline">{regionKey}</span>
          {realisticPropagation && <span className="hidden font-mono text-[10px] text-primary sm:inline">PACE</span>}
          {heatVisible && <span className="hidden font-mono text-[10px] text-warn sm:inline">HEAT</span>}
          {colorByHash && <span className="hidden font-mono text-[10px] text-secondary sm:inline">COLOR</span>}
          {matrixMode && <span className="hidden font-mono text-[10px] text-green sm:inline">MATRIX</span>}
          {matrixRain && <span className="hidden font-mono text-[10px] text-green sm:inline">RAIN</span>}
          {audioEnabled && <span className="hidden font-mono text-[10px] text-primary sm:inline">AUDIO</span>}
        </div>
        <LiveStat className="hidden sm:block" label="Packets" value={formatCount(totalPackets)} tone="green" />
        <LiveStat className="hidden sm:block" label="Rate" value={`${ratePerMin}/m`} />
        <LiveStat className="hidden sm:block" label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "primary"} />
      </div>

      {newest && (
        <div className="absolute top-3 right-3 z-10 hidden xl:block w-72 bg-bg-surface/85 border border-border rounded backdrop-blur">
          <div className="px-3 py-2 border-b border-border-subtle font-mono text-[11px] uppercase tracking-wider text-text-muted">Latest Packet</div>
          <button type="button" className="w-full p-3 text-left hover:bg-white/3 transition-colors" onClick={() => onAnalyze(newest.packetHash)}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-text-bright">{payloadLabel(newest.payloadTypeName)}</span>
              <span className="font-mono text-xs text-primary">{formatHex(newest.packetHash)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-text-muted">
              <span>{newest.iata}</span>
              <span className="text-right">{timeAgoMs(newest.receivedAt)}</span>
              <span>{newest.rssi} dBm</span>
              <span className="text-right">{newest.snr.toFixed(1)} dB</span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-text-dim truncate" title={formatAbsolute(newest.heardAt, { ms: true })}>
              {newest.observerName || newest.observerId}
            </div>
          </button>
        </div>
      )}

      <MapSettingsPanel
        styleId={styleId}
        onStyleChange={handleStyleChange}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        clustered={clustered}
        onClusteredChange={setClustered}
      />
      <LoadingPill loading={isPaging} error={nodesError} count={loadedCount} noun="nodes" />
      {feedVisible && <LiveFeed events={events} onAnalyze={onAnalyze} />}
      <PayloadLegend payloads={payloads} />
      <LiveControlDock
        activeAnimations={activeAnimations}
        audioBpm={audioBpm}
        audioEnabled={audioEnabled}
        audioVolume={audioVolume}
        colorByHash={colorByHash}
        feedVisible={feedVisible}
        heatVisible={heatVisible}
        laggedCount={laggedCount}
        matrixRain={matrixRain}
        matrixMode={matrixMode}
        onClear={clearFeed}
        onAudioBpmChange={setAudioBpm}
        onAudioVolumeChange={setAudioVolume}
        onToggleAudio={() => setAudioEnabled((value) => !value)}
        onToggleColorByHash={() => setColorByHash((v) => !v)}
        onToggleFeed={() => setFeedVisible((v) => !v)}
        onToggleHeat={() => setHeatVisible((v) => !v)}
        onToggleMatrix={() => setMatrixMode((v) => !v)}
        onToggleRain={() => setMatrixRain((v) => !v)}
        onTogglePaused={paused ? resumeLive : () => setPaused(true)}
        onTogglePropagation={() => setRealisticPropagation((v) => !v)}
        onToggleTrails={() => setTrails((v) => !v)}
        paused={paused}
        queuedCount={queuedEvents.length}
        ratePerMin={ratePerMin}
        realisticPropagation={realisticPropagation}
        totalPackets={totalPackets}
        trails={trails}
        visualDroppedCount={visualDroppedCount}
        visualQueueSize={visualQueueSize}
      />

      {error && (
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Live map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
