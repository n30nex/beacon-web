import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNode, getNodeAdverts, getNodeAnalytics, getNodeObservations, getNodeNeighbors, getNodeReach } from "../../api/client";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { FreshnessLine } from "../../components/FreshnessLine";
import { formatHex, formatSnr, snrLevel, formatRadio, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { Timestamp } from "../../components/Timestamp";
import { useRegion } from "../../hooks/useRegion";
import type { NodeActivityPoint, NodeAdvertObservation, NodeAnalyticsCount, NodeAnalyticsPeer, NodeObservation, NodeNeighbor, NodeReachNode } from "./types";
import { WatchNodeButton } from "../investigations/WatchNodeButton";
import type { Node, NodeAnalytics, NodeReach } from "./types";
import type { CursorPage } from "../../types/api";
import { buildNodeJsonExport, nodeJsonFilename } from "./node-export";
import { VARIANT_CLASSES } from "../../components/badge-utils";

function NodeNeighborRow({ neighbor, onClick }: { neighbor: NodeNeighbor; onClick?: () => void }) {
  const label = sanitizeDisplayLabel(neighbor.name, formatHex(neighbor.id));
  const hasName = Boolean(neighbor.name && label !== formatHex(neighbor.id));
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 ${onClick ? "cursor-pointer hover:bg-primary/8" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`font-mono font-semibold tracking-wider truncate ${hasName ? "text-primary" : "text-text-dim italic"}`}>
          {label}
        </span>
        <Badge variant="default">{neighbor.nodeTypeName}</Badge>
        <IataChip>{neighbor.iata}</IataChip>
        <Timestamp value={neighbor.lastSeen} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="font-mono text-[11px] text-text-muted mt-1">
        {neighbor.observationCount.toLocaleString()} obs
      </div>
    </div>
  );
}

function NodeObservationRow({ obs, onClick }: { obs: NodeObservation; onClick?: () => void }) {
  const level = snrLevel(obs.snr);
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 border-l-2 border-l-primary ${onClick ? "cursor-pointer hover:bg-primary/8" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] mb-1.5">
        <Badge variant="default">{obs.payloadTypeName}</Badge>
        <IataChip>{obs.iata}</IataChip>
        <Timestamp value={obs.heardAt} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="flex gap-5 font-mono text-xs">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {formatSnr(obs.snr)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {obs.rssi ?? "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Hops</span>
          <span className="font-medium text-text-normal">{obs.hopCount ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

function NodeAdvertRow({ advert, onClick }: { advert: NodeAdvertObservation; onClick?: () => void }) {
  const level = snrLevel(advert.snr);
  const label = sanitizeDisplayLabel(advert.advertisedName, "unnamed advert");
  const hasName = Boolean(advert.advertisedName && label !== "unnamed advert");
  const coord =
    advert.advertisedLat != null && advert.advertisedLng != null
      ? `${advert.advertisedLat.toFixed(4)}, ${advert.advertisedLng.toFixed(4)}`
      : advert.hasLocation === false
        ? "no location"
        : "location unknown";
  return (
    <div
      className={`border border-border bg-bg-base px-3 py-2 border-l-2 border-l-green ${onClick ? "cursor-pointer hover:bg-green/8" : ""}`}
      onClick={onClick}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span className={`truncate font-mono font-semibold tracking-wider ${hasName ? "text-green" : "text-text-dim italic"}`}>
          {label}
        </span>
        {advert.advertisedNodeTypeName && <Badge variant="default">{advert.advertisedNodeTypeName}</Badge>}
        <IataChip>{advert.iata}</IataChip>
        <Timestamp value={advert.heardAt} className="ml-auto font-mono text-[11px] text-text-dim" />
      </div>
      <div className="mb-1.5 grid grid-cols-[1fr_auto] gap-2 font-mono text-[11px]">
        <span className="truncate text-text-muted" title={coord}>{coord}</span>
        {advert.flagsRaw && <span className="text-text-dim">flags {advert.flagsRaw}</span>}
      </div>
      <div className="flex gap-5 font-mono text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {formatSnr(advert.snr)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {advert.rssi ?? "-"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim">Hops</span>
          <span className="font-medium text-text-normal">{advert.hopCount ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}

function compactNumber(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 10 ? 0 : 1 });
}

function AnalyticsMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-border bg-bg-base px-2.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-primary">{value}</div>
      {detail && <div className="mt-0.5 truncate font-mono text-[10px] text-text-muted">{detail}</div>}
    </div>
  );
}

function AnalyticsBars({ title, items, emptyLabel }: { title: string; items: NodeAnalyticsCount[]; emptyLabel: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">{title}</div>
      {items.length === 0 ? (
        <div className="font-mono text-[11px] text-text-dim">{emptyLabel}</div>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 5).map((item) => (
            <div key={item.key} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 font-mono text-[11px]">
              <span className="truncate text-text-muted" title={item.label}>{item.label}</span>
              <span className="h-1.5 overflow-hidden bg-border/55">
                <span className="block h-full bg-primary shadow-[0_0_8px_rgba(var(--rgb-primary),0.45)]" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
              </span>
              <span className="text-right text-text-normal">{item.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hourLabel(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getHours()).padStart(2, "0")}00`;
}

function ActivityHeatmap({ points }: { points: NodeActivityPoint[] }) {
  const cells = points.slice(-24);
  const max = Math.max(1, ...cells.map((point) => point.observations));
  if (cells.length === 0) {
    return <div className="font-mono text-[11px] text-text-dim">No hourly activity</div>;
  }
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
        <span>Hourly activity</span>
        <span>{cells.length}h</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
        {cells.map((point) => {
          const intensity = Math.max(0, Math.min(1, point.observations / max));
          const alpha = 0.18 + intensity * 0.72;
          return (
            <div
              key={point.timestamp}
              className="h-7 border border-border bg-bg-base"
              title={`${hourLabel(point.timestamp)} / ${point.observations.toLocaleString()} obs / ${point.packets.toLocaleString()} pkts`}
              style={{
                background: `linear-gradient(180deg, rgba(var(--rgb-primary),${alpha}) 0%, rgba(var(--rgb-green),${0.08 + intensity * 0.32}) 100%)`,
                boxShadow: intensity > 0.25 ? `0 0 ${Math.round(5 + intensity * 10)}px rgba(var(--rgb-primary),${0.18 + intensity * 0.22})` : undefined,
              }}
            >
              <span className="sr-only">
                {hourLabel(point.timestamp)} {point.observations} observations
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-text-dim">
        <span>{hourLabel(cells[0]?.timestamp ?? 0)}</span>
        <span>{hourLabel(cells.at(-1)?.timestamp ?? 0)}</span>
      </div>
    </div>
  );
}

function PeerAnalyticsRow({ peer, onClick }: { peer: NodeAnalyticsPeer; onClick?: () => void }) {
  const label = sanitizeDisplayLabel(peer.name, formatHex(peer.id));
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[1fr_auto] gap-2 border border-border bg-bg-base px-2.5 py-1.5 text-left font-mono text-[11px] hover:border-primary/60 hover:bg-primary/8"
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-primary">{label}</span>
        <span className="block truncate text-text-dim">{peer.nodeTypeName} / {peer.iata}</span>
      </span>
      <span className="text-right text-text-muted">
        {peer.observationCount.toLocaleString()} obs
      </span>
    </button>
  );
}

function PeerReachGraph({
  peers,
  reachNodes,
  onViewNode,
}: {
  peers: NodeAnalyticsPeer[];
  reachNodes: NodeReachNode[];
  onViewNode?: (nodeId: string) => void;
}) {
  const items = [
    ...peers.slice(0, 4).map((peer) => ({
      id: peer.id,
      label: sanitizeDisplayLabel(peer.name, formatHex(peer.id)),
      metric: peer.observationCount,
      tone: "primary" as const,
      sublabel: `${peer.iata} peer`,
    })),
    ...reachNodes.slice(0, 4).map((node) => ({
      id: node.id,
      label: sanitizeDisplayLabel(node.name, formatHex(node.id)),
      metric: node.routeCount,
      tone: "green" as const,
      sublabel: `${node.hopDistance} hop reach`,
    })),
  ]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 6);
  if (items.length === 0) {
    return <div className="font-mono text-[11px] text-text-dim">No peer graph inputs</div>;
  }
  const max = Math.max(1, ...items.map((item) => item.metric));
  const center = 68;
  const radius = 42;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
        <span>Peer / reach graph</span>
        <span>{items.length} links</span>
      </div>
      <div className="grid grid-cols-[136px_1fr] gap-2 border border-border bg-bg-base p-2">
        <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label="Node peer and reach graph">
          <defs>
            <filter id="node-peer-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={center} cy={center} r="9" fill="rgba(var(--rgb-primary),0.18)" stroke="var(--color-primary)" strokeWidth="1.6" filter="url(#node-peer-glow)" />
          {items.map((item, index) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / items.length;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;
            const opacity = 0.28 + (item.metric / max) * 0.58;
            const color = item.tone === "green" ? "var(--color-green)" : "var(--color-primary)";
            return (
              <g key={`${item.id}-${item.sublabel}`}>
                <line x1={center} y1={center} x2={x} y2={y} stroke={color} strokeWidth={1 + (item.metric / max) * 2} opacity={opacity} />
                <circle cx={x} cy={y} r={4.5 + (item.metric / max) * 3.5} fill="rgba(0,0,0,0.35)" stroke={color} strokeWidth="1.4" filter="url(#node-peer-glow)" />
              </g>
            );
          })}
        </svg>
        <div className="min-w-0 space-y-1 self-center">
          {items.map((item) => (
            <button
              key={`${item.id}-${item.sublabel}`}
              type="button"
              className={`grid w-full grid-cols-[1fr_auto] gap-2 border border-border px-2 py-1 text-left font-mono text-[10px] hover:bg-primary/8 ${
                item.tone === "green" ? "hover:border-green/60" : "hover:border-primary/60"
              }`}
              onClick={onViewNode ? () => onViewNode(item.id) : undefined}
              disabled={!onViewNode}
            >
              <span className="min-w-0">
                <span className={`block truncate font-semibold ${item.tone === "green" ? "text-green" : "text-primary"}`}>
                  {item.label}
                </span>
                <span className="block truncate text-text-dim">{item.sublabel}</span>
              </span>
              <span className="text-right text-text-muted">{item.metric.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReachHopBars({ items }: { items: Array<{ hopDistance: number; nodeCount: number; routeCount: number; observationCount: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.nodeCount));
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.hopDistance} className="grid grid-cols-[42px_1fr_54px] items-center gap-2 font-mono text-[11px]">
          <span className="text-text-dim">{item.hopDistance} hop</span>
          <span className="h-1.5 overflow-hidden bg-border/55">
            <span
              className="block h-full bg-green shadow-[0_0_8px_rgba(var(--rgb-green),0.45)]"
              style={{ width: `${Math.max(8, (item.nodeCount / max) * 100)}%` }}
            />
          </span>
          <span className="text-right text-text-normal">{item.nodeCount.toLocaleString()} nodes</span>
        </div>
      ))}
    </div>
  );
}

function ReachNodeRow({ node, onClick }: { node: NodeReachNode; onClick?: () => void }) {
  const label = sanitizeDisplayLabel(node.name, formatHex(node.id));
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[1fr_auto] gap-2 border border-border bg-bg-base px-2.5 py-1.5 text-left font-mono text-[11px] hover:border-green/60 hover:bg-green/8"
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-green">{label}</span>
        <span className="block truncate text-text-dim">
          {node.hopDistance} hop / {node.iatas.length ? node.iatas.join(", ") : "all"}
        </span>
      </span>
      <span className="text-right text-text-muted">
        {node.routeCount.toLocaleString()} routes
      </span>
    </button>
  );
}

function NodeJsonActions({
  node,
  regionKey,
  iatas,
  analytics,
  reach,
  neighbors,
  observations,
  adverts,
}: {
  node: Node;
  regionKey: string;
  iatas?: string[];
  analytics?: NodeAnalytics;
  reach?: NodeReach;
  neighbors?: NodeNeighbor[];
  observations?: CursorPage<NodeObservation>;
  adverts?: CursorPage<NodeAdvertObservation>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const nodeJson = useCallback(
    () => JSON.stringify(buildNodeJsonExport({ node, regionKey, iatas, analytics, reach, neighbors, observations, adverts }), null, 2),
    [adverts, analytics, iatas, neighbors, node, observations, reach, regionKey],
  );

  const flash = useCallback((next: "copied" | "failed") => {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 1500);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(nodeJson());
      flash("copied");
    } catch {
      flash("failed");
    }
  }, [flash, nodeJson]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([nodeJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nodeJsonFilename(node.id);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [node.id, nodeJson]);

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${status === "copied" ? VARIANT_CLASSES.live : status === "failed" ? VARIANT_CLASSES.stale : VARIANT_CLASSES.text}`}
        onClick={handleCopy}
        aria-label="Copy node JSON"
      >
        {status === "copied" ? "Copied JSON" : status === "failed" ? "Copy Failed" : "Copy JSON"}
      </button>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${VARIANT_CLASSES.text}`}
        onClick={handleDownload}
        aria-label="Download node JSON"
      >
        Save JSON
      </button>
    </>
  );
}

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onViewObserver: (observerId: string) => void;
  onViewNode?: (nodeId: string) => void;
  onAnalyzePacket?: (hash: string) => void;
}

export function NodeDetailPanel({ nodeId, onClose, onViewObserver, onViewNode, onAnalyzePacket }: NodeDetailPanelProps) {
  const { iatas, regionKey } = useRegion();
  const { data: node, dataUpdatedAt: nodeUpdatedAt, isFetching: nodeFetching, isLoading } = useQuery({
    queryKey: ["node", nodeId],
    queryFn: () => getNode(nodeId),
    staleTime: 30_000,
  });
  const nodeLabel = node ? sanitizeDisplayLabel(node.name, formatHex(node.id)) : "";
  const hasNodeName = Boolean(node?.name && nodeLabel !== formatHex(node.id));

  const { data: observations, dataUpdatedAt: observationsUpdatedAt, isFetching: observationsFetching } = useQuery({
    queryKey: ["node-observations", nodeId],
    queryFn: () => getNodeObservations(nodeId, { limit: 50 }),
    staleTime: 30_000,
  });

  const { data: adverts, dataUpdatedAt: advertsUpdatedAt, isFetching: advertsFetching } = useQuery({
    queryKey: ["node-adverts", nodeId],
    queryFn: () => getNodeAdverts(nodeId, { limit: 24 }),
    staleTime: 30_000,
  });

  const { data: neighbors, dataUpdatedAt: neighborsUpdatedAt, isFetching: neighborsFetching } = useQuery({
    queryKey: ["node-neighbors", nodeId],
    queryFn: () => getNodeNeighbors(nodeId),
    staleTime: 30_000,
  });

  const { data: analytics, dataUpdatedAt: analyticsUpdatedAt, isFetching: analyticsFetching, isLoading: analyticsLoading } = useQuery({
    queryKey: ["node-analytics", nodeId, regionKey],
    queryFn: () => getNodeAnalytics(nodeId, iatas),
    enabled: !!node,
    staleTime: 30_000,
  });

  const { data: reach, dataUpdatedAt: reachUpdatedAt, isFetching: reachFetching, isLoading: reachLoading } = useQuery({
    queryKey: ["node-reach", nodeId, regionKey],
    queryFn: () => getNodeReach(nodeId, { iatas, maxHops: 5 }),
    enabled: !!node,
    staleTime: 30_000,
  });

  const hasLocation = node != null && node.lat != null && node.lng != null;

  return (
    <DetailPanel
      title="Node Detail"
      onClose={onClose}
      isLoading={isLoading}
      notFound={!node}
      notFoundLabel="Node not found"
      actions={
        node ? (
          <>
            <WatchNodeButton publicKey={node.publicKey} nodeId={node.id} label={nodeLabel} />
            <NodeJsonActions
              node={node}
              regionKey={regionKey}
              iatas={iatas}
              analytics={analytics}
              reach={reach}
              neighbors={neighbors}
              observations={observations}
              adverts={adverts}
            />
          </>
        ) : undefined
      }
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      }
    >
      {node && (
        <>
          <Section title="Summary" first>
              <FreshnessLine source="Detail" updatedAt={nodeUpdatedAt || undefined} fetching={nodeFetching} />
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-mono text-xs font-semibold tracking-wider ${hasNodeName ? "text-primary" : "text-text-dim italic"}`}>
                  {nodeLabel}
                </span>
                <Badge variant="default">{node.nodeTypeName}</Badge>
              </div>
              <div className="font-mono text-[13px] text-text-muted truncate" title={node.publicKey}>
                {node.publicKey}
              </div>
              {node.observerId && (
                <button
                  type="button"
                  onClick={() => onViewObserver(node.observerId!)}
                  className="mt-2 block font-mono text-[11px] text-primary hover:underline"
                >
                  View observer →
                </button>
              )}
            </Section>

            {(hasLocation || node.locationSource) && (
              <Section title="Location">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                  {node.lat != null && <Field label="Lat" value={node.lat.toFixed(5)} />}
                  {node.lng != null && <Field label="Lng" value={node.lng.toFixed(5)} />}
                  {node.locationSource && <Field label="Source" value={node.locationSource} />}
                </div>
              </Section>
            )}

            <Section title="Capabilities">
              <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                {node.minFirmwareVersion && <Field label="Min firmware" value={node.minFirmwareVersion} />}
                <Field label="Multibyte paths" value={node.supportsMultibytePaths ? "yes" : "no"} />
                <Field label="Multibyte traces" value={node.supportsMultibyteTraces ? "yes" : "no"} />
                {node.radio && <Field label="Radio" value={formatRadio(node.radio) ?? "—"} />}
                {node.defaultScope && <Field label="Scope" value={node.defaultScope} />}
              </div>
            </Section>

            <Section title="Timestamps">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[13px]">
                <Field label="First" value={<Timestamp value={node.firstSeen} />} />
                <Field label="Last" value={<Timestamp value={node.lastSeen} />} />
                {node.lastAdvertAt != null && <Field label="Advert" value={<Timestamp value={node.lastAdvertAt} />} />}
              </div>
            </Section>

            <Section title="Analytics">
              <FreshnessLine source="Analytics" updatedAt={analyticsUpdatedAt || undefined} fetching={analyticsFetching} />
              {analyticsLoading ? (
                <div role="status" className="font-mono text-[12px] uppercase tracking-wider text-text-dim">QUERYING NODE ANALYTICS...</div>
              ) : analytics ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    <AnalyticsMetric label="Packets" value={compactNumber(analytics.kpis.packetCount)} />
                    <AnalyticsMetric label="Obs" value={compactNumber(analytics.kpis.observationCount)} />
                    <AnalyticsMetric label="Observers" value={compactNumber(analytics.kpis.activeObservers)} />
                    <AnalyticsMetric label="IATAs" value={compactNumber(analytics.kpis.activeIatas)} />
                    <AnalyticsMetric label="Avg SNR" value={analytics.kpis.avgSnr == null ? "-" : `${analytics.kpis.avgSnr.toFixed(1)} dB`} />
                    <AnalyticsMetric label="Avg RSSI" value={analytics.kpis.avgRssi == null ? "-" : `${analytics.kpis.avgRssi.toFixed(0)} dBm`} />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <ActivityHeatmap points={analytics.hourly} />
                    <AnalyticsBars title="Payload mix" items={analytics.payloadMix} emptyLabel="No payload mix" />
                    <AnalyticsBars title="Route mix" items={analytics.routeMix} emptyLabel="No route mix" />
                    <AnalyticsBars title="SNR buckets" items={analytics.snrBuckets.map((bucket) => ({ key: bucket.bucket, label: bucket.bucket, count: bucket.count }))} emptyLabel="No signal data" />
                  </div>
                  {(analytics.topPeers.length > 0 || (reach?.topNodes.length ?? 0) > 0) && (
                    <PeerReachGraph peers={analytics.topPeers} reachNodes={reach?.topNodes ?? []} onViewNode={onViewNode} />
                  )}
                  {analytics.topPeers.length > 0 && (
                    <div>
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">Top peers</div>
                      <div className="space-y-1">
                        {analytics.topPeers.slice(0, 4).map((peer) => (
                          <PeerAnalyticsRow key={`${peer.id}-${peer.iata}`} peer={peer} onClick={onViewNode ? () => onViewNode(peer.id) : undefined} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No node analytics</div>
              )}
            </Section>

            <Section title="Verified Reach">
              <FreshnessLine source="Reach" updatedAt={reachUpdatedAt || undefined} fetching={reachFetching} />
              {reachLoading ? (
                <TerminalLoadingState compact label="QUERYING REACH" detail="VERIFIED ROUTES" />
              ) : reach ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    <AnalyticsMetric label="Reach" value={compactNumber(reach.reachableNodes)} detail={`${reach.maxHops} hops`} />
                    <AnalyticsMetric label="Edges" value={compactNumber(reach.verifiedEdges)} detail="verified" />
                    <AnalyticsMetric label="Routes" value={compactNumber(reach.routeCount)} />
                    <AnalyticsMetric label="Route obs" value={compactNumber(reach.observationCount)} />
                  </div>
                  {reach.hopBuckets.length > 0 ? (
                    <div>
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">Hop reach</div>
                      <ReachHopBars items={reach.hopBuckets} />
                    </div>
                  ) : (
                    <div className="font-mono text-[12px] text-text-dim">No verified route reach</div>
                  )}
                  {reach.topNodes.length > 0 && (
                    <div>
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">Top reachable nodes</div>
                      <div className="space-y-1">
                        {reach.topNodes.slice(0, 5).map((item) => (
                          <ReachNodeRow key={item.id} node={item} onClick={onViewNode ? () => onViewNode(item.id) : undefined} />
                        ))}
                      </div>
                    </div>
                  )}
                  {reach.topIatas.length > 0 && (
                    <div>
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">IATA pressure</div>
                      <div className="grid grid-cols-2 gap-1">
                        {reach.topIatas.slice(0, 4).map((item) => (
                          <div key={item.iata} className="border border-border bg-bg-base px-2 py-1.5 font-mono">
                            <div className="text-[11px] font-semibold text-primary">{item.iata}</div>
                            <div className="text-[10px] text-text-dim">
                              {item.nodeCount.toLocaleString()} nodes / {item.routeCount.toLocaleString()} routes
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No verified route reach</div>
              )}
            </Section>

            <Section title="Neighbors">
              <FreshnessLine source="Neighbors" updatedAt={neighborsUpdatedAt || undefined} fetching={neighborsFetching} />
              {neighbors && neighbors.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {neighbors.map((n) => (
                    // the endpoint returns one row per (neighbor, iata), so the node id alone repeats
                    <NodeNeighborRow
                      key={`${n.id}-${n.iata}`}
                      neighbor={n}
                      onClick={onViewNode ? () => onViewNode(n.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No known neighbors</div>
              )}
            </Section>

            <Section title="Advert Timeline">
              <FreshnessLine source="Adverts" updatedAt={advertsUpdatedAt || undefined} fetching={advertsFetching} />
              {adverts && adverts.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {adverts.items.map((advert) => (
                    <NodeAdvertRow
                      key={advert.id}
                      advert={advert}
                      onClick={onAnalyzePacket ? () => onAnalyzePacket(advert.packetHash) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No advert history</div>
              )}
            </Section>

            <Section title="Observations">
              <FreshnessLine source="Observations" updatedAt={observationsUpdatedAt || undefined} fetching={observationsFetching} />
              {observations && observations.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {observations.items.map((obs) => (
                    <NodeObservationRow
                      key={obs.id}
                      obs={obs}
                      onClick={onAnalyzePacket ? () => onAnalyzePacket(obs.packetHash) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No recent observations</div>
              )}
            </Section>
        </>
      )}
    </DetailPanel>
  );
}
