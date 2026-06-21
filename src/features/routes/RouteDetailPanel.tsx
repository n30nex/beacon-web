import { useCallback, useState } from "react";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { ResolvedHopBlock } from "../packets/PathData";
import type { KnownRoute, ResolvedHop } from "../../types/api";
import { VARIANT_CLASSES } from "../../components/badge-utils";
import { buildRouteJsonExport, routeJsonFilename } from "./route-export";

// Detail for a selected known route. The /routes list already carries the full hops, so this takes the
// route object directly — no extra fetch. Hops reuse the packet path renderer's block (high-confidence
// by definition); the node label lights up if/when the server populates hop.node.
interface RouteDetailPanelProps {
  route: KnownRoute;
  onClose: () => void;
  onViewOnMap: (route: KnownRoute) => void;
}

function RouteJsonActions({ route }: { route: KnownRoute }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const routeJson = useCallback(() => JSON.stringify(buildRouteJsonExport(route), null, 2), [route]);

  const flash = useCallback((next: "copied" | "failed") => {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 1500);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(routeJson());
      flash("copied");
    } catch {
      flash("failed");
    }
  }, [flash, routeJson]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([routeJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = routeJsonFilename(route);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [route, routeJson]);

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${status === "copied" ? VARIANT_CLASSES.live : status === "failed" ? VARIANT_CLASSES.stale : VARIANT_CLASSES.text}`}
        onClick={handleCopy}
        aria-label="Copy route JSON"
      >
        {status === "copied" ? "Copied JSON" : status === "failed" ? "Copy Failed" : "Copy JSON"}
      </button>
      <button
        type="button"
        className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase cursor-pointer transition-colors ${VARIANT_CLASSES.text}`}
        onClick={handleDownload}
        aria-label="Download route JSON"
      >
        Save JSON
      </button>
    </>
  );
}

export function RouteDetailPanel({ route, onClose, onViewOnMap }: RouteDetailPanelProps) {
  return (
    <DetailPanel title="Route Detail" onClose={onClose} actions={<RouteJsonActions route={route} />}>
      <Section title="Summary" first>
        <div className="flex items-center gap-3 font-mono text-[13px]">
          <Badge variant="default">{route.iata}</Badge>
          <Field label="Hops" value={route.hopCount} />
          <Field label="Obs" value={route.observationCount.toLocaleString()} />
        </div>
        <button
          type="button"
          onClick={() => onViewOnMap(route)}
          className="mt-3 w-full rounded-sm border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/15 hover:text-text-bright"
        >
          View on Map
        </button>
      </Section>

      <Section title="Route">
        <div className="flex flex-col gap-1.5">
          {route.hops.map((hop, i) => {
            const resolved: ResolvedHop = { confidence: "high", nodes: hop.node ? [hop.node] : [] };
            return (
              <div key={i} className="flex items-center gap-2 font-mono text-[13px]">
                <span className="text-text-dim w-6 shrink-0">#{i + 1}</span>
                <ResolvedHopBlock hop={resolved} label={hop.hashBytes.toUpperCase()} />
                {hop.node?.name && <span className="text-text-muted truncate">{hop.node.name}</span>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Timestamps">
        <div className="flex flex-col gap-0.5 font-mono text-[13px]">
          <Field label="First seen" value={<Timestamp value={route.firstSeen} />} />
          <Field label="Last seen" value={<Timestamp value={route.lastSeen} />} />
        </div>
      </Section>
    </DetailPanel>
  );
}
