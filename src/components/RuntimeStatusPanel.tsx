import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBrokers, getHealth, getLiveSummary, getReadiness } from "../api/client";
import { useRegion } from "../hooks/useRegion";
import { useWsDiagnostics } from "../hooks/useWsDiagnostics";
import type { WsManager } from "../api/ws-manager";
import type { BackgroundTaskSnapshot, CacheCategorySnapshot, HealthDependency, HealthStatus, RateLimitSnapshot } from "../types/api";

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function formatTimestamp(ms?: number): string {
  if (!ms) return "--";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatCount(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "--";
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function toneForStatus(status?: string): "normal" | "good" | "warn" | "danger" {
  const normalized = status?.toLowerCase();
  if (normalized === "ok" || normalized === "connected" || normalized === "success") return "good";
  if (normalized === "degraded" || normalized === "running" || normalized === "disabled") return "warn";
  if (normalized === "down" || normalized === "failed" || normalized === "error") return "danger";
  return "normal";
}

function toneClass(tone: "normal" | "good" | "warn" | "danger"): string {
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

function RuntimeMetric({ label, value, tone = "normal" }: { label: string; value: ReactNode; tone?: "normal" | "good" | "warn" | "danger" }) {
  return (
    <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className={`mt-0.5 truncate text-[11px] font-semibold ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

function StatusPill({ value }: { value?: string }) {
  const tone = toneForStatus(value);
  return (
    <span className={`shrink-0 rounded-sm border border-current/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase ${toneClass(tone)}`}>
      {value ?? "unknown"}
    </span>
  );
}

function RuntimeDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-text-dim">{title}</div>
      {children}
    </section>
  );
}

function dependencyEntries(status?: HealthStatus): [string, HealthDependency][] {
  return Object.entries(status?.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function rateLimitEntries(status?: HealthStatus): [string, RateLimitSnapshot][] {
  return Object.entries(status?.rateLimits ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function cacheMetricEntries(status?: HealthStatus): [string, CacheCategorySnapshot][] {
  return Object.entries(status?.cacheMetrics ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function backgroundTaskEntries(status?: HealthStatus): [string, BackgroundTaskSnapshot][] {
  return Object.entries(status?.backgroundTasks ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function RuntimeDiagnosticsDetails({
  health,
  readiness,
  now,
}: {
  health?: HealthStatus;
  readiness?: HealthStatus;
  now: number;
}) {
  const status = readiness ?? health;
  const dependencies = dependencyEntries(status);
  const cacheMetrics = cacheMetricEntries(health ?? readiness);
  const backgroundTasks = backgroundTaskEntries(health ?? readiness);
  const rateLimits = rateLimitEntries(health ?? readiness);
  const serverAge = status?.serverTime ? formatDuration(now - status.serverTime) : "--";

  return (
    <div className="space-y-3">
      <RuntimeDetailSection title="Runtime">
        <div className="grid gap-2 md:grid-cols-4">
          <RuntimeMetric label="API Version" value={status?.version ?? "--"} tone={toneForStatus(status?.status)} />
          <RuntimeMetric label="Build SHA" value={`${status?.build?.sha?.slice(0, 10) ?? "--"}${status?.build?.dirty ? " DIRTY" : ""}`} tone={status?.build?.dirty ? "warn" : "normal"} />
          <RuntimeMetric label="Mode" value={status?.mode ?? "--"} />
          <RuntimeMetric label="Server Sample" value={serverAge === "--" ? "--" : `${serverAge} ago`} tone={status?.serverTime && now - status.serverTime > 90_000 ? "warn" : "normal"} />
          <RuntimeMetric label="Server Time" value={formatTimestamp(status?.serverTime)} />
        </div>
      </RuntimeDetailSection>

      {status?.databasePool && (
        <RuntimeDetailSection title="PostgreSQL Pool">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <RuntimeMetric label="Acquired" value={formatCount(status.databasePool.acquiredConnections)} />
            <RuntimeMetric label="Idle" value={formatCount(status.databasePool.idleConnections)} />
            <RuntimeMetric label="Total / Max" value={`${status.databasePool.totalConnections} / ${status.databasePool.maxConnections}`} />
            <RuntimeMetric label="Waits / Cancel" value={`${status.databasePool.emptyAcquireCount} / ${status.databasePool.canceledAcquireCount}`} tone={status.databasePool.canceledAcquireCount > 0 ? "warn" : "normal"} />
          </div>
        </RuntimeDetailSection>
      )}

      {dependencies.length > 0 && (
        <RuntimeDetailSection title="Dependencies">
          <div className="grid gap-1.5 md:grid-cols-2">
            {dependencies.map(([name, dep]) => (
              <div key={name} className="flex min-w-0 items-center justify-between gap-2 border border-border-subtle bg-bg-base/45 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-text-normal">{name}</div>
                  {dep.detail && <div className="truncate text-[10px] text-text-dim">{dep.detail}</div>}
                </div>
                <StatusPill value={dep.status} />
              </div>
            ))}
          </div>
        </RuntimeDetailSection>
      )}

      {(cacheMetrics.length > 0 || backgroundTasks.length > 0 || rateLimits.length > 0) && (
        <details className="border-t border-border-subtle pt-3">
          <summary className="min-h-11 cursor-pointer py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">Raw diagnostics</summary>
      {cacheMetrics.length > 0 && (
        <RuntimeDetailSection title="Cache">
          <div className="grid gap-1.5 md:grid-cols-2">
            {cacheMetrics.map(([category, metric]) => {
              const total = metric.hits + metric.misses;
              const hitRate = total > 0 ? `${Math.round((metric.hits / total) * 100)}%` : "--";
              const errors = Object.values(metric.errors ?? {}).reduce((sum, value) => sum + value, 0);
              return (
                <div key={category} className="border border-border-subtle bg-bg-base/45 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[11px] font-semibold uppercase text-text-normal">{category}</div>
                    <span className={errors > 0 ? "text-danger" : "text-text-dim"}>{errors > 0 ? `${errors} ERR` : `${metric.ttlSeconds ?? 0}s TTL`}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-5 gap-1 text-[10px] text-text-muted">
                    <span>H {formatCount(metric.hits)}</span>
                    <span>M {formatCount(metric.misses)}</span>
                    <span>HR {hitRate}</span>
                    <span>INV {formatCount(metric.invalidations)}</span>
                    <span className={(metric.staleServed ?? 0) > 0 ? "text-warn" : ""}>ST {formatCount(metric.staleServed)}</span>
                  </div>
                  {metric.lastRefreshError && <div className="mt-1 truncate text-[10px] text-danger">REFRESH {metric.lastRefreshError}</div>}
                </div>
              );
            })}
          </div>
        </RuntimeDetailSection>
      )}

      {backgroundTasks.length > 0 && (
        <RuntimeDetailSection title="Background">
          <div className="grid gap-1.5 md:grid-cols-3">
            {backgroundTasks.map(([name, task]) => (
              <div key={name} className="border border-border-subtle bg-bg-base/45 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[11px] font-semibold text-text-normal">{name}</div>
                  <StatusPill value={task.lastStatus} />
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-text-muted">
                  <span>RUN {formatCount(task.runs)}</span>
                  <span>OK {formatCount(task.successes)}</span>
                  <span>FAIL {formatCount(task.failures)}</span>
                </div>
                <div className="mt-1 truncate text-[10px] text-text-dim">
                  {task.lastError ? task.lastError : `${formatCount(task.lastDurationMs)} ms / ${formatCount(task.lastAffectedRows)} rows / next ${formatTimestamp(task.nextRunAt)}`}
                </div>
              </div>
            ))}
          </div>
        </RuntimeDetailSection>
      )}

      {rateLimits.length > 0 && (
        <RuntimeDetailSection title="Rate Limits">
          <div className="grid gap-1.5 md:grid-cols-2">
            {rateLimits.map(([name, limit]) => (
              <div key={name} className="border border-border-subtle bg-bg-base/45 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[11px] font-semibold text-text-normal">{name}</div>
                  <span className={limit.rejected > 0 ? "text-warn" : "text-green"}>{formatCount(limit.rejected)} rejected</span>
                </div>
                <div className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-text-muted">
                  <span>{formatCount(limit.requestsPerMinute)}/m</span>
                  <span>B {formatCount(limit.burst)}</span>
                  <span>A {formatCount(limit.allowed)}</span>
                  <span>IP {formatCount(limit.activeBuckets)}</span>
                </div>
              </div>
            ))}
          </div>
        </RuntimeDetailSection>
      )}
        </details>
      )}
    </div>
  );
}

export function RuntimeStatusPanel({ wsManager, variant = "dropdown" }: { wsManager: WsManager; variant?: "dropdown" | "page" }) {
  const diagnostics = useWsDiagnostics(wsManager);
  const { iatas, regionKey } = useRegion();
  const now = useNow();
  const lastEventAgeMs = now - diagnostics.lastEventTimestamp;
  const lastEventAge = formatDuration(lastEventAgeMs);
  const hasSubscription = Boolean(diagnostics.activeSubscriptionId);
  const quiet = diagnostics.status === "connected" && hasSubscription && lastEventAgeMs > 90_000;
  const socketLabel =
    diagnostics.status === "connected"
      ? hasSubscription
        ? quiet
          ? "QUIET"
          : "CONNECTED"
        : "SYNCING"
      : diagnostics.status.toUpperCase();

  const health = useQuery({
    queryKey: ["runtime-health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
  const readiness = useQuery({
    queryKey: ["runtime-readiness"],
    queryFn: getReadiness,
    refetchInterval: 30_000,
  });
  const brokers = useQuery({
    queryKey: ["runtime-brokers"],
    queryFn: getBrokers,
    refetchInterval: 30_000,
  });
  const live = useQuery({
    queryKey: ["runtime-live-summary", regionKey],
    queryFn: () => getLiveSummary(iatas),
    refetchInterval: 15_000,
  });

  const brokerRows = brokers.data ?? health.data?.brokers ?? [];
  const connectedBrokers = brokerRows.filter((b) => b.connected).length;
  const brokerTone = brokerRows.length === 0 ? "warn" : connectedBrokers === brokerRows.length ? "good" : "danger";
  const apiTone = health.data?.status === "ok" ? "good" : health.data?.status === "degraded" ? "warn" : health.isError ? "danger" : "normal";
  const readyTone = readiness.data?.ready ? "good" : readiness.isError ? "danger" : readiness.data ? "warn" : "normal";
  const serviceLevel = readiness.data?.serviceLevel ?? health.data?.serviceLevel;
  const overallState = readiness.data?.ready && health.data?.status === "ok" && serviceLevel?.status !== "degraded" ? "HEALTHY" : "DEGRADED";
  const overallTone = overallState === "HEALTHY" ? "good" : "warn";
  const build = health.data?.build ?? readiness.data?.build;
  const backup = health.data?.backup ?? readiness.data?.backup;
  const maintenance = Object.entries(health.data?.backgroundTasks ?? {}).sort(([, a], [, b]) => (b.lastFinishedAt ?? 0) - (a.lastFinishedAt ?? 0))[0];
  const scopeLabel = iatas ? (iatas.length <= 3 ? iatas.join(", ") : `${iatas.length} IATA`) : "ALL";
  const gapLabel =
    diagnostics.laggedNoticeCount === 0
      ? "NONE"
      : `${diagnostics.lastLaggedDroppedCount ?? 0} dropped`;
  const gapDetail = diagnostics.lastLaggedAt ? `${formatDuration(now - diagnostics.lastLaggedAt)} ago` : "";

  const rootClass =
    variant === "page"
      ? "runtime-status-panel w-full max-w-4xl space-y-3 rounded-sm border border-border bg-bg-surface p-3 font-mono md:p-4"
      : "runtime-status-panel w-72 space-y-2 px-3 py-2 font-mono";
  const metricGridClass = variant === "page" ? "grid grid-cols-2 gap-2 md:grid-cols-4" : "grid grid-cols-2 gap-1.5";
  const brokerClass = variant === "page" ? "max-h-56 space-y-1 overflow-y-auto border-t border-border-subtle pt-3" : "max-h-24 space-y-1 overflow-y-auto border-t border-border-subtle pt-2";

  return (
    <div className={rootClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim">System</div>
          <div className={`${variant === "page" ? "text-xl" : "text-sm"} font-semibold ${variant === "page" ? toneClass(overallTone) : "text-text-bright"}`}>{variant === "page" ? overallState : socketLabel}</div>
        </div>
        <div className="rounded border border-border-subtle bg-bg-base/60 px-2 py-1 text-right text-[10px] text-text-muted">
          <div className="text-text-dim">SCOPE</div>
          <div className="max-w-28 truncate text-text-normal">{scopeLabel}</div>
        </div>
      </div>

      <div className={metricGridClass}>
        <RuntimeMetric label="Last Event" value={lastEventAge} tone={diagnostics.status === "connected" && !quiet ? "good" : "warn"} />
        <RuntimeMetric label="Reconnects" value={diagnostics.reconnectAttempt} tone={diagnostics.reconnectAttempt > 0 ? "warn" : "normal"} />
        <RuntimeMetric label="Parse Errors" value={diagnostics.parseFailureCount} tone={diagnostics.parseFailureCount > 0 ? "danger" : "normal"} />
        <RuntimeMetric label="API" value={health.data?.status ?? (health.isError ? "DOWN" : "...")} tone={apiTone} />
        <RuntimeMetric label="Ready" value={readiness.data?.ready === undefined ? (readiness.isError ? "NO" : "...") : readiness.data.ready ? "YES" : "NO"} tone={readyTone} />
        <RuntimeMetric label="Brokers" value={`${connectedBrokers}/${brokerRows.length || "?"}`} tone={brokerTone} />
        <RuntimeMetric label="Live Packets" value={live.data?.packetCount ?? "..."} tone={live.isError ? "danger" : "normal"} />
        <RuntimeMetric label="Gap Heal" value={gapDetail ? `${gapLabel} ${gapDetail}` : gapLabel} tone={diagnostics.laggedNoticeCount > 0 ? "warn" : "normal"} />
        {variant === "page" && <RuntimeMetric label="Worst SLO" value={serviceLevel?.worstRoute ? `${serviceLevel.worstP95Ms ?? "--"} / ${serviceLevel.targetMs ?? "--"} ms` : serviceLevel?.status ?? "UNKNOWN"} tone={toneForStatus(serviceLevel?.status)} />}
        {variant === "page" && <RuntimeMetric label="Build" value={`${build?.sha?.slice(0, 10) ?? "--"}${build?.dirty ? " DIRTY" : ""}`} tone={build?.dirty ? "warn" : "normal"} />}
        {variant === "page" && <RuntimeMetric label="Backup" value={backup?.ageMs !== undefined ? `${formatDuration(backup.ageMs)} ago` : backup?.status ?? "MISSING"} tone={toneForStatus(backup?.status)} />}
        {variant === "page" && <RuntimeMetric label="Maintenance" value={maintenance ? `${maintenance[0]} ${maintenance[1].lastStatus ?? "--"}` : "--"} tone={toneForStatus(maintenance?.[1].lastStatus)} />}
      </div>

      {diagnostics.activeSubscriptionId && (
        <div className="truncate border-t border-border-subtle pt-2 text-[10px] text-text-dim">
          SUB {diagnostics.activeSubscriptionId}
        </div>
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

      {variant === "page" && (
        <RuntimeDiagnosticsDetails health={health.data} readiness={readiness.data} now={now} />
      )}
    </div>
  );
}
