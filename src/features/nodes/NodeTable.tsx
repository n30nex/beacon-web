import { memo, useState, useCallback, useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { useCoalescedInfinitePatch } from "../../hooks/useCoalescedInfinitePatch";
import { useWsNodeUpdateHandler, useWsPacketHandler } from "../../hooks/useWsHandlers";
import { formatHex, formatRadio, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { patchNodeSummary } from "./node-updates";
import { pathChunks } from "../live/live-model";
import type { NodeSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate, WsPacketObservation } from "../../types/ws";

const NODE_GRID_PAGE_SIZE = 500;
const NODE_LIVE_ACTIVITY_MS = 10_000;
const NODE_LIVE_ACTIVITY_MAX_DESKTOP = 320;
const NODE_LIVE_ACTIVITY_MAX_MOBILE = 140;
const NODE_LIVE_ACTIVITY_REFRESH_MS = 700;
const NODE_PACKET_BATCH_MAX = 96;
const NODE_ROUTE_COMET_MS = 5_600;
const NODE_ROUTE_COMET_MAX_DESKTOP = 12;
const NODE_ROUTE_COMET_MAX_MOBILE = 5;
const NODE_ROUTE_COMET_BATCH_MAX = 4;
const nodeId = (n: NodeSummary) => n.id;
const nodeUpdateKey = (d: WsNodeUpdate["data"]) => d.nodeId;

type NodeLiveRole = "tx" | "relay" | "rx";

interface NodeLiveActivity {
  role: NodeLiveRole;
  lastAt: number;
  count: number;
  packetHash: string;
  iata: string;
}

interface NodeTrafficLookup {
  byId: Map<string, NodeSummary>;
  byObserver: Map<string, NodeSummary>;
  byPathPrefix: Map<string, NodeSummary[]>;
}

interface NodeRouteComet {
  color: string;
  durationMs: number;
  fromId: string;
  id: string;
  packetHash: string;
  startedAt: number;
  toId: string;
}

interface NodeTableProps {
  wsManager: WsManager;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function nodeLastHeard(node: NodeSummary): number {
  return Math.max(0, ...node.iatas.map((entry) => entry.lastHeard));
}

function desktopViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= 1024;
}

function liveActivityCap(): number {
  return desktopViewport() ? NODE_LIVE_ACTIVITY_MAX_DESKTOP : NODE_LIVE_ACTIVITY_MAX_MOBILE;
}

function routeCometCap(): number {
  return desktopViewport() ? NODE_ROUTE_COMET_MAX_DESKTOP : NODE_ROUTE_COMET_MAX_MOBILE;
}

function nodeAccent(node: NodeSummary): string {
  const source = sanitizeDisplayLabel(node.name, node.id);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${Math.abs(hash) % 360} 86% 56%)`;
}

function normalizeHex(value: string | undefined): string {
  return (value ?? "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function buildNodeTrafficLookup(nodes: NodeSummary[]): NodeTrafficLookup {
  const byId = new Map<string, NodeSummary>();
  const byObserver = new Map<string, NodeSummary>();
  const byPathPrefix = new Map<string, NodeSummary[]>();

  for (const node of nodes) {
    byId.set(node.id, node);
    if (node.observerId) byObserver.set(node.observerId, node);

    const publicKey = normalizeHex(node.publicKey);
    for (let length = 2; length <= Math.min(16, publicKey.length); length += 2) {
      const prefix = publicKey.slice(0, length);
      const bucket = byPathPrefix.get(prefix) ?? [];
      bucket.push(node);
      byPathPrefix.set(prefix, bucket);
    }
  }

  return { byId, byObserver, byPathPrefix };
}

function setTrafficRole(roles: Map<string, NodeLiveRole>, nodeId: string, role: NodeLiveRole) {
  const current = roles.get(nodeId);
  if (!current || current === "relay" || role === "tx" || role === "rx") {
    roles.set(nodeId, role);
  }
}

function nodesFromPacketPath(data: WsPacketObservation["data"], lookup: NodeTrafficLookup): NodeSummary[] {
  const resolved = data.observation.resolvedPath
    ?.map((hop) => (hop.confidence === "high" && hop.nodes.length === 1 ? lookup.byId.get(hop.nodes[0]!.id) : undefined))
    .filter((node): node is NodeSummary => Boolean(node));
  if (resolved && resolved.length > 0) return resolved;

  const chunks = pathChunks(data.observation.pathBytes, data.observation.pathLength?.hashSize, data.observation.pathLength?.hopCount, 8);
  return chunks
    .map((chunk) => {
      const candidates = lookup.byPathPrefix.get(chunk);
      return candidates?.length === 1 ? candidates[0] : undefined;
    })
    .filter((node): node is NodeSummary => Boolean(node));
}

function uniqueRouteNodes(nodes: NodeSummary[]): NodeSummary[] {
  const route: NodeSummary[] = [];
  for (const node of nodes) {
    if (route.at(-1)?.id !== node.id) route.push(node);
  }
  return route;
}

function packetRouteNodes(data: WsPacketObservation["data"], lookup: NodeTrafficLookup): NodeSummary[] {
  const route = uniqueRouteNodes(nodesFromPacketPath(data, lookup));
  const observerNode = lookup.byObserver.get(data.observation.observerId);
  if (observerNode && route.length > 0 && route.at(-1)?.id !== observerNode.id) {
    route.push(observerNode);
  }
  return route;
}

function resolvePacketNodeRoles(data: WsPacketObservation["data"], lookup: NodeTrafficLookup): Map<string, NodeLiveRole> {
  const roles = new Map<string, NodeLiveRole>();
  const pathNodes = nodesFromPacketPath(data, lookup);
  const observerNode = lookup.byObserver.get(data.observation.observerId);

  pathNodes.forEach((node, index) => {
    const role: NodeLiveRole = index === 0 ? "tx" : index === pathNodes.length - 1 ? "rx" : "relay";
    setTrafficRole(roles, node.id, role);
  });

  if (observerNode) {
    setTrafficRole(roles, observerNode.id, "rx");
    if (pathNodes.length === 1 && pathNodes[0]!.id !== observerNode.id) {
      setTrafficRole(roles, pathNodes[0]!.id, "tx");
    }
  }

  return roles;
}

function rectIntersects(a: DOMRect, b: DOMRect): boolean {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

function drawCanvasLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function NodeRouteCometOverlay({
  cardElementsRef,
  comets,
  scrollRef,
}: {
  cardElementsRef: RefObject<Map<string, HTMLButtonElement>>;
  comets: NodeRouteComet[];
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cometsRef = useRef<NodeRouteComet[]>(comets);

  useEffect(() => {
    cometsRef.current = comets;
  }, [comets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx || comets.length === 0) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let raf = 0;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    const sizeCanvas = (viewport: HTMLDivElement) => {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      if (parentRect) {
        canvas.style.left = `${viewportRect.left - parentRect.left}px`;
        canvas.style.top = `${viewportRect.top - parentRect.top}px`;
      }
      canvas.style.width = `${viewport.clientWidth}px`;
      canvas.style.height = `${viewport.clientHeight}px`;
      const width = Math.max(1, Math.floor(viewport.clientWidth * dpr));
      const height = Math.max(1, Math.floor(viewport.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return viewportRect;
    };

    const draw = () => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const viewportRect = sizeCanvas(viewport);
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      ctx.clearRect(0, 0, width, height);
      const now = Date.now();

      for (const comet of cometsRef.current) {
        const age = now - comet.startedAt;
        if (age < 0 || age > comet.durationMs) continue;
        const from = cardElementsRef.current.get(comet.fromId);
        const to = cardElementsRef.current.get(comet.toId);
        if (!from || !to) continue;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        if (!rectIntersects(fromRect, viewportRect) && !rectIntersects(toRect, viewportRect)) continue;

        const x1 = fromRect.left - viewportRect.left + fromRect.width / 2;
        const y1 = fromRect.top - viewportRect.top + fromRect.height / 2;
        const x2 = toRect.left - viewportRect.left + toRect.width / 2;
        const y2 = toRect.top - viewportRect.top + toRect.height / 2;
        const progress = Math.min(1, Math.max(0, age / comet.durationMs));
        const fade = progress < 0.82 ? 1 : Math.max(0, (1 - progress) / 0.18);
        const headX = x1 + (x2 - x1) * progress;
        const headY = y1 + (y2 - y1) * progress;
        const tailProgress = Math.max(0, progress - 0.28);
        const tailX = x1 + (x2 - x1) * tailProgress;
        const tailY = y1 + (y2 - y1) * tailProgress;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = comet.color;
        ctx.fillStyle = comet.color;
        ctx.lineCap = "round";

        ctx.globalAlpha = 0.16 * fade;
        ctx.lineWidth = 1;
        drawCanvasLine(ctx, x1, y1, x2, y2);

        ctx.globalAlpha = 0.72 * fade;
        ctx.lineWidth = 2.25;
        drawCanvasLine(ctx, tailX, tailY, headX, headY);

        ctx.globalAlpha = 0.95 * fade;
        ctx.beginPath();
        ctx.arc(headX, headY, 3.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.min(0.45, progress * 1.8) * fade;
        ctx.beginPath();
        ctx.arc(x1, y1, 2.6, 0, Math.PI * 2);
        ctx.fill();

        if (progress > 0.82) {
          ctx.globalAlpha = ((progress - 0.82) / 0.18) * fade;
          ctx.beginPath();
          ctx.arc(x2, y2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [cardElementsRef, comets.length, scrollRef]);

  return (
    <canvas
      ref={canvasRef}
      className="node-route-comets-canvas"
      aria-hidden="true"
    />
  );
}

const NodeGridCard = memo(function NodeGridCard({
  activity,
  node,
  onSelect,
  onRegister,
  selected,
}: {
  activity?: NodeLiveActivity;
  node: NodeSummary;
  onSelect: (id: string) => void;
  onRegister: (id: string, element: HTMLButtonElement | null) => void;
  selected: boolean;
}) {
  const label = sanitizeDisplayLabel(node.name, formatHex(node.id));
  const hasName = Boolean(node.name && label !== formatHex(node.id));
  const accent = nodeAccent(node);
  const lastHeard = nodeLastHeard(node);
  const style = {
    "--node-accent": accent,
    boxShadow: !activity
      ? selected
        ? `0 0 14px ${accent}66`
        : `inset 2px 0 0 ${accent}`
      : undefined,
  } as CSSProperties;

  const setRef = useCallback((element: HTMLButtonElement | null) => onRegister(node.id, element), [node.id, onRegister]);

  return (
    <button
      ref={setRef}
      type="button"
      onClick={() => onSelect(node.id)}
      className={`node-grid-card group min-w-0 rounded-sm border bg-bg-surface/80 p-1.5 text-left font-mono transition-colors hover:bg-primary/8 ${
        activity ? "node-grid-card-live" : ""
      } ${
        selected ? "border-primary text-text-bright" : "border-border-subtle text-text-normal"
      }`}
      data-node-id={node.id}
      data-live-role={activity?.role}
      data-pulse-phase={activity ? activity.count % 2 : undefined}
      style={style}
      title={label}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent, color: accent }} />
        <span className={`min-w-0 flex-1 truncate text-[10px] leading-tight ${hasName ? "" : "italic text-text-dim"}`}>
          {label}
        </span>
        {activity && (
          <span className="node-live-badge shrink-0" title={`${activity.role.toUpperCase()} ${formatHex(activity.packetHash)} / ${activity.iata}`}>
            {activity.role.toUpperCase()}
          </span>
        )}
        {node.isObserver && (
          <Tooltip label="Observer">
            <span className="shrink-0 text-primary"><ObserverIcon /></span>
          </Tooltip>
        )}
      </div>
      <div className="node-card-type mt-1 truncate text-[9px] uppercase leading-tight tracking-wide text-text-muted">{node.nodeTypeName}</div>
      <div className="node-card-secondary mt-1 flex items-center justify-between gap-1 text-[9px] leading-tight text-text-dim">
        <span className="truncate">{formatRadio(node.radio) ?? "no radio"}</span>
        <span className="shrink-0">{lastHeard > 0 ? timeAgoMs(lastHeard) : "never"}</span>
      </div>
    </button>
  );
}, (prev, next) =>
  prev.node === next.node &&
  prev.activity === next.activity &&
  prev.selected === next.selected &&
  prev.onSelect === next.onSelect &&
  prev.onRegister === next.onRegister
);

export function NodeTable({ wsManager, selectedNodeId, onSelectNode }: NodeTableProps) {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [liveActivity, setLiveActivity] = useState<Record<string, NodeLiveActivity>>({});
  const [routeComets, setRouteComets] = useState<NodeRouteComet[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const displayNodeIdsRef = useRef<Set<string>>(new Set());
  const trafficLookupRef = useRef<NodeTrafficLookup>({ byId: new Map(), byObserver: new Map(), byPathPrefix: new Map() });
  const pendingPacketsRef = useRef<WsPacketObservation["data"][]>([]);
  const packetFlushRafRef = useRef<number | null>(null);

  const queryKey = useMemo(
    () => ["nodes", regionKey, typeFilter, pathsFilter, tracesFilter, search, searchField],
    [regionKey, typeFilter, pathsFilter, tracesFilter, search, searchField],
  );

  const { items: nodes, loadedCount, isPaging, isError, isLoading } = useInfinitePages<NodeSummary>({
    queryKey,
    queryFn: (cursor) =>
      getNodesPage(iatas, {
        cursor,
        limit: NODE_GRID_PAGE_SIZE,
        type: typeFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
        supportsMultibytePaths: pathsFilter || undefined,
        supportsMultibyteTraces: tracesFilter || undefined,
      }),
    getId: nodeId,
    keepPrevious: true,
  });

  const scopeOptions = useScopes();
  const trafficLookup = useMemo(() => buildNodeTrafficLookup(nodes), [nodes]);
  const displayNodes = useMemo(
    () =>
      (scopeFilter ? nodes.filter((n) => n.defaultScope === scopeFilter) : nodes)
        .slice()
        .sort((a, b) => nodeLastHeard(b) - nodeLastHeard(a) || sanitizeDisplayLabel(a.name, a.id).localeCompare(sanitizeDisplayLabel(b.name, b.id))),
    [nodes, scopeFilter],
  );

  useEffect(() => {
    trafficLookupRef.current = trafficLookup;
  }, [trafficLookup]);

  useEffect(() => {
    displayNodeIdsRef.current = new Set(displayNodes.map((node) => node.id));
  }, [displayNodes]);

  const registerCard = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) cardElementsRef.current.set(id, element);
    else cardElementsRef.current.delete(id);
  }, []);

  const handleSelectNode = useCallback((id: string) => onSelectNode(id), [onSelectNode]);

  const onNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, selectedNodeId],
  );

  useWsNodeUpdateHandler(
    wsManager,
    useCoalescedInfinitePatch<NodeSummary, WsNodeUpdate["data"]>(queryKey, nodeUpdateKey, patchNodeSummary, onNodeUpdate),
  );

  const flushPacketActivity = useCallback(() => {
    packetFlushRafRef.current = null;
    const queued = pendingPacketsRef.current;
    if (queued.length === 0) return;
    pendingPacketsRef.current = [];

    const batch = queued.length > NODE_PACKET_BATCH_MAX ? queued.slice(-NODE_PACKET_BATCH_MAX) : queued;
    const lookup = trafficLookupRef.current;
    const displayIds = displayNodeIdsRef.current;
    const now = Date.now();
    const roleHits = new Map<string, NodeLiveActivity>();
    const nextComets: NodeRouteComet[] = [];

    for (const data of batch) {
      const roles = resolvePacketNodeRoles(data, lookup);
      roles.forEach((role, id) => {
        if (!displayIds.has(id)) return;
        const previous = roleHits.get(id);
        roleHits.set(id, {
          role: previous?.role === "tx" || previous?.role === "rx" ? previous.role : role,
          lastAt: now,
          count: (previous?.count ?? 0) + 1,
          packetHash: data.packetHash,
          iata: data.observation.iata,
        });
      });

      if (nextComets.length < NODE_ROUTE_COMET_BATCH_MAX) {
        const routeNodes = packetRouteNodes(data, lookup);
        const from = routeNodes[0];
        const to = routeNodes.at(-1);
        if (from && to && from.id !== to.id && displayIds.has(from.id) && displayIds.has(to.id)) {
          nextComets.push({
            color: nodeAccent(from),
            durationMs: NODE_ROUTE_COMET_MS,
            fromId: from.id,
            id: `${data.packetHash}:${data.observation.id ?? now}:${now}:${nextComets.length}`,
            packetHash: data.packetHash,
            startedAt: now,
            toId: to.id,
          });
        }
      }
    }

    if (roleHits.size > 0) {
      setLiveActivity((current) => {
        const cutoff = now - NODE_LIVE_ACTIVITY_MS;
        const next: Record<string, NodeLiveActivity> = {};
        for (const [id, activity] of Object.entries(current)) {
          if (activity.lastAt >= cutoff && displayIds.has(id)) next[id] = activity;
        }
        roleHits.forEach((hit, id) => {
          const previous = next[id];
          if (previous && previous.role === hit.role && now - previous.lastAt < NODE_LIVE_ACTIVITY_REFRESH_MS) {
            return;
          }
          next[id] = {
            ...hit,
            count: (previous?.count ?? 0) + hit.count,
          };
        });

        const entries = Object.entries(next);
        if (entries.length <= liveActivityCap()) return next;
        return Object.fromEntries(entries.sort((a, b) => b[1].lastAt - a[1].lastAt).slice(0, liveActivityCap()));
      });
    }

    if (nextComets.length > 0) {
      setRouteComets((current) => {
        const cutoff = now - NODE_ROUTE_COMET_MS;
        return [...current.filter((comet) => comet.startedAt >= cutoff), ...nextComets].slice(-routeCometCap());
      });
    }
  }, []);

  const handlePacketActivity = useCallback(
    (data: WsPacketObservation["data"]) => {
      if (document.visibilityState === "hidden") return;
      pendingPacketsRef.current.push(data);
      if (pendingPacketsRef.current.length > NODE_PACKET_BATCH_MAX * 2) {
        pendingPacketsRef.current = pendingPacketsRef.current.slice(-NODE_PACKET_BATCH_MAX);
      }
      if (packetFlushRafRef.current == null) {
        packetFlushRafRef.current = window.requestAnimationFrame(flushPacketActivity);
      }
    },
    [flushPacketActivity],
  );

  useWsPacketHandler(wsManager, handlePacketActivity);

  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - NODE_LIVE_ACTIVITY_MS;
      setLiveActivity((current) => {
        let changed = false;
        const next: Record<string, NodeLiveActivity> = {};
        for (const [nodeId, activity] of Object.entries(current)) {
          if (activity.lastAt >= cutoff) next[nodeId] = activity;
          else changed = true;
        }
        return changed ? next : current;
      });
      setRouteComets((current) => {
        const cutoff = Date.now() - NODE_ROUTE_COMET_MS;
        const next = current.filter((comet) => comet.startedAt >= cutoff);
        return next.length === current.length ? current : next;
      });
    }, 1_500);
    return () => {
      window.clearInterval(id);
      if (packetFlushRafRef.current != null) window.cancelAnimationFrame(packetFlushRafRef.current);
    };
  }, []);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <NodeFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          pathsFilter={pathsFilter}
          onPathsChange={setPathsFilter}
          tracesFilter={tracesFilter}
          onTracesChange={setTracesFilter}
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="py-10 text-center font-mono text-sm text-text-dim">Loading nodes</div>
          ) : displayNodes.length === 0 ? (
            <div className="py-10 text-center font-mono text-sm text-text-dim">No nodes</div>
          ) : (
            <div className="relative">
              <div className="node-grid-dense relative z-10 grid">
                {displayNodes.map((node) => (
                  <NodeGridCard
                    key={node.id}
                    activity={liveActivity[node.id]}
                    node={node}
                    selected={selectedNodeId === node.id}
                    onRegister={registerCard}
                    onSelect={handleSelectNode}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <NodeRouteCometOverlay cardElementsRef={cardElementsRef} comets={routeComets} scrollRef={scrollRef} />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="nodes" position="bottom-3 right-3" />
      </div>
    </div>
  );
}
