import { RouteStatePanel } from "../../components/RouteStatePanel";

interface TopologySnapshotErrorStateProps {
  onRetry: () => void;
}

export function TopologySnapshotErrorState({ onRetry }: TopologySnapshotErrorStateProps) {
  return (
    <RouteStatePanel
      title="Topology snapshot unavailable"
      subtitle="Beacon could not load the current verified-route graph. Retry after the API or database recovers."
      tone="danger"
      action={
        <button
          type="button"
          className="rounded-sm border border-danger/45 bg-danger/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/15"
          onClick={onRetry}
        >
          Retry topology snapshot
        </button>
      }
    />
  );
}

export function EmptyTopologyState() {
  return (
    <RouteStatePanel
      title="No connected public routes yet"
      subtitle="Verified routes will appear here after Beacon observes high-confidence multi-hop paths. Try a wider region or route limit if traffic should be visible."
    />
  );
}
