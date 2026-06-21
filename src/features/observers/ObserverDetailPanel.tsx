import { useCallback, useState } from "react";
import type { Observer, AdvertObservation } from "./types";
import { useQuery } from "@tanstack/react-query";
import { getObserver, getObserverAdverts, getObserverTopology } from "../../api/client";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { formatUptime, formatBattery, formatHex, formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES, formatCount } from "../../lib/formatters";
import { sanitizeDisplayLabel } from "../../lib/display-label";
import { Timestamp } from "../../components/Timestamp";
import { TerminalLoadingState } from "../../components/TerminalLoader";
import { useTick } from "../../hooks/useTick";
import { useRegion } from "../../hooks/useRegion";
import { deriveObserverStatus } from "./observer-status";
import { VARIANT_CLASSES, type BadgeVariant } from "../../components/badge-utils";
import { IataChip } from "../../components/IataChip";
import { ScopeTag } from "../../components/ScopeTag";
import type { StatsRange } from "../stats/types";
import type { CursorPage } from "../../types/api";
import type { ObserverTopologySummary } from "./types";
import { buildObserverJsonExport, observerJsonFilename, type ObserverHealthStats } from "./observer-export";

function AdvertRow({ advert, onClick }: { advert: AdvertObservation; onClick?: () => void }) {
  const level = snrLevel(advert.snr);
  const nodeLabel = sanitizeDisplayLabel(advert.nodeName, advert.nodePublicKey ? formatHex(advert.nodePublicKey) : "unknown");
  const hasNodeName = Boolean(advert.nodeName && nodeLabel !== "unknown");
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 border-l-2 border-l-primary ${onClick ? "cursor-pointer hover:bg-primary/8" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] mb-1.5">
        <span className={`font-mono font-semibold tracking-wider truncate ${hasNodeName ? "text-primary" : "text-text-dim italic"}`}>
          {nodeLabel}
        </span>
        <IataChip>{advert.iata}</IataChip>
        <Timestamp value={advert.heardAt} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="flex gap-5 font-mono text-xs">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>{formatSnr(advert.snr)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>{advert.rssi ?? "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Hops</span>
          <span className="font-medium text-text-normal">{advert.hopCount ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

// broker freshness badge: <5m = live, <30m = stale
function brokerStatusVariant(lastPacketAt: number | null): BadgeVariant {
  if (!lastPacketAt) return "offline";
  const ageMs = Date.now() - lastPacketAt;
  return ageMs < 5 * 60_000 ? "live" : ageMs < 30 * 60_000 ? "stale" : "offline";
}

// stats shape depends on the observer's firmware, so we just grab what we recognize
function getStats(metadata: Record<string, unknown> | undefined): ObserverHealthStats | null {
  if (!metadata?.stats || typeof metadata.stats !== "object") return null;
  return metadata.stats as ObserverHealthStats;
}

function formatAirtime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function RadioSection({ observer, noiseFloor }: { observer: Observer; noiseFloor?: number | null }) {
  const parts = [
    observer.radioFreqMhz && `${observer.radioFreqMhz} MHz`,
    observer.radioSf && `SF${observer.radioSf}`,
    observer.radioBwKhz && `${observer.radioBwKhz} kHz`,
    observer.radioCr && `CR 4/${observer.radioCr}`,
  ].filter(Boolean) as string[];

  return (
    <Section title="Radio">
      <div className="font-mono text-[13px] text-text-muted">
        {parts.join(" · ")}
      </div>
      {noiseFloor != null && (
        <div className="font-mono text-[13px] mt-1">
          <Field label="Noise floor" value={`${noiseFloor} dBm`} />
        </div>
      )}
    </Section>
  );
}

function ObserverJsonActions({
  observer,
  derivedStatus,
  range,
  regionKey,
  iatas,
  healthStats,
  topology,
  adverts,
}: {
  observer: Observer;
  derivedStatus: Observer["status"];
  range: StatsRange;
  regionKey: string;
  iatas?: string[];
  healthStats?: ObserverHealthStats | null;
  topology?: ObserverTopologySummary;
  adverts?: CursorPage<AdvertObservation>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const observerJson = useCallback(
    () => JSON.stringify(buildObserverJsonExport({ observer, derivedStatus, range, regionKey, iatas, healthStats, topology, adverts }), null, 2),
    [adverts, derivedStatus, healthStats, iatas, observer, range, regionKey, topology],
  );

  const flash = useCallback((next: "copied" | "failed") => {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 1500);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(observerJson());
      flash("copied");
    } catch {
      flash("failed");
    }
  }, [flash, observerJson]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([observerJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = observerJsonFilename(observer.id);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [observer.id, observerJson]);

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${status === "copied" ? VARIANT_CLASSES.live : status === "failed" ? VARIANT_CLASSES.stale : VARIANT_CLASSES.text}`}
        onClick={handleCopy}
        aria-label="Copy observer JSON"
      >
        {status === "copied" ? "Copied JSON" : status === "failed" ? "Copy Failed" : "Copy JSON"}
      </button>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${VARIANT_CLASSES.text}`}
        onClick={handleDownload}
        aria-label="Download observer JSON"
      >
        Save JSON
      </button>
    </>
  );
}

interface ObserverDetailPanelProps {
  observerId: string;
  range: StatsRange;
  onClose: () => void;
  onAnalyzePacket?: (hash: string) => void;
  onViewStats?: (observerId: string) => void;
}

export function ObserverDetailPanel({ observerId, range, onClose, onAnalyzePacket, onViewStats }: ObserverDetailPanelProps) {
  const { iatas, regionKey } = useRegion();
  const { data: observer, isLoading } = useQuery({
    queryKey: ["observer", observerId],
    queryFn: () => getObserver(observerId),
    staleTime: 30_000,
  });

  const { data: topology, isLoading: topologyLoading } = useQuery({
    queryKey: ["observer-topology", observerId, regionKey, range],
    queryFn: () => getObserverTopology(observerId, iatas, { range, limit: 12 }),
    staleTime: 30_000,
  });

  const { data: adverts } = useQuery({
    queryKey: ["observer-adverts", observerId],
    queryFn: () => getObserverAdverts(observerId, { limit: 50 }),
    staleTime: 30_000,
  });

  useTick(); // re-derive the status badge as lastStatusAt ages
  const stats = observer ? getStats(observer.statusMetadata) : null;
  const status = observer ? deriveObserverStatus(observer) : null;
  const observerLabel = observer ? sanitizeDisplayLabel(observer.displayName, observer.id.slice(0, 8)) : "";

  return (
    <DetailPanel
      title="Observer Detail"
      onClose={onClose}
      isLoading={isLoading}
      notFound={!observer}
      notFoundLabel="Observer not found"
      actions={
        observer && status ? (
          <ObserverJsonActions
            observer={observer}
            derivedStatus={status}
            range={range}
            regionKey={regionKey}
            iatas={iatas}
            healthStats={stats}
            topology={topology}
            adverts={adverts}
          />
        ) : undefined
      }
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      }
    >
      {observer && (
        <>
          <Section title="Summary" first>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-semibold text-primary tracking-wider">
                  {observerLabel}
                </span>
                <Badge variant={status === "online" ? "live" : "offline"}>
                  {status}
                </Badge>
              </div>
              <div className="font-mono text-[13px] text-text-muted truncate mb-1.5" title={observer.publicKey}>
                {observer.publicKey}
              </div>
              <div className="flex items-center gap-3 font-mono text-[13px]">
                <Field label="Observations" value={observer.observationCount.toLocaleString()} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {observer.observerType && <Badge variant="default">{observer.observerType}</Badge>}
                <IataChip>{observer.iata}</IataChip>
                {observer.scopes?.map((s) => (
                  <ScopeTag key={s}>{s}</ScopeTag>
                ))}
              </div>
              {onViewStats && (
                <button
                  type="button"
                  onClick={() => onViewStats(observer.id)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded border border-border bg-bg-base px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal transition-colors cursor-pointer hover:border-primary hover:text-primary"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 20V4M4 20h16M8 16v-4M13 16V8M18 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Statistics
                </button>
              )}
            </Section>

            {(observer.radioFreqMhz || observer.radioSf || observer.radioBwKhz || observer.radioCr) && (
              <RadioSection observer={observer} noiseFloor={stats?.noise_floor} />
            )}

            {(observer.firmwareVersion || observer.softwareVersion || observer.hardwareModel) && (
              <Section title="Firmware">
                <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                  {observer.firmwareVersion && <Field label="Version" value={observer.firmwareVersion} />}
                  {observer.softwareVersion && <Field label="Software" value={observer.softwareVersion} />}
                  {observer.hardwareModel && <Field label="Hardware" value={observer.hardwareModel} />}
                </div>
              </Section>
            )}

            <Section title="Status">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                {observer.batteryLevel != null && <Field label="Battery" value={formatBattery(observer.batteryLevel)} />}
                {observer.uptimeSeconds != null && <Field label="Uptime" value={formatUptime(observer.uptimeSeconds)} />}
                {stats?.queue_len != null && <Field label="Queue" value={stats.queue_len} />}
              </div>
              {observer.lastStatusAt && (
                <div className="font-mono text-[13px] mt-1">
                  <Field label="Last status" value={<Timestamp value={observer.lastStatusAt} />} />
                </div>
              )}
            </Section>

            {stats && (stats.rx_air_secs != null || stats.tx_air_secs != null || stats.recv_errors != null) && (
              <Section title="Airtime">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                  {stats.rx_air_secs != null && <Field label="RX" value={formatAirtime(stats.rx_air_secs)} />}
                  {stats.tx_air_secs != null && <Field label="TX" value={formatAirtime(stats.tx_air_secs)} />}
                </div>
                {(stats.recv_errors != null || stats.errors != null) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px] mt-1">
                    {stats.recv_errors != null && <Field label="Recv errors" value={stats.recv_errors.toLocaleString()} />}
                    {stats.errors != null && <Field label="Errors" value={stats.errors.toLocaleString()} />}
                  </div>
                )}
              </Section>
            )}

            <Section title="Topology Window">
              {topologyLoading ? (
                <TerminalLoadingState label="QUERYING OBSERVER TOPOLOGY" detail="PLEASE WAIT" />
              ) : topology ? (
                <div className="flex flex-col gap-2 font-mono text-[12px]">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field label="Packets" value={formatCount(topology.packetCount)} />
                    <Field label="Obs" value={formatCount(topology.observationCount)} />
                    <Field label="IATAs" value={formatCount(topology.activeIatas)} />
                    <Field label="Avg SNR" value={topology.avgSnr != null ? `${topology.avgSnr.toFixed(1)} dB` : "-"} />
                  </div>
                  <div className="rounded-sm border border-border-subtle bg-bg-base/55 p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Payload / route mix</div>
                    <div className="flex flex-wrap gap-1.5">
                      {topology.payloadMix.slice(0, 4).map((item) => (
                        <Badge key={`p-${item.payloadType}`} variant="default">{item.payloadTypeName} {formatCount(item.count)}</Badge>
                      ))}
                      {topology.routeMix.slice(0, 3).map((item) => (
                        <Badge key={`r-${item.routeType}`} variant="default">{item.routeTypeName} {formatCount(item.count)}</Badge>
                      ))}
                      {topology.payloadMix.length === 0 && topology.routeMix.length === 0 && <span className="text-text-dim">No mix data</span>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Top heard nodes</div>
                    <div className="flex flex-col gap-1">
                      {topology.topNodes.slice(0, 5).map((node) => (
                        <div key={node.id} className="flex items-center justify-between gap-2 rounded-sm border border-border-subtle bg-bg-base/40 px-2 py-1">
                          <span className="min-w-0 truncate text-primary">{sanitizeDisplayLabel(node.name, formatHex(node.publicKey))}</span>
                          <span className="text-text-muted">{formatCount(node.observationCount)} obs</span>
                        </div>
                      ))}
                      {topology.topNodes.length === 0 && <span className="text-text-dim">No resolved origin nodes</span>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Trace / ping tags</div>
                    <div className="flex flex-col gap-1">
                      {topology.topTraceTags.slice(0, 4).map((trace) => (
                        <div key={trace.traceTag} className="flex items-center justify-between gap-2 rounded-sm border border-border-subtle bg-bg-base/40 px-2 py-1">
                          <span className="min-w-0 truncate text-secondary">{trace.traceTag.toUpperCase()}</span>
                          <span className="text-text-muted">{trace.traceType} / {formatCount(trace.observationCount)}</span>
                        </div>
                      ))}
                      {topology.topTraceTags.length === 0 && <span className="text-text-dim">No traces heard</span>}
                    </div>
                  </div>
                  {topology.topScopes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topology.topScopes.slice(0, 6).map((scope) => (
                        <ScopeTag key={scope.scope}>{scope.scope} {formatCount(scope.observationCount)}</ScopeTag>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No topology summary</div>
              )}
            </Section>

            {observer.brokers.length > 0 && (
              <Section title="Brokers">
                <div className="flex flex-col gap-1.5">
                  {[...observer.brokers].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((b) => {
                    const variant = brokerStatusVariant(b.lastPacketAt);
                    return (
                      <div key={b.name} className="flex items-center gap-3">
                        <Badge variant={variant}>{b.name}</Badge>
                        <div className="flex items-center gap-3 font-mono text-[13px]">
                          <Field label="Seen" value={<Timestamp value={b.lastSeenAt} />} />
                          <Field label="Packet" value={b.lastPacketAt ? <Timestamp value={b.lastPacketAt} /> : "—"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Adverts heard">
              {adverts && adverts.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {adverts.items.map((a) => (
                    <AdvertRow
                      key={a.id}
                      advert={a}
                      onClick={onAnalyzePacket ? () => onAnalyzePacket(a.packetHash) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No adverts heard</div>
              )}
            </Section>

            <Section title="Timestamps">
              <div className="flex items-center gap-3 font-mono text-[13px]">
                <Field label="First" value={<Timestamp value={observer.firstSeen} />} />
                <span className="text-[6px] text-border" aria-hidden>·</span>
                <Field label="Last" value={<Timestamp value={observer.lastSeen} />} />
              </div>
            </Section>
        </>
      )}
    </DetailPanel>
  );
}
