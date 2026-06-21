import { useSyncExternalStore } from "react";
import type { WsDiagnostics, WsManager } from "../api/ws-manager";

export function useWsDiagnostics(manager: WsManager): WsDiagnostics {
  return useSyncExternalStore(
    (listener) => manager.onDiagnosticsChange(listener),
    () => manager.getDiagnostics(),
  );
}
