import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBrokers, getHealth, getLiveSummary, getReadiness, getSystemStatus } from "../api/client";
import { useRegion } from "../hooks/useRegion";
import { useWsDiagnostics } from "../hooks/useWsDiagnostics";
import type { WsManager } from "../api/ws-manager";

type Tone = "normal" | "good" | "warn" | "danger";

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function toneForStatus(status?: string): Tone {
  switch (status?.toLowerCase()) {
    case "ok":
    case "connected":
    case "success":
      return "good";
    case "degraded":
    case "running":
    case "disabled":
      return "warn";
    case "unavailable":
    case "down":
    case "failed":
    case "error":
      return "danger";
    default:
      return "normal";
  }
}

function toneClass(tone: Tone): string {
  if (tone === "good") return "text-green";
  if (tone === "warn") return "text-warn";
  if (tone === "danger") return "text-danger";
  return "text-text-normal";
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function RuntimeMetric({ label, value, tone = "normal" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-0.5 truncate text-[11px] font-semibold ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

export function RuntimeStatusPanel({ wsManager, variant = "dropdown" }: { wsManager: WsManager; variant?: "dropdown" | "page" }) {
  const diagnostics = useWsDiagnostics(wsManager);
  const { iatas, regionKey } = useRegion();
  const now = useNow();
  const lastTransportTimestamp = diagnostics.lastTransportTimestamp ?? diagnostics.lastEventTimestamp;
  const lastDataTimestamp = diagnostics.lastDataTimestamp ?? null;
  const lastTransportAgeMs = now - lastTransportTimestamp;
  const lastDataAgeMs = lastDataTimestamp == null ? null : now - lastDataTimestamp;
  const lastTransportAge = formatDuration(lastTransportAgeMs);
  const lastDataAge = lastDataAgeMs == null ? "NONE" : formatDuration(lastDataAgeMs);
  const hasSubscription = Boolean(diagnostics.activeSubscriptionId);
  const quiet = diagnostics.status === "connected" && hasSubscription && (lastDataAgeMs == null || lastDataAgeMs > 90_000);
  const socketLabel = diagnostics.status === "connected"
    ? hasSubscription
      ? quiet ? "QUIET" : "CONNECTED"
      : "SYNCING"
    : diagnostics.status.toUpperCase();

  const health = useQuery({ queryKey: ["runtime-health"], queryFn: getHealth, refetchInterval: 30_000 });
  const readiness = useQuery({ queryKey: ["runtime-readiness"], queryFn: getReadiness, refetchInterval: 30_000 });
  const system = useQuery({ queryKey: ["runtime-system-status"], queryFn: getSystemStatus, refetchInterval: 30_000 });
  const brokers = useQuery({ queryKey: ["runtime-brokers"], queryFn: getBrokers, refetchInterval: 30_000 });
  const live = useQuery({
    queryKey: ["runtime-live-summary", regionKey],
    queryFn: () => getLiveSummary(iatas),
    refetchInterval: 15_000,
  });

  const brokerRows = brokers.data ?? [];
  const connectedBrokers = brokerRows.filter((broker) => broker.connected).length;
  const brokerTone: Tone = brokerRows.length === 0 ? "warn" : connectedBrokers === brokerRows.length ? "good" : "danger";
  const apiTone: Tone = health.isError ? "danger" : toneForStatus(health.data?.status);
  const readyTone: Tone = readiness.isError ? "danger" : readiness.data?.ready ? "good" : readiness.data ? "warn" : "normal";
  const publicStatus = system.data?.status ?? (system.isError ? "unavailable" : "unknown");
  const overallState = publicStatus === "ok" && readiness.data?.ready ? "HEALTHY" : publicStatus.toUpperCase();
  const overallTone = toneForStatus(publicStatus);
  const scopeLabel = iatas ? (iatas.length <= 3 ? iatas.join(", ") : `${iatas.length} IATA`) : "ALL";
  const gapLabel = diagnostics.laggedNoticeCount === 0 ? "NONE" : `${diagnostics.lastLaggedDroppedCount ?? 0} dropped`;
  const gapDetail = diagnostics.lastLaggedAt ? `${formatDuration(now - diagnostics.lastLaggedAt)} ago` : "";

  const rootClass = variant === "page"
    ? "runtime-status-panel w-full max-w-4xl space-y-3 rounded-sm border border-border bg-bg-surface p-3 font-mono md:p-4"
    : "runtime-status-panel w-72 space-y-2 px-3 py-2 font-mono";
  const metricGridClass = variant === "page" ? "grid grid-cols-2 gap-2 md:grid-cols-4" : "grid grid-cols-2 gap-1.5";
  const brokerClass = variant === "page" ? "max-h-56 space-y-1 overflow-y-auto border-t border-border-subtle pt-3" : "max-h-24 space-y-1 overflow-y-auto border-t border-border-subtle pt-2";

  return (
    <div className={rootClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim">System</div>
          <div className={`${variant === "page" ? "text-xl" : "text-sm"} font-semibold ${variant === "page" ? toneClass(overallTone) : "text-text-bright"}`}>
            {variant === "page" ? overallState : socketLabel}
          </div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1 text-right text-[10px] text-text-muted">
          <div className="text-text-dim">SCOPE</div>
          <div className="max-w-28 truncate text-text-normal">{scopeLabel}</div>
        </div>
      </div>

      <div className={metricGridClass}>
        <RuntimeMetric label="Transport" value={lastTransportAge} tone={diagnostics.status === "connected" && lastTransportAgeMs < 90_000 ? "good" : "warn"} />
        <RuntimeMetric label="Mesh Data" value={lastDataAge} tone={diagnostics.status === "connected" && !quiet ? "good" : "warn"} />
        <RuntimeMetric label="Retry" value={diagnostics.reconnectAttempt} tone={diagnostics.reconnectAttempt > 0 ? "warn" : "normal"} />
        <RuntimeMetric label="Reconnects" value={diagnostics.reconnectCount ?? 0} tone={(diagnostics.reconnectCount ?? 0) > 0 ? "warn" : "normal"} />
        <RuntimeMetric label="Parse Errors" value={diagnostics.parseFailureCount} tone={diagnostics.parseFailureCount > 0 ? "danger" : "normal"} />
        <RuntimeMetric label="API" value={health.data?.status ?? (health.isError ? "DOWN" : "...")} tone={apiTone} />
        <RuntimeMetric label="Ready" value={readiness.data?.ready === undefined ? (readiness.isError ? "NO" : "...") : readiness.data.ready ? "YES" : "NO"} tone={readyTone} />
        <RuntimeMetric label="Ingest" value={system.data?.ingest.status ?? "..."} tone={toneForStatus(system.data?.ingest.status)} />
        <RuntimeMetric label="Live Traffic" value={system.data?.liveTraffic.status ?? "..."} tone={toneForStatus(system.data?.liveTraffic.status)} />
        <RuntimeMetric label="Analytics" value={system.data?.analytics.status ?? "..."} tone={toneForStatus(system.data?.analytics.status)} />
        <RuntimeMetric label="Brokers" value={`${connectedBrokers}/${brokerRows.length || "?"}`} tone={brokerTone} />
        <RuntimeMetric label="Live Packets" value={live.data?.packetCount ?? "..."} tone={live.isError ? "danger" : "normal"} />
        <RuntimeMetric label="Gap Heal" value={gapDetail ? `${gapLabel} ${gapDetail}` : gapLabel} tone={diagnostics.laggedNoticeCount > 0 ? "warn" : "normal"} />
        {variant === "page" && <RuntimeMetric label="API Version" value={health.data?.version ?? "--"} />}
        {variant === "page" && <RuntimeMetric label="Status Sample" value={system.data?.serverTime ? `${formatDuration(now - system.data.serverTime)} ago` : "--"} tone={system.data?.serverTime && now - system.data.serverTime > 90_000 ? "warn" : "normal"} />}
      </div>

      {diagnostics.activeSubscriptionId && (
        <div className="truncate border-t border-border-subtle pt-2 text-[10px] text-text-dim">SUB {diagnostics.activeSubscriptionId}</div>
      )}

      {brokerRows.length > 0 && (
        <div className={brokerClass}>
          {brokerRows.map((broker) => (
            <div key={broker.name} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-text-muted">{broker.name}</span>
              <span className={broker.connected ? "text-green" : "text-danger"}>{broker.connected ? "CONNECTED" : "DOWN"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
