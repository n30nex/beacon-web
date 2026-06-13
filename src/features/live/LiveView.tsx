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
  activityBins,
  countRecent,
  hashSeed,
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
}

interface LiveTrail {
  id: string;
  from: Coord;
  to: Coord;
  createdAt: number;
  lifetimeMs: number;
  color: string;
}

interface PropagationGroup {
  events: LivePacketEvent[];
  timer: ReturnType<typeof setTimeout>;
}

interface NodeCoord extends Coord {
  id: string;
  name: string | null;
  iatas: string[];
}

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
  const distance = 0.7 + ((seed >>> 8) % 70) / 100;
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
  if (previous) return { from: previous, to };

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

function useLiveAnimationCanvas(
  mapRef: RefObject<MapLibreMap | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  isReady: boolean,
  animationsRef: RefObject<LiveAnimation[]>,
  trailsRef: RefObject<LiveTrail[]>,
  trailsEnabled: boolean,
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
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
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
          ctx.globalAlpha = (1 - progress) * (matrixMode ? 0.36 : 0.24);
          ctx.strokeStyle = color;
          ctx.lineWidth = matrixMode ? 1 : 1.35;
          ctx.shadowBlur = matrixMode ? 10 : 4;
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
              lifetimeMs: matrixMode ? 6_500 : 10_000,
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
        const alpha = Math.max(0, 1 - progress * 0.72);
        const color = matrixMode ? matrixColor : anim.color;
        const pathDistance = Math.hypot(to.x - from.x, to.y - from.y);

        ctx.save();
        ctx.globalAlpha = matrixMode ? 0.18 : 0.14;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 9]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = matrixMode ? 1.8 : 2.25;
        ctx.shadowBlur = matrixMode ? 12 : 16;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.8 + 2.2 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();

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
          ctx.globalAlpha = 0.45 * (1 - pulse);
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 8 + 22 * pulse, 0, Math.PI * 2);
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
      trailsRef.current = [...nextTrails, ...finishedTrails].slice(-96);
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
  }, [animationsRef, canvasRef, isReady, mapRef, matrixMode, onActiveCount, trailsEnabled, trailsRef]);
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

function TimelineBars({ bins, matrixMode }: { bins: number[]; matrixMode: boolean }) {
  const max = Math.max(1, ...bins);
  return (
    <div className="flex h-10 items-end gap-0.5">
      {bins.map((count, idx) => (
        <div
          key={idx}
          className={`flex-1 rounded-t ${matrixMode ? "bg-green/75" : "bg-primary/70"}`}
          style={{ height: `${Math.max(10, (count / max) * 100)}%`, opacity: count ? 0.35 + (count / max) * 0.55 : 0.12 }}
        />
      ))}
    </div>
  );
}

function VcrButton({
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

function LiveVcrBar({
  activeAnimations,
  bins,
  feedVisible,
  laggedCount,
  matrixMode,
  onClear,
  onToggleFeed,
  onToggleMatrix,
  onTogglePaused,
  onTogglePropagation,
  onToggleTrails,
  paused,
  queuedCount,
  ratePerMin,
  realisticPropagation,
  totalPackets,
  trails,
}: {
  activeAnimations: number;
  bins: number[];
  feedVisible: boolean;
  laggedCount: number;
  matrixMode: boolean;
  onClear: () => void;
  onToggleFeed: () => void;
  onToggleMatrix: () => void;
  onTogglePaused: () => void;
  onTogglePropagation: () => void;
  onToggleTrails: () => void;
  paused: boolean;
  queuedCount: number;
  ratePerMin: number;
  realisticPropagation: boolean;
  totalPackets: number;
  trails: boolean;
}) {
  return (
    <div className="absolute left-3 right-3 bottom-3 z-20 flex flex-col gap-2 rounded border border-border bg-bg-surface/92 p-2 shadow-xl backdrop-blur md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <VcrButton label={paused ? "Resume" : "Pause"} active={paused} onClick={onTogglePaused} />
        <div
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-wider ${
            paused ? "border-warn/25 bg-warn/8 text-warn" : "border-green/20 bg-green/8 text-green"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-warn" : "bg-green animate-pulse"}`} />
          {paused ? "PAUSED" : "LIVE"}
        </div>
        <div className="hidden min-w-0 items-center gap-3 font-mono text-[11px] text-text-muted lg:flex">
          <span>{formatCount(totalPackets)} pkts</span>
          <span>{ratePerMin}/m</span>
          <span>{activeAnimations} active</span>
          {queuedCount > 0 && <span className="text-warn">{queuedCount} queued</span>}
          {laggedCount > 0 && <span className="text-danger">{laggedCount} dropped</span>}
        </div>
      </div>

      <div className="min-w-0 flex-1 rounded-sm border border-border-subtle bg-bg-base/65 px-2 py-1">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-dim">
          <span>5m flow</span>
          <span className="lg:hidden">
            {formatCount(totalPackets)} / {ratePerMin}m / {activeAnimations} active
          </span>
        </div>
        <TimelineBars bins={bins} matrixMode={matrixMode} />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0">
        <VcrButton label="Trails" active={trails} onClick={onToggleTrails} title="Toggle ghost trails" />
        <VcrButton label="Flow" active={realisticPropagation} onClick={onTogglePropagation} title="Group observations into propagation waves" />
        <VcrButton label="Matrix" active={matrixMode} onClick={onToggleMatrix} title="Toggle matrix scan view" />
        <VcrButton label="Feed" active={feedVisible} onClick={onToggleFeed} title="Toggle packet feed" />
        <VcrButton label="Clear" danger onClick={onClear} title="Clear local live buffer" />
      </div>
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
    <div className="absolute left-3 bottom-[162px] md:bottom-[98px] z-10 w-[min(430px,calc(100vw-24px))] max-h-[30dvh] sm:max-h-[42dvh] flex flex-col bg-bg-surface/90 border border-border rounded backdrop-blur shadow-xl">
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
    <div className="absolute right-3 bottom-[98px] z-10 hidden lg:block w-56 bg-bg-surface/85 border border-border rounded backdrop-blur">
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
  const propagationGroupsRef = useRef(new Map<string, PropagationGroup>());
  const previousByHashRef = useRef(new Map<string, Coord>());
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
  const [matrixMode, setMatrixMode] = useState(false);
  const [feedVisible, setFeedVisible] = useState(true);
  const [totalPackets, setTotalPackets] = useState(0);
  const [laggedCount, setLaggedCount] = useState(0);
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

  const enqueueAnimation = useCallback(
    (event: LivePacketEvent, delayMs = 0, waveIndex = 0, waveCount = 1) => {
      const coords = resolvePacketCoords(event, nodeCoords, nodesByIata, iataCoords, previousByHashRef.current);
      if (!coords) return;
      previousByHashRef.current.set(event.packetHash, coords.to);
      if (previousByHashRef.current.size > LIVE_FEED_CAP * 2) {
        const oldest = previousByHashRef.current.keys().next();
        if (!oldest.done) previousByHashRef.current.delete(oldest.value);
      }
      const color = payloadColor(event.payloadTypeName);
      const durationMs = 950 + Math.min(900, Math.max(0, event.observationCount - 1) * 90);
      animationsRef.current = [
        ...animationsRef.current.slice(-42),
        { id: event.id, event, from: coords.from, to: coords.to, startedAt: performance.now() + delayMs, durationMs, color, waveIndex, waveCount },
      ];
    },
    [iataCoords, nodeCoords, nodesByIata],
  );

  const flushPropagationGroup = useCallback(
    (packetHash: string) => {
      const group = propagationGroupsRef.current.get(packetHash);
      if (!group) return;
      propagationGroupsRef.current.delete(packetHash);

      const ordered = group.events
        .slice()
        .sort((a, b) => a.receivedAt - b.receivedAt || a.sequence - b.sequence);
      ordered.forEach((event, index) => {
        enqueueAnimation(event, index * 95, index, ordered.length);
      });
    },
    [enqueueAnimation],
  );

  const scheduleAnimation = useCallback(
    (event: LivePacketEvent) => {
      if (!realisticPropagation) {
        enqueueAnimation(event);
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
    [enqueueAnimation, flushPropagationGroup, realisticPropagation],
  );

  useEffect(() => {
    if (realisticPropagation) return;
    for (const hash of Array.from(propagationGroupsRef.current.keys())) {
      flushPropagationGroup(hash);
    }
  }, [flushPropagationGroup, realisticPropagation]);

  useLiveAnimationCanvas(mapRef, canvasRef, isReady, animationsRef, trailsRef, trails, matrixMode, setActiveAnimations);

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
  };

  const ratePerMin = countRecent(events, now, 60_000);
  const bins = activityBins(events, now);
  const payloads = topPayloads(events);
  const newest = events[0];

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-bg-base">
      <div ref={containerRef} data-dark={isDark} className={`flex-1 min-w-0 ${matrixMode ? "live-map-matrix" : ""}`} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[5]" aria-hidden="true" />
      {matrixMode && <div className="live-matrix-overlay absolute inset-0 pointer-events-none z-[6]" aria-hidden="true" />}

      <div className="pointer-events-none absolute top-14 left-3 right-3 z-10 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 md:top-3 md:left-[268px] xl:right-[308px]">
        <div className="pointer-events-auto flex items-center gap-2 rounded border border-border bg-bg-surface/90 px-3 py-2 backdrop-blur">
          <span className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-warn" : "bg-green animate-pulse"}`} />
          <span className="font-mono text-xs font-semibold tracking-wider text-text-bright">{paused ? "PAUSED" : "LIVE"}</span>
          <span className="font-mono text-[11px] text-text-dim">{regionKey}</span>
          {realisticPropagation && <span className="font-mono text-[10px] text-primary">FLOW</span>}
          {matrixMode && <span className="font-mono text-[10px] text-green">MATRIX</span>}
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
      <LiveVcrBar
        activeAnimations={activeAnimations}
        bins={bins}
        feedVisible={feedVisible}
        laggedCount={laggedCount}
        matrixMode={matrixMode}
        onClear={clearFeed}
        onToggleFeed={() => setFeedVisible((v) => !v)}
        onToggleMatrix={() => setMatrixMode((v) => !v)}
        onTogglePaused={paused ? resumeLive : () => setPaused(true)}
        onTogglePropagation={() => setRealisticPropagation((v) => !v)}
        onToggleTrails={() => setTrails((v) => !v)}
        paused={paused}
        queuedCount={queuedEvents.length}
        ratePerMin={ratePerMin}
        realisticPropagation={realisticPropagation}
        totalPackets={totalPackets}
        trails={trails}
      />

      {error && (
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Live map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
