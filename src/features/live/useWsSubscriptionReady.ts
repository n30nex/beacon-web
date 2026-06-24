import { useEffect, useState } from "react";
import type { WsManager } from "../../api/ws-manager";

function wsSubscriptionReady(manager: WsManager): boolean {
  const diagnostics = manager.getDiagnostics();
  return diagnostics.status === "connected" && Boolean(diagnostics.activeSubscriptionId);
}

export function useWsSubscriptionReady(manager: WsManager): boolean {
  const [ready, setReady] = useState(() => wsSubscriptionReady(manager));

  useEffect(() => {
    return manager.onDiagnosticsChange(() => {
      const next = wsSubscriptionReady(manager);
      setReady((current) => (current === next ? current : next));
    });
  }, [manager]);

  return ready;
}
