import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTraces } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { SkeletonRows } from "../../components/SkeletonRows";
import { EmptyState } from "../../components/EmptyState";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { ScopeTag } from "../../components/ScopeTag";
import { Card, StatCard } from "../stats/cards";
import { formatCount } from "../../lib/formatters";
import { TraceDetailPanel } from "./TraceDetailPanel";
import type { StatsRange } from "../stats/types";
import type { TraceTagSummary } from "../../types/api";

// Traces are modest in number and the list isn't streamed, so a single region-filtered fetch covers
// the card list (the /traces cursor is sound if pagination is ever needed).
const TRACE_LIST_LIMIT = 200;
const STATS_RANGES: StatsRange[] = ["24h", "7d", "30d"];

function rangeFromParam(value: string | null): StatsRange {
  return value === "7d" || value === "30d" ? value : "24h";
}

function traceTypeFromParam(value: string | null): "" | "TRACE" | "PING" {
  return value === "TRACE" || value === "PING" ? value : "";
}

function hashPathPreview(path: string[] | undefined, max = 12): string {
  if (!path || path.length === 0) return "";
  const shown = path.slice(0, max).map((h) => h.toUpperCase()).join(" -> ");
  return path.length > max ? `${shown} -> +${path.length - max}` : shown;
}

interface TraceListProps {
  onAnalyze: (hash: string | null) => void;
  onViewNode?: (nodeId: string) => void;
}

// A trace tag as a selectable card, echoing PacketRow's look so the tab reads like the Packets tab.
function TraceTagCard({ tag, selected, onSelect }: {
  tag: TraceTagSummary;
  selected: boolean;
  onSelect: (tag: string) => void;
}) {
  return (
    <div
      className={`bg-bg-surface border rounded-md px-3.5 py-2.5 cursor-pointer ${
        selected ? "border-primary bg-primary/10" : "border-border hover:border-text-dim/30 hover:bg-bg-raised/50"
      }`}
      onClick={() => onSelect(tag.traceTag)}
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tag.traceTag);
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">{tag.traceTag.toUpperCase()}</span>
        <Badge variant="default">{tag.traceType ?? "TRACE"}</Badge>
        <Timestamp value={tag.lastHeardAt} className="ml-auto text-[11px] text-text-dim" />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-dim font-mono">
        {tag.packetCount} pkt · {tag.iataCount} iata
      </div>
    </div>
  );
}

function RangeToggle({ range, onChange }: { range: StatsRange; onChange: (range: StatsRange) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-bg-base p-0.5">
      {STATS_RANGES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            value === range ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text-normal"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function TraceOpsHeader({
  tags,
  range,
  traceType,
  scope,
  scopes,
  onRangeChange,
  onTraceTypeChange,
  onScopeChange,
}: {
  tags: TraceTagSummary[];
  range: StatsRange;
  traceType: "" | "TRACE" | "PING";
  scope: string;
  scopes: string[];
  onRangeChange: (range: StatsRange) => void;
  onTraceTypeChange: (type: "" | "TRACE" | "PING") => void;
  onScopeChange: (scope: string) => void;
}) {
  const packetCount = tags.reduce((sum, tag) => sum + tag.packetCount, 0);
  const pingCount = tags.filter((tag) => tag.traceType === "PING").length;
  const traceCount = tags.filter((tag) => (tag.traceType ?? "TRACE") === "TRACE").length;
  const longest = [...tags].sort((a, b) => (b.pathHashes?.length ?? 0) - (a.pathHashes?.length ?? 0))[0];

  return (
    <div className="border-b border-border-subtle bg-bg-base/80 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">Trace Analysis</div>
          <div className="font-mono text-[10px] text-text-dim">trace tags, ping probes, and path resolution confidence</div>
        </div>
        <RangeToggle range={range} onChange={onRangeChange} />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(["", "TRACE", "PING"] as const).map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => onTraceTypeChange(value)}
            className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              traceType === value ? "border-primary bg-primary/12 text-primary" : "border-border text-text-muted hover:text-text-normal"
            }`}
          >
            {value || "All"}
          </button>
        ))}
        <select
          value={scope}
          onChange={(event) => onScopeChange(event.target.value)}
          className="rounded-sm border border-border bg-bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-normal"
        >
          <option value="">Any scope</option>
          {scopes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {scope && <ScopeTag>{scope}</ScopeTag>}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Tags" sublabel={range} accent="var(--color-primary)" value={formatCount(tags.length)} />
        <StatCard label="Packets" sublabel="tagged" accent="var(--color-secondary)" value={formatCount(packetCount)} />
        <StatCard label="Trace" sublabel="route probe" accent="var(--color-green)" value={formatCount(traceCount)} />
        <StatCard label="Ping" sublabel="single hop" accent="var(--color-warn)" value={formatCount(pingCount)} />
        <Card title="Longest observed path" className="col-span-2 md:col-span-4 xl:col-span-1">
          {longest?.pathHashes?.length ? (
            <div className="font-mono text-[10px]">
              <div className="truncate text-secondary" title={hashPathPreview(longest.pathHashes, 32)}>{hashPathPreview(longest.pathHashes)}</div>
              <div className="mt-1 text-text-muted">{longest.pathHashes.length} hashes / {longest.traceTag.toUpperCase()}</div>
            </div>
          ) : (
            <div className="font-mono text-[11px] text-text-dim">No path hashes</div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function TraceList({ onAnalyze, onViewNode }: TraceListProps) {
  const { iatas, regionKey } = useRegion();
  const scopes = useScopes();
  const [manualSelectedTag, setManualSelectedTag] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTag = searchParams.get("traceTag");
  const range = rangeFromParam(searchParams.get("range"));
  const traceType = traceTypeFromParam(searchParams.get("traceType"));
  const scope = searchParams.get("scope") ?? "";

  // drop the selection when the region changes — the selected tag may not be in the new region
  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setManualSelectedTag(null);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("traceTag");
        return next;
      }, { replace: true });
    }
  }, [regionKey, setSearchParams]);

  const { data: tags, isLoading } = useQuery({
    queryKey: ["traces", regionKey, range, traceType, scope],
    queryFn: () => getTraces(iatas, { limit: TRACE_LIST_LIMIT, type: traceType || undefined, scope: scope || undefined, range }),
    staleTime: 30_000,
  });

  function setParam(name: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(name, value);
      else next.delete(name);
      if (name !== "traceTag") next.delete("traceTag");
      next.set("tab", "Traces");
      return next;
    }, { replace: true });
  }

  const selectedTag = useMemo(() => {
    if (requestedTag) {
      const match = tags?.find((tag) => tag.traceTag.toLowerCase() === requestedTag.toLowerCase());
      if (match) return match.traceTag;
    }
    if (manualSelectedTag && tags?.some((tag) => tag.traceTag === manualSelectedTag)) return manualSelectedTag;
    return null;
  }, [manualSelectedTag, requestedTag, tags]);

  function handleSelectTag(tag: string) {
    setManualSelectedTag(tag);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "Traces");
      next.set("traceTag", tag);
      return next;
    }, { replace: true });
  }

  function handleCloseTag() {
    setManualSelectedTag(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("traceTag");
      return next;
    }, { replace: true });
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-1 min-w-0 flex-col min-h-0">
        <TraceOpsHeader
          tags={tags ?? []}
          range={range}
          traceType={traceType}
          scope={scope}
          scopes={scopes}
          onRangeChange={(value) => setParam("range", value)}
          onTraceTypeChange={(value) => setParam("traceType", value)}
          onScopeChange={(value) => setParam("scope", value)}
        />
        <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-2">
          {isLoading ? (
            <SkeletonRows rows={8} />
          ) : (tags?.length ?? 0) === 0 ? (
            <EmptyState title="No traces" />
          ) : (
            tags!.map((t) => (
              <TraceTagCard key={t.traceTag} tag={t} selected={t.traceTag === selectedTag} onSelect={handleSelectTag} />
            ))
          )}
        </div>
      </div>
      {selectedTag && (
        <TraceDetailPanel
          tag={selectedTag}
          iatas={iatas}
          scope={scope}
          range={range}
          onClose={handleCloseTag}
          onAnalyze={onAnalyze}
          onViewNode={onViewNode}
        />
      )}
    </div>
  );
}
