import { useEffect, type MutableRefObject, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { hashSeed, payloadLabel } from "./live-model";
import {
  LIVE_DRAW_PRESSURE_MS,
  LIVE_DRAW_PRESSURE_RECOVERY_FRAMES,
  LIVE_DRAW_PRESSURE_SLOW_FRAMES,
  LIVE_DRAW_PRESSURE_WARMUP_FRAMES,
  LIVE_DRAW_RECOVERY_MS,
  LIVE_FRAME_TOLERANCE_MS,
  LIVE_PERF_IDLE_GAP_MS,
  LIVE_PERF_SAMPLE_LIMIT,
  LIVE_RESIDUE_FRAME_INTERVAL_MS,
  LIVE_VIEWPORT_PADDING_PX,
  MAX_RAIN_BYTES,
  liveVisualCaps,
  type Coord,
  type LiveAnimation,
  type LiveHeatPoint,
  type LivePathPoint,
  type LivePerfSnapshot,
  type LivePulse,
  type LiveRainDrop,
  type LiveTrail,
  type LiveVisualCaps,
} from "./live-visuals";

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

function tailWindow<T>(items: T[], count: number): T[] {
  return items.length > count ? items.slice(-count) : items;
}

function easeInOutSmooth(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return p * p * (3 - 2 * p);
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

export function useLiveAnimationCanvas(
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
