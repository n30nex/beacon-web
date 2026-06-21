import type { ReactNode } from "react";
import { CloseButton } from "./CloseButton";
import { TerminalLoadingState } from "./TerminalLoader";

// shared scaffolding for the right-hand entity detail panels (observers, nodes, …)

export function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${first ? "" : "border-t border-border-subtle"}`}>
      <div className="text-xs font-mono font-medium text-text-bright uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span><span className="text-text-dim">{label} </span><span className="text-text-normal">{value}</span></span>
  );
}

interface DetailPanelProps {
  title: string;
  onClose: () => void;
  isLoading?: boolean;
  notFound?: boolean;
  notFoundIcon?: ReactNode;
  notFoundLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function DetailPanel({ title, onClose, isLoading, notFound, notFoundIcon, notFoundLabel = "Not found", actions, children }: DetailPanelProps) {
  return (
    <div className="crt-panel absolute inset-0 z-30 w-full md:static md:inset-auto md:z-auto md:shrink-0 md:w-[400px] md:border-l border-border bg-bg-surface flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="shrink-0 pt-1 text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">{title}</span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {actions}
          <CloseButton onClose={onClose} label="Close detail panel" className="-mr-1" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <TerminalLoadingState label="QUERYING DETAIL" detail="PLEASE WAIT" className="h-full" />
        ) : notFound ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            {notFoundIcon}
            <span className="text-[13px] font-mono">{notFoundLabel}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
