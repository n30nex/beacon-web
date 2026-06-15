import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { useCoalescedInfinitePatch } from "../../hooks/useCoalescedInfinitePatch";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, formatRadio, timeAgoMs } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { patchNodeSummary } from "./node-updates";
import type { NodeSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";

const NODE_GRID_PAGE_SIZE = 500;
const nodeId = (n: NodeSummary) => n.id;
const nodeUpdateKey = (d: WsNodeUpdate["data"]) => d.nodeId;

interface NodeTableProps {
  wsManager: WsManager;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function nodeLastHeard(node: NodeSummary): number {
  return Math.max(0, ...node.iatas.map((entry) => entry.lastHeard));
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

function NodeGridCard({
  node,
  onSelect,
  selected,
}: {
  node: NodeSummary;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const label = sanitizeDisplayLabel(node.name, formatHex(node.id));
  const hasName = Boolean(node.name && label !== formatHex(node.id));
  const accent = nodeAccent(node);
  const lastHeard = nodeLastHeard(node);

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={`group min-w-0 rounded-sm border bg-bg-surface/80 p-1.5 text-left font-mono transition-colors hover:bg-primary/8 ${
        selected ? "border-primary text-text-bright" : "border-border-subtle text-text-normal"
      }`}
      style={{ boxShadow: selected ? `0 0 14px ${accent}66` : `inset 2px 0 0 ${accent}` }}
      title={label}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent, color: accent }} />
        <span className={`min-w-0 flex-1 truncate text-[10px] leading-tight ${hasName ? "" : "italic text-text-dim"}`}>
          {label}
        </span>
        {node.isObserver && (
          <Tooltip label="Observer">
            <span className="shrink-0 text-primary"><ObserverIcon /></span>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase leading-tight tracking-wide text-text-muted">{node.nodeTypeName}</div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[9px] leading-tight text-text-dim">
        <span className="truncate">{formatRadio(node.radio) ?? "no radio"}</span>
        <span className="shrink-0">{lastHeard > 0 ? timeAgoMs(lastHeard) : "never"}</span>
      </div>
    </button>
  );
}

export function NodeTable({ wsManager, selectedNodeId, onSelectNode }: NodeTableProps) {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");

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
  const displayNodes = useMemo(
    () =>
      (scopeFilter ? nodes.filter((n) => n.defaultScope === scopeFilter) : nodes)
        .slice()
        .sort((a, b) => nodeLastHeard(b) - nodeLastHeard(a) || sanitizeDisplayLabel(a.name, a.id).localeCompare(sanitizeDisplayLabel(b.name, b.id))),
    [nodes, scopeFilter],
  );

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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="py-10 text-center font-mono text-sm text-text-dim">Loading nodes</div>
          ) : displayNodes.length === 0 ? (
            <div className="py-10 text-center font-mono text-sm text-text-dim">No nodes</div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 2xl:grid-cols-[repeat(20,minmax(0,1fr))]">
              {displayNodes.map((node) => (
                <NodeGridCard key={node.id} node={node} selected={selectedNodeId === node.id} onSelect={onSelectNode} />
              ))}
            </div>
          )}
        </div>
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="nodes" position="bottom-3 right-3" />
      </div>
    </div>
  );
}
