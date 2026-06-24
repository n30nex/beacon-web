import type { ReactNode } from "react";
import { BeaconLogo } from "./BeaconLogo";

interface RouteStatePanelProps {
  title: string;
  subtitle?: string;
  tone?: "neutral" | "danger" | "warning";
  action?: ReactNode;
}

export function RouteStatePanel({ title, subtitle, tone = "neutral", action }: RouteStatePanelProps) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn" : "text-border";
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 p-4 text-center">
      <BeaconLogo size={40} className={toneClass} />
      <div className="max-w-md">
        <div className="text-sm font-semibold text-text-bright">{title}</div>
        {subtitle && <div className="mt-1 font-mono text-[11px] leading-relaxed text-text-dim">{subtitle}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
