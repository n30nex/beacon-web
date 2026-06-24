import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NetgraphViewMode } from "./netgraph-model";

interface UseNetgraphSelectionArgs {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

function selectedRouteParam(params: URLSearchParams): number | null {
  const value = params.get("routeId");
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

export function useNetgraphSelection({ selectedNodeId, onSelectNode }: UseNetgraphSelectionArgs) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRouteId = selectedRouteParam(searchParams);
  const selectedNodeIdFromUrl = searchParams.get("nodeId");
  const effectiveSelectedNodeId = selectedNodeId ?? selectedNodeIdFromUrl;
  const [viewMode, setViewMode] = useState<NetgraphViewMode>(
    () => (selectedRouteId != null ? "routes" : effectiveSelectedNodeId ? "focus" : "galaxy"),
  );
  const previousFocusRef = useRef({ selectedNodeId: effectiveSelectedNodeId, selectedRouteId });

  useEffect(() => {
    const previous = previousFocusRef.current;
    if (selectedRouteId != null && selectedRouteId !== previous.selectedRouteId) setViewMode("routes");
    else if (effectiveSelectedNodeId && effectiveSelectedNodeId !== previous.selectedNodeId) setViewMode("focus");
    previousFocusRef.current = { selectedNodeId: effectiveSelectedNodeId, selectedRouteId };
  }, [effectiveSelectedNodeId, selectedRouteId]);

  const selectRoute = useCallback(
    (routeId: number) => {
      onSelectNode(null);
      setViewMode("routes");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("routeId", String(routeId));
        next.delete("nodeId");
        next.delete("routeReplay");
        return next;
      });
    },
    [onSelectNode, setSearchParams],
  );

  const selectNode = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
      setViewMode("focus");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("nodeId", nodeId);
        next.delete("routeId");
        next.delete("routeReplay");
        return next;
      });
    },
    [onSelectNode, setSearchParams],
  );

  const clearRoute = useCallback(() => {
    onSelectNode(null);
    setViewMode("galaxy");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("nodeId");
      next.delete("routeId");
      next.delete("routeReplay");
      return next;
    });
  }, [onSelectNode, setSearchParams]);

  const clearNode = useCallback(() => {
    onSelectNode(null);
    setViewMode("galaxy");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("nodeId");
      next.delete("routeReplay");
      return next;
    });
  }, [onSelectNode, setSearchParams]);

  const clearSelection = useCallback(() => {
    onSelectNode(null);
    setViewMode("galaxy");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("nodeId");
      next.delete("routeId");
      next.delete("routeReplay");
      return next;
    });
  }, [onSelectNode, setSearchParams]);

  const focusRouteMode = useCallback(() => {
    setViewMode("routes");
  }, []);

  const focusNodeMode = useCallback(() => {
    setViewMode("focus");
  }, []);

  const viewRouteOnMap = useCallback(() => {
    if (selectedRouteId == null) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "Map");
      next.set("routeId", String(selectedRouteId));
      next.set("routeReplay", "1");
      return next;
    });
  }, [selectedRouteId, setSearchParams]);

  const viewNodeOnMap = useCallback(() => {
    if (!effectiveSelectedNodeId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "Map");
      next.set("nodeId", effectiveSelectedNodeId);
      next.set("mapFocus", "node");
      next.delete("routeId");
      next.delete("routeReplay");
      return next;
    });
  }, [effectiveSelectedNodeId, setSearchParams]);

  return {
    clearNode,
    clearRoute,
    clearSelection,
    effectiveSelectedNodeId,
    focusNodeMode,
    focusRouteMode,
    selectNode,
    selectRoute,
    selectedRouteId,
    setViewMode,
    viewMode,
    viewNodeOnMap,
    viewRouteOnMap,
  };
}
