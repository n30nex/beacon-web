import { RouteStatePanel } from "../../components/RouteStatePanel";

interface LiveMapStatusOverlayProps {
  onReload: () => void;
}

export function LiveMapStatusOverlay({ onReload }: LiveMapStatusOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 bg-bg-base">
      <RouteStatePanel
        title="Live map failed to load"
        subtitle="The basemap could not initialize. Retry after the network, browser graphics context, or style service recovers."
        tone="danger"
        action={
          <button
            type="button"
            className="rounded-sm border border-danger/45 bg-danger/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/15"
            onClick={onReload}
          >
            Reload live map
          </button>
        }
      />
    </div>
  );
}
