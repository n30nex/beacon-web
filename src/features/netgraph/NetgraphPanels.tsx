import { formatCount, timeAgoMs } from "../../lib/formatters";
import {
  nodeDirectEdgeIds,
  nodeDirectNeighborIds,
  nodeSecondHopNeighborIds,
  selectedNodeNeighborhoodNodeIds,
  selectedNodeRouteEdgeIds,
  type NetgraphEdge,
  type NetgraphGraph,
} from "./netgraph-model";

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function PathwayButton({ edge, graph, active, onSelect }: { edge: NetgraphEdge; graph: NetgraphGraph; active: boolean; onSelect: (routeId: number) => void }) {
  const from = graph.nodeById.get(edge.fromId)?.label ?? edge.fromId.slice(0, 8);
  const to = graph.nodeById.get(edge.toId)?.label ?? edge.toId.slice(0, 8);
  const routeId = edge.routeIds[0];
  return (
    <button
      type="button"
      className={`w-full rounded-sm border px-2.5 py-2 text-left transition-colors ${
        active ? "border-primary/60 bg-primary/12" : "border-border-subtle bg-bg-base/60 hover:border-primary/45 hover:bg-primary/8"
      }`}
      onClick={() => routeId != null && onSelect(routeId)}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
        <span className="truncate font-semibold text-text-bright">{from} {"->"} {to}</span>
        <span className="shrink-0 text-primary">{formatCount(edge.routeCount)} routes</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-text-muted">
        <span>{formatCount(edge.observationCount)} obs</span>
        <span>{timeAgoMs(edge.lastSeen)} ago</span>
      </div>
    </button>
  );
}

export function FallbackList({ graph, selectedRouteId, onSelectRoute }: { graph: NetgraphGraph; selectedRouteId: number | null; onSelectRoute: (routeId: number) => void }) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-bg-surface p-4">
      <div className="font-mono text-[11px] font-semibold uppercase text-text-normal">Route graph fallback</div>
      <div className="mt-1 font-mono text-[11px] text-text-dim">WebGL is unavailable, so Beacon is showing the same topology as lists.</div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="Nodes" value={formatCount(graph.nodes.length)} />
        <Metric label="Links" value={formatCount(graph.edges.length)} />
        <Metric label="Routes" value={formatCount(graph.stats.mappedRouteCount)} />
        <Metric label="Obs" value={formatCount(graph.stats.observationCount)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase text-text-dim">Strong pathways</div>
          <div className="space-y-2">
            {graph.edges.slice(0, 18).map((edge) => (
              <PathwayButton key={edge.id} edge={edge} graph={graph} active={edge.routeIds.includes(selectedRouteId ?? -1)} onSelect={onSelectRoute} />
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase text-text-dim">Top nodes</div>
          <div className="space-y-2">
            {graph.nodes.slice(0, 18).map((node) => (
              <div key={node.id} className="rounded-sm border border-border-subtle bg-bg-base/60 px-2.5 py-2">
                <div className="truncate text-xs font-semibold text-text-bright">{node.label}</div>
                <div className="mt-1 font-mono text-[10px] text-text-muted">{formatCount(node.routeCount)} routes / {formatCount(node.observationCount)} obs</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border-subtle bg-bg-base/70 px-2.5 py-2">
      <div className="font-mono text-[9px] font-semibold uppercase text-text-dim">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-text-bright">{value}</div>
    </div>
  );
}

export function Inspector({
  graph,
  selectedRouteId,
  expanded,
  onToggleExpanded,
  onFocusRoute,
  onViewRouteOnMap,
  onClearRoute,
}: {
  graph: NetgraphGraph;
  selectedRouteId: number | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onFocusRoute: () => void;
  onViewRouteOnMap: () => void;
  onClearRoute: () => void;
}) {
  const selectedEdge = selectedRouteId == null ? null : graph.edgeByRouteId.get(selectedRouteId)?.[0] ?? null;
  if (!selectedEdge) return null;
  const routeEdges = graph.edgeByRouteId.get(selectedRouteId ?? -1) ?? [];
  const routeNodeIds = new Set<string>();
  for (const edge of routeEdges) {
    routeNodeIds.add(edge.fromId);
    routeNodeIds.add(edge.toId);
  }
  const from = graph.nodeById.get(selectedEdge.fromId)?.label ?? selectedEdge.fromId.slice(0, 8);
  const to = graph.nodeById.get(selectedEdge.toId)?.label ?? selectedEdge.toId.slice(0, 8);
  return (
    <aside aria-label="Selected route" className={`pointer-events-auto absolute left-2 right-2 top-[5.1rem] z-10 overflow-y-auto rounded-2xl border border-primary/35 bg-bg-surface/90 p-3 shadow-2xl backdrop-blur-xl md:left-auto md:right-3 md:w-[min(360px,calc(100%-1.5rem))] ${expanded ? "max-h-[calc(100%-6rem)]" : "max-h-44"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase text-primary">Selected route</div>
          <div className="mt-1 text-sm font-semibold text-text-bright">{from} {"->"} {to}</div>
          <div className="mt-1 font-mono text-[10px] text-text-muted">{formatCount(routeEdges.length)} links · {formatCount(routeNodeIds.size)} nodes</div>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-border bg-bg-base/90 text-text-muted transition-colors hover:border-primary/45 hover:text-text-bright"
          onClick={onClearRoute}
          aria-label="Close selected route focus"
          title="Close selected route focus"
        >
          <CloseIcon size={16} />
        </button>
      </div>
      {expanded && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-subtle pt-3"><Metric label="Observations" value={formatCount(selectedEdge.observationCount)} /><Metric label="Last seen" value={`${timeAgoMs(selectedEdge.lastSeen)} ago`} /><Metric label="Regions" value={selectedEdge.iatas.join(", ") || "All"} /><Metric label="Route ID" value={String(selectedRouteId)} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-sm border border-primary/45 bg-primary/10 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase text-primary transition-colors hover:bg-primary/15"
          onClick={onFocusRoute}
          aria-label="Replay selected route in 3D"
        >
          Replay 3D
        </button>
        <button type="button" className="rounded-full border border-border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase text-text-muted hover:border-primary/45 hover:text-text-bright" onClick={onToggleExpanded}>{expanded ? "Less" : "Details"}</button>
        {expanded && <button
          type="button"
          className="rounded-sm border border-primary/45 bg-primary/10 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase text-primary transition-colors hover:bg-primary/15"
          onClick={onViewRouteOnMap}
        >
          View on map
        </button>}
      </div>
    </aside>
  );
}

export function NodeInspector({
  graph,
  selectedNodeId,
  expanded,
  onToggleExpanded,
  onFocusNode,
  onViewNodeOnMap,
  onClearNode,
}: {
  graph: NetgraphGraph;
  selectedNodeId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onFocusNode: () => void;
  onViewNodeOnMap: () => void;
  onClearNode: () => void;
}) {
  const node = selectedNodeId ? graph.nodeById.get(selectedNodeId) : null;
  if (!node) return null;
  const edgeCount = selectedNodeRouteEdgeIds(graph, node.id).size;
  const neighborhoodCount = selectedNodeNeighborhoodNodeIds(graph, node.id).size;
  const directEdgeCount = nodeDirectEdgeIds(graph, node.id).size;
  const directNeighborCount = Math.max(0, nodeDirectNeighborIds(graph, node.id).size - 1);
  const secondHopCount = nodeSecondHopNeighborIds(graph, node.id).size;
  return (
    <aside aria-label="Selected node focus" className={`pointer-events-auto absolute left-2 right-2 top-[5.1rem] z-10 overflow-y-auto rounded-2xl border border-primary/35 bg-bg-surface/90 p-3 shadow-2xl backdrop-blur-xl md:left-auto md:right-3 md:w-[min(360px,calc(100%-1.5rem))] ${expanded ? "max-h-[calc(100%-6rem)]" : "max-h-44"}`}>
      <div className="flex items-center justify-between gap-2 md:items-start md:gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-semibold uppercase text-primary md:text-[10px]">Selected node</div>
          <div className="mt-1 truncate text-sm font-semibold text-text-bright">{node.label}</div>
          <div className="mt-1 font-mono text-[10px] text-text-muted md:text-[11px]">
            {node.role} / {formatCount(edgeCount)} highlighted pathways / {formatCount(neighborhoodCount)} nodes
          </div>
          {expanded && <div className="mt-1 font-mono text-[10px] text-text-muted">
            {formatCount(directNeighborCount)} first-hop / {formatCount(secondHopCount)} second-hop / {formatCount(directEdgeCount)} direct links
          </div>}
          {expanded && <div className="mt-1 font-mono text-[10px] text-text-muted">
            {formatCount(node.routeCount)} routes / {formatCount(node.observationCount)} observations / {timeAgoMs(node.lastSeen)} ago
          </div>}
        </div>
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-border bg-bg-base/90 text-text-muted transition-colors hover:border-primary/45 hover:text-text-bright"
          onClick={onClearNode}
          aria-label="Close selected node focus"
          title="Close selected node focus"
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 md:mt-3">
        <button
          type="button"
          className="rounded-sm border border-primary/45 bg-primary/10 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase text-primary transition-colors hover:bg-primary/15"
          onClick={onFocusNode}
          aria-label="Focus selected node neighborhood"
        >
          Focus
        </button>
        <button type="button" className="rounded-full border border-border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase text-text-muted hover:border-primary/45 hover:text-text-bright" onClick={onToggleExpanded}>{expanded ? "Less" : "Details"}</button>
        {expanded && <button
          type="button"
          className="rounded-sm border border-primary/45 bg-primary/10 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase text-primary transition-colors hover:bg-primary/15"
          onClick={onViewNodeOnMap}
          aria-label="View selected node on map"
        >
          View on map
        </button>}
      </div>
    </aside>
  );
}
