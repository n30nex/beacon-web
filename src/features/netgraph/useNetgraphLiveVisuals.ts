import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLiveBackfill } from "../../api/client";
import type { WsManager } from "../../api/ws-manager";
import type { WsPacketObservation } from "../../types/ws";
import {
  MAX_NETGRAPH_GLOWS,
  MAX_NETGRAPH_PULSES,
  packetObservationToNetgraphLiveVisual,
  type NetgraphGlow,
  type NetgraphGraph,
  type NetgraphPulse,
  type NetgraphRouteLimit,
  type NetgraphRouteHeat,
} from "./netgraph-model";
import { mergePulseRouteHeat, pruneRouteHeat } from "./netgraph-route-heat";

interface UseNetgraphLiveVisualsArgs {
  graph: NetgraphGraph;
  iatas: string[] | undefined;
  regionKey: string;
  routeLimit: NetgraphRouteLimit;
  wsManager?: WsManager;
}

export function useNetgraphLiveVisuals({
  graph,
  iatas,
  regionKey,
  routeLimit,
  wsManager,
}: UseNetgraphLiveVisualsArgs) {
  const [pulses, setPulses] = useState<NetgraphPulse[]>([]);
  const [glows, setGlows] = useState<NetgraphGlow[]>([]);
  const [routeHeat, setRouteHeat] = useState<NetgraphRouteHeat[]>([]);
  const latestObservationIdRef = useRef(0);
  const seenLiveVisualIdsRef = useRef(new Set<string>());
  const graphRef = useRef(graph);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    seenLiveVisualIdsRef.current.clear();
    latestObservationIdRef.current = 0;
    const id = window.setTimeout(() => {
      setPulses([]);
      setGlows([]);
      setRouteHeat([]);
    }, 0);
    return () => window.clearTimeout(id);
  }, [regionKey, routeLimit]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRouteHeat((current) => pruneRouteHeat(current, Date.now()));
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  const pushLiveVisual = useCallback((data: WsPacketObservation["data"]) => {
    if (typeof data.observation.id === "number") {
      latestObservationIdRef.current = Math.max(latestObservationIdRef.current, data.observation.id);
    }
    const visual = packetObservationToNetgraphLiveVisual(data, graphRef.current, Date.now());
    if (!visual) return;
    const id = visual.type === "pulse" ? visual.pulse.id : visual.glow.id;
    if (seenLiveVisualIdsRef.current.has(id)) return;
    seenLiveVisualIdsRef.current.add(id);
    if (seenLiveVisualIdsRef.current.size > 900) {
      seenLiveVisualIdsRef.current = new Set(Array.from(seenLiveVisualIdsRef.current).slice(-450));
    }
    if (visual.type === "pulse") {
      setPulses((current) => [...current, visual.pulse].slice(-MAX_NETGRAPH_PULSES));
      setRouteHeat((current) => mergePulseRouteHeat(current, visual.pulse));
    } else {
      setGlows((current) => [...current, visual.glow].slice(-MAX_NETGRAPH_GLOWS));
    }
  }, []);

  useEffect(() => {
    if (graph.nodes.length === 0 || graph.edges.length === 0) return undefined;
    let cancelled = false;
    void getLiveBackfill(iatas, { afterObservationId: 0, limit: 80 }).then((page) => {
      if (cancelled) return;
      for (const item of page.items.slice().reverse()) pushLiveVisual(item);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [graph.edges.length, graph.nodes.length, iatas, pushLiveVisual]);

  useEffect(() => {
    if (!wsManager) return undefined;
    const offPacket = wsManager.onPacketObservation(pushLiveVisual);
    const offLagged = wsManager.onLagged(() => {
      const afterObservationId = latestObservationIdRef.current;
      if (afterObservationId <= 0) return;
      void getLiveBackfill(iatas, { afterObservationId, limit: 80 }).then((page) => {
        for (const item of page.items) pushLiveVisual(item);
      }).catch(() => undefined);
    });
    return () => {
      offPacket();
      offLagged();
    };
  }, [iatas, pushLiveVisual, wsManager]);

  const liveStats = useMemo(() => {
    const payloads = new Set<string>();
    for (const pulse of pulses) payloads.add(pulse.payloadTypeName);
    for (const glow of glows) payloads.add(glow.payloadTypeName);
    return {
      visualCount: pulses.length + glows.length,
      txCount: pulses.filter((pulse) => pulse.txNodeId).length + glows.filter((glow) => glow.direction === "tx").length,
      rxCount: pulses.filter((pulse) => pulse.rxNodeId).length + glows.filter((glow) => glow.direction === "rx").length,
      payloadText: Array.from(payloads).slice(0, 3).join(" / "),
    };
  }, [glows, pulses]);

  return { glows, liveStats, pulses, routeHeat };
}
