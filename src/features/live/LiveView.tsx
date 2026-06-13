import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  countRecent,
  hashColor,
  hashSeed,
  hexBytes,
  mergeQueuedEvents,
  payloadColor,
  payloadLabel,
  prependBounded,
  toLivePacketEvent,
  topPayloads,
  type LivePacketEvent,
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
  createdAt: number;
  lifetimeMs: number;
  color: string;
}

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
  iatas: string[];
}

const MAX_ACTIVE_ANIMATIONS = 24;
const MAX_PENDING_ANIMATIONS = 96;
const MAX_PROPAGATION_WAVE_PATHS = 8;
const MAX_TRAILS = 56;
const MAX_PULSES = 64;
const MAX_RAIN_DROPS = 34;
const MAX_RAIN_BYTES = 24;
const MAX_MATRIX_FLIGHT_BYTES = 12;
const VISUAL_DRAIN_INTERVAL_MS = 90;
const LIVE_FLOW_CAMERA_THROTTLE_MS = 2_800;
const LIVE_FLOW_CAMERA_MIN_LAT_SPAN = 1.4;
const LIVE_FLOW_CAMERA_MIN_LNG_SPAN = 1.8;

function key(value: string): string {
  return value.trim().toLowerCase();
}

function buildNodeCoordMaps(nodes: NodeSummary[]) {
  const byKey = new Map<string, NodeCoord>();
  const byIata = new Map<string, NodeCoord[]>();

  for (const node of nodes) {
    if (node.lat == null || node.lng == null) continue;
    const coord: NodeCoord = {
      id: node.id,
      name: node.name,
      lng: node.lng,
      lat: node.lat,
      iatas: node.iatas.map((i) => i.iata.toUpperCase()),
    };
    byKey.set(key(node.id), coord);
    byKey.set(key(node.publicKey), coord);
    if (node.observerId) byKey.set(key(node.observerId), coord);
    for (const iata of coord.iatas) {
      const bucket = byIata.get(iata) ?? [];
      bucket.push(coord);
      byIata.set(iata, bucket);
    }
  }

  return { byKey, byIata };
}

function buildIataCoordMap(iatas: IataCode[] | undefined): Map<string, Coord> {
  const map = new Map<string, Coord>();
  for (const iata of iatas ?? []) {
    if (iata.lat == null || iata.lon == null) continue;
    map.set(iata.iata.toUpperCase(), { lat: iata.lat, lng: iata.lon });
  }
  return map;
}

function offsetCoord(to: Coord, seed: number): Coord {
  const angle = ((seed % 360) * Math.PI) / 180;
  const distance = 3.4 + ((seed >>> 8) % 220) / 42;
  const lngScale = Math.max(0.25, Math.cos((to.lat * Math.PI) / 180));
  return {
    lat: Math.max(-85, Math.min(85, to.lat + Math.sin(angle) * distance)),
    lng: Math.max(-180, Math.min(180, to.lng + (Math.cos(angle) * distance) / lngScale)),
  };
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function resolvePacketCoords(
  event: LivePacketEvent,
  nodeCoords: Map<string, NodeCoord>,
  nodesByIata: Map<string, NodeCoord[]>,
  iataCoords: Map<string, Coord>,
  previousByHash: Map<string, Coord>,
): { from: Coord; to: Coord } | null {
  const observerNode = nodeCoords.get(key(event.observerId));
  const to = observerNode ?? iataCoords.get(event.iata.toUpperCase());
  if (!to) return null;

  const previous = previousByHash.get(event.packetHash);
  if (previous) {
    const samePoint = Math.abs(previous.lat - to.lat) <= 0.0001 && Math.abs(previous.lng - to.lng) <= 0.0001;
    return { from: samePoint ? offsetCoord(to, hashSeed(`${event.packetHash}:${event.sequence}`)) : previous, to };
  }

  const peers = nodesByIata.get(event.iata.toUpperCase());
  if (peers && peers.length > 1) {
    const seed = hashSeed(event.packetHash);
    const peer = peers[seed % peers.length]!;
    if (Math.abs(peer.lat - to.lat) > 0.0001 || Math.abs(peer.lng - to.lng) > 0.0001) {
      return { from: peer, to };
    }
  }

  return { from: offsetCoord(to, hashSeed(event.packetHash)), to };
}

function paddedPathBounds(from: Coord, to: Coord): [[number, number], [number, number]] {
  const centerLat = (from.lat + to.lat) / 2;
  const centerLng = (from.lng + to.lng) / 2;
  const latSpan = Math.max(Math.abs(from.lat - to.lat), LIVE_FLOW_CAMERA_MIN_LAT_SPAN);
  const lngSpan = Math.max(Math.abs(from.lng - to.lng), LIVE_FLOW_CAMERA_MIN_LNG_SPAN);
  const south = Math.max(-85, centerLat - latSpan / 2);
  const north = Math.min(85, centerLat + latSpan / 2);
  const west = Math.max(-180, centerLng - lngSpan / 2);
  const east = Math.min(180, centerLng + lngSpan / 2);

  return [
    [west, south],
    [east, north],
  ];
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
  isReady: boolean,
  animationsRef: RefObject<LiveAnimation[]>,
  trailsRef: RefObject<LiveTrail[]>,
  pulsesRef: RefObject<LivePulse[]>,
  rainRef: RefObject<LiveRainDrop[]>,
  trailsEnabled: boolean,
  rainEnabled: boolean,
  matrixMode: boolean,
  onActiveCount: (count: number) => void,
) {
  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas || !isReady) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastPublishedCount = -1;
    const matrixColor = readCssVar("--color-green", "#22C55E");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const fallbackRect = canvas.parentElement?.getBoundingClientRect();
      const width = rect.width || fallbackRect?.width || 1;
      const height = rect.height || fallbackRect?.height || 1;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const nextTrails: LiveTrail[] = [];
      if (trailsEnabled) {
        for (const trail of trailsRef.current) {
          const age = now - trail.createdAt;
          if (age > trail.lifetimeMs) continue;
          nextTrails.push(trail);

          const progress = Math.max(0, Math.min(1, age / trail.lifetimeMs));
          const from = map.project([trail.from.lng, trail.from.lat]);
          const to = map.project([trail.to.lng, trail.to.lat]);
          const color = matrixMode ? matrixColor : trail.color;

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (1 - progress) * (matrixMode ? 0.52 : 0.42);
          ctx.strokeStyle = color;
          ctx.lineWidth = matrixMode ? 1.8 : 2.6;
          ctx.shadowBlur = matrixMode ? 18 : 14;
          ctx.shadowColor = color;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
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
        const point = map.project([pulse.coord.lng, pulse.coord.lat]);
        const color = matrixMode ? matrixColor : pulse.color;
        const energy = Math.min(2.5, Math.max(1, pulse.strength));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = matrixMode ? 26 : 32;

        ctx.globalAlpha = (matrixMode ? 0.72 : 0.78) * (1 - progress);
        ctx.lineWidth = 2.4 + energy * 0.7;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8 + 54 * progress, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.34 * (1 - progress);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 20 + 88 * progress, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = Math.max(0.18, 0.62 * (1 - progress));
        ctx.shadowBlur = matrixMode ? 16 : 22;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4.5 + energy * 1.6, 0, Math.PI * 2);
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
          const canvasWidth = rect.width || canvas.width;
          const canvasHeight = rect.height || canvas.height;
          const x = 24 + drop.xRatio * Math.max(1, canvasWidth - 48);
          const maxY = canvasHeight * drop.maxYRatio;
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
            if (y < -charHeight || y > canvasHeight + charHeight) continue;
            const fade = Math.max(0, (1 - i / visibleBytes) * lifeFade);
            if (fade <= 0) continue;
            const byte = drop.bytes[(scrollOffset + i) % drop.bytes.length]!;
            if (i === 0) {
              ctx.globalAlpha = Math.min(1, fade);
              ctx.font = `700 ${matrixMode ? 16 : 14}px JetBrains Mono, monospace`;
              ctx.fillStyle = matrixMode ? "#FFFFFF" : drop.color;
              ctx.shadowColor = matrixMode ? matrixColor : drop.color;
              ctx.shadowBlur = matrixMode ? 18 : 12;
            } else {
              ctx.globalAlpha = fade * (matrixMode ? 0.78 : 0.46);
              ctx.font = `${matrixMode ? 13 : 12}px JetBrains Mono, monospace`;
              ctx.fillStyle = matrixMode ? matrixColor : drop.color;
              ctx.shadowColor = matrixMode ? matrixColor : drop.color;
              ctx.shadowBlur = matrixMode ? 7 : 5;
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
      for (const anim of animationsRef.current) {
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
              createdAt: now,
              lifetimeMs: matrixMode ? 10_000 : 18_000,
              color: anim.color,
            });
          }
          continue;
        }
        next.push(anim);

        const progress = Math.min(1, Math.max(0, age / anim.durationMs));
        const eased = 1 - (1 - progress) ** 3;
        const from = map.project([anim.from.lng, anim.from.lat]);
        const to = map.project([anim.to.lng, anim.to.lat]);
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        const alpha = Math.max(0.22, 1 - progress * 0.58);
        const color = matrixMode ? matrixColor : anim.color;
        const pathDistance = Math.hypot(to.x - from.x, to.y - from.y);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = matrixMode ? 0.22 : 0.2;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 7 : 8;
        ctx.shadowBlur = 18;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        ctx.globalAlpha = matrixMode ? 0.46 : 0.4;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 2 : 2.5;
        ctx.setLineDash([4, 9]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 4.5 : 5.5;
        ctx.shadowBlur = matrixMode ? 24 : 30;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 6 + 3 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();

        if (matrixMode) {
          if (pathDistance > 44 && anim.bytes.length > 0) {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const pathLength = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / pathLength;
            const ny = dx / pathLength;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let i = 0; i < Math.min(4, anim.bytes.length); i += 1) {
              const offset = (i + 1) * 22;
              const t = Math.max(0, eased - offset / pathLength);
              const bx = from.x + dx * t + nx * 10;
              const by = from.y + dy * t + ny * 10;
              const alphaByte = Math.max(0.14, (1 - i / 4) * (1 - progress * 0.28));
              ctx.globalAlpha = i === 0 ? Math.min(1, alphaByte + 0.2) : alphaByte;
              ctx.font = `${i === 0 ? "700 " : ""}${Math.max(10, 15 - i)}px JetBrains Mono, monospace`;
              ctx.fillStyle = i === 0 ? "#FFFFFF" : matrixColor;
              ctx.shadowBlur = i === 0 ? 22 : 10;
              ctx.shadowColor = matrixColor;
              ctx.fillText(anim.bytes[(Math.floor(progress * anim.bytes.length * 1.8) + i) % anim.bytes.length]!, bx, by);
            }
          }
        }

        ctx.globalAlpha = Math.max(0.18, 0.55 * (1 - progress));
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(from.x, from.y, 6 + 16 * Math.min(1, progress * 2.5), 0, Math.PI * 2);
        ctx.stroke();

        if (anim.waveCount > 1 && progress < 0.58) {
          const ripple = Math.max(0, progress / 0.58);
          ctx.globalAlpha = 0.24 * (1 - ripple);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(from.x, from.y, 8 + (18 + anim.waveIndex * 3) * ripple, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (progress > 0.7) {
          const pulse = (progress - 0.7) / 0.3;
          ctx.globalAlpha = 0.68 * (1 - pulse);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 10 + 30 * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (pathDistance > 72 && progress > 0.16 && progress < 0.9) {
          ctx.globalAlpha = matrixMode ? 0.88 : 0.74;
          ctx.shadowBlur = 8;
          ctx.font = "10px JetBrains Mono, monospace";
          ctx.fillStyle = color;
          ctx.fillText(payloadLabel(anim.event.payloadTypeName).slice(0, 10), x + 8, y - 8);
        }
        ctx.restore();
      }

      animationsRef.current = next;
      trailsRef.current = [...nextTrails, ...finishedTrails].slice(-MAX_TRAILS);
      pulsesRef.current = nextPulses.slice(-MAX_PULSES);
      rainRef.current = nextRain.slice(-MAX_RAIN_DROPS);
      if (lastPublishedCount !== next.length) {
        lastPublishedCount = next.length;
        onActiveCount(next.length);
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    map.on("resize", resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      map.off("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [
    animationsRef,
    canvasRef,
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

function LiveStat({ label, value, tone = "primary" }: { label: string; value: string | number; tone?: "primary" | "green" | "warn" }) {
  const toneClass = tone === "green" ? "text-green" : tone === "warn" ? "text-warn" : "text-primary";
  return (
    <div className="min-w-18 px-3 py-2 bg-bg-surface/88 border border-border rounded backdrop-blur">
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`font-mono text-lg leading-none font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LiveControlButton({
  active,
  danger,
  label,
  onClick,
  title,
}: {
  active?: boolean;
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
      className={`shrink-0 rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors ${activeClass}`}
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
  colorByHash,
  feedVisible,
  laggedCount,
  matrixRain,
  matrixMode,
  onClear,
  onToggleColorByHash,
  onToggleFeed,
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
  colorByHash: boolean;
  feedVisible: boolean;
  laggedCount: number;
  matrixRain: boolean;
  matrixMode: boolean;
  onClear: () => void;
  onToggleColorByHash: () => void;
  onToggleFeed: () => void;
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
    <div className="absolute left-3 right-3 bottom-3 z-20 flex flex-wrap items-center gap-2 rounded border border-border bg-bg-surface/92 p-2 shadow-xl backdrop-blur md:left-auto md:w-fit">
      <div className="flex min-w-0 items-center gap-2 pr-1">
        <LiveControlButton label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-wider ${
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
      <LiveControlButton label="Flow" active={realisticPropagation} onClick={onTogglePropagation} title="Group observations into propagation waves" />
      <LiveControlButton label="Color" active={colorByHash} onClick={onToggleColorByHash} title="Color packet paths by hash" />
      <LiveControlButton label="Matrix" active={matrixMode} onClick={onToggleMatrix} title="Toggle matrix scan view" />
      <LiveControlButton label="Rain" active={matrixRain} onClick={onToggleRain} title="Toggle packet byte rain" />
      <LiveControlButton label="Feed" active={feedVisible} onClick={onToggleFeed} title="Toggle packet feed" />
      <LiveControlButton label="Clear" danger onClick={onClear} title="Clear local live buffer" />
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
  const visualQueueRef = useRef<LiveAnimationRequest[]>([]);
  const publishedVisualQueueSizeRef = useRef(0);
  const propagationGroupsRef = useRef(new Map<string, PropagationGroup>());
  const previousByHashRef = useRef(new Map<string, Coord>());
  const flowCameraRef = useRef({ lastFocusedAt: 0 });
  const sequenceRef = useRef(0);
  const pausedRef = useRef(false);

  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );
  const [typeFilter, setTypeFilter] = useState("");
  const [clustered, setClustered] = useState(true);
  const [events, setEvents] = useState<LivePacketEvent[]>([]);
  const [queuedEvents, setQueuedEvents] = useState<LivePacketEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [trails, setTrails] = useState(true);
  const [realisticPropagation, setRealisticPropagation] = useState(true);
  const [colorByHash, setColorByHash] = useState(true);
  const [matrixMode, setMatrixMode] = useState(false);
  const [matrixRain, setMatrixRain] = useState(false);
  const [feedVisible, setFeedVisible] = useState(true);
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
  const { byKey: nodeCoords, byIata: nodesByIata } = useMemo(() => buildNodeCoordMaps(nodes), [nodes]);
  const iataCoords = useMemo(() => buildIataCoordMap(iataCodes), [iataCodes]);

  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  const fitPoints = useMemo<[number, number][] | null>(() => {
    const withCoords = (iataCodes ?? []).filter((i) => i.lat != null && i.lon != null);
    if (withCoords.length === 0) return null;
    const scope = selectedIatas && selectedIatas.length > 0 ? new Set(selectedIatas) : null;
    const chosen = scope ? withCoords.filter((i) => scope.has(i.iata)) : withCoords;
    return chosen.length > 0 ? chosen.map((i) => [i.lon!, i.lat!]) : null;
  }, [iataCodes, selectedIatas]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, fitPoints, handleStyleError);
  const isDark = resolveMapStyle(styleId).dark;

  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, clustered, setSelectedNodeId, selectedNodeId, `${regionKey}:${typeFilter}`);

  const focusLivePath = useCallback(
    (coords: { from: Coord; to: Coord }) => {
      const map = mapRef.current;
      if (!map || !isReady || !realisticPropagation) return;

      const nowMs = performance.now();
      if (nowMs - flowCameraRef.current.lastFocusedAt < LIVE_FLOW_CAMERA_THROTTLE_MS) return;
      flowCameraRef.current.lastFocusedAt = nowMs;

      const container = map.getContainer();
      const compact = container.clientWidth < 768;
      map.fitBounds(paddedPathBounds(coords.from, coords.to), {
        padding: compact
          ? { top: 150, right: 40, bottom: 220, left: 40 }
          : { top: 118, right: 332, bottom: 138, left: 470 },
        maxZoom: 7.15,
        duration: 850,
        bearing: 0,
        pitch: 0,
      });
    },
    [isReady, mapRef, realisticPropagation],
  );

  const playAnimation = useCallback(
    (event: LivePacketEvent, waveIndex = 0, waveCount = 1) => {
      if (animationsRef.current.length >= MAX_ACTIVE_ANIMATIONS) return false;
      const coords = resolvePacketCoords(event, nodeCoords, nodesByIata, iataCoords, previousByHashRef.current);
      if (!coords) return false;
      previousByHashRef.current.set(event.packetHash, coords.to);
      if (previousByHashRef.current.size > LIVE_FEED_CAP * 2) {
        const oldest = previousByHashRef.current.keys().next();
        if (!oldest.done) previousByHashRef.current.delete(oldest.value);
      }
      const color = colorByHash ? hashColor(event.packetHash) : payloadColor(event.payloadTypeName);
      pulsesRef.current = [
        ...pulsesRef.current.slice(-(MAX_PULSES - 1)),
        {
          id: `${event.id}:receiver`,
          coord: coords.to,
          createdAt: performance.now(),
          lifetimeMs: matrixMode ? 3_200 : 4_200,
          color,
          strength: event.observationCount,
        },
      ];
      if (matrixRain && rainRef.current.length < MAX_RAIN_DROPS) {
        const shouldSampleRain = visualQueueRef.current.length < 12 || (event.sequence + hashSeed(event.packetHash)) % 3 === 0;
        const bytes = shouldSampleRain ? hexBytes(event.rawHex || event.packetHash, MAX_RAIN_BYTES) : [];
        if (bytes.length > 0) {
          const seed = hashSeed(`${event.packetHash}:${event.sequence}:rain`);
          const hopCount = Math.max(1, event.hopCount ?? 1);
          const maxYRatio = Math.min(1, Math.max(0.28, hopCount / 4));
          rainRef.current = [
            ...rainRef.current.slice(-(MAX_RAIN_DROPS - 1)),
            {
              id: `${event.id}:rain`,
              bytes,
              xRatio: (seed % 10_000) / 10_000,
              createdAt: performance.now(),
              durationMs: 1_300 + maxYRatio * 2_700,
              maxYRatio,
              color,
            },
          ];
        }
      }
      focusLivePath(coords);
      const durationMs = 2_100 + Math.min(1_200, Math.max(0, event.observationCount - 1) * 120);
      animationsRef.current = [
        ...animationsRef.current.slice(-(MAX_ACTIVE_ANIMATIONS - 1)),
        {
          id: event.id,
          event,
          from: coords.from,
          to: coords.to,
          startedAt: performance.now(),
          durationMs,
          color,
          waveIndex,
          waveCount,
          bytes: hexBytes(event.rawHex || event.packetHash, MAX_MATRIX_FLIGHT_BYTES),
        },
      ];
      return true;
    },
    [colorByHash, focusLivePath, iataCoords, matrixMode, matrixRain, nodeCoords, nodesByIata],
  );

  const queueAnimation = useCallback((request: LiveAnimationRequest) => {
    visualQueueRef.current.push(request);
    if (visualQueueRef.current.length > MAX_PENDING_ANIMATIONS) {
      const dropped = visualQueueRef.current.length - MAX_PENDING_ANIMATIONS;
      visualQueueRef.current = visualQueueRef.current.slice(-MAX_PENDING_ANIMATIONS);
      setVisualDroppedCount((count) => count + dropped);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const active = animationsRef.current.length;
      const queued = visualQueueRef.current.length;
      if (queued > 0 && active < MAX_ACTIVE_ANIMATIONS) {
        const batchSize = active < MAX_ACTIVE_ANIMATIONS / 2 ? 2 : 1;
        const slots = Math.min(batchSize, MAX_ACTIVE_ANIMATIONS - active, queued);
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
      if (skipped > 0) setVisualDroppedCount((count) => count + skipped);
      sampled.forEach((event, index) => {
        queueAnimation({ event, waveIndex: index, waveCount: sampled.length });
      });
    },
    [queueAnimation],
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
    isReady,
    animationsRef,
    trailsRef,
    pulsesRef,
    rainRef,
    trails,
    matrixRain,
    matrixMode,
    setActiveAnimations,
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const event = toLivePacketEvent(data, ++sequenceRef.current);
      setTotalPackets((count) => count + 1);
      if (pausedRef.current) {
        setQueuedEvents((items) => prependBounded(items, event, LIVE_FEED_CAP));
        return;
      }
      scheduleAnimation(event);
      setEvents((items) => prependBounded(items, event, LIVE_FEED_CAP));
    },
    [scheduleAnimation],
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
    setPaused(false);
    setQueuedEvents((queued) => {
      for (const event of queued.slice().reverse()) scheduleAnimation(event);
      setEvents((current) => mergeQueuedEvents(current, queued));
      return [];
    });
  };

  const clearFeed = () => {
    for (const group of propagationGroupsRef.current.values()) clearTimeout(group.timer);
    propagationGroupsRef.current.clear();
    setEvents([]);
    setQueuedEvents([]);
    setLaggedCount(0);
    previousByHashRef.current.clear();
    animationsRef.current = [];
    trailsRef.current = [];
    pulsesRef.current = [];
    rainRef.current = [];
    visualQueueRef.current = [];
    publishedVisualQueueSizeRef.current = 0;
    setVisualQueueSize(0);
    setVisualDroppedCount(0);
  };

  const ratePerMin = countRecent(events, now, 60_000);
  const payloads = topPayloads(events);
  const newest = events[0];

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-bg-base">
      <div ref={containerRef} data-dark={isDark} className={`flex-1 min-w-0 ${matrixMode ? "live-map-matrix" : ""}`} />
      <canvas ref={canvasRef} className="absolute inset-0 z-[5] h-full w-full pointer-events-none" aria-hidden="true" />
      {matrixMode && <div className="live-matrix-overlay absolute inset-0 pointer-events-none z-[6]" aria-hidden="true" />}

      <div className="pointer-events-none absolute top-14 left-3 right-3 z-10 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 md:top-3 md:left-[268px] xl:right-[308px]">
        <div className="pointer-events-auto flex items-center gap-2 rounded border border-border bg-bg-surface/90 px-3 py-2 backdrop-blur">
          <span className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-warn" : "bg-green animate-pulse"}`} />
          <span className="font-mono text-xs font-semibold tracking-wider text-text-bright">{paused ? "PAUSED" : "LIVE"}</span>
          <span className="font-mono text-[11px] text-text-dim">{regionKey}</span>
          {realisticPropagation && <span className="font-mono text-[10px] text-primary">FLOW</span>}
          {colorByHash && <span className="font-mono text-[10px] text-secondary">COLOR</span>}
          {matrixMode && <span className="font-mono text-[10px] text-green">MATRIX</span>}
          {matrixRain && <span className="font-mono text-[10px] text-green">RAIN</span>}
        </div>
        <LiveStat label="Packets" value={formatCount(totalPackets)} tone="green" />
        <LiveStat label="Rate" value={`${ratePerMin}/m`} />
        <LiveStat label="Active" value={activeAnimations} tone={activeAnimations > 0 ? "warn" : "primary"} />
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
        colorByHash={colorByHash}
        feedVisible={feedVisible}
        laggedCount={laggedCount}
        matrixRain={matrixRain}
        matrixMode={matrixMode}
        onClear={clearFeed}
        onToggleColorByHash={() => setColorByHash((v) => !v)}
        onToggleFeed={() => setFeedVisible((v) => !v)}
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
