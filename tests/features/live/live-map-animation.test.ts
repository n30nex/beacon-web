import { describe, expect, it, vi, afterEach } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { LivePacketEvent } from "../../../src/features/live/live-model";
import {
  buildIataCoordMap,
  buildNodeCoordMaps,
  playLivePacketAnimation,
  resolveObserverTarget,
} from "../../../src/features/live/live-map-animation";

function ref<T>(current: T) {
  return { current };
}

function event(overrides: Partial<LivePacketEvent> = {}): LivePacketEvent {
  return {
    id: "event-1",
    sequence: 1,
    packetHash: "abc123",
    payloadType: 1,
    payloadTypeName: "TEXT_MESSAGE",
    routeType: 0,
    routeTypeName: "DIRECT",
    rawHex: "AABBCCDDEEFF",
    observationCount: 2,
    observationId: 10,
    observerId: "observer-1",
    observerName: "Observer",
    iata: "YYZ",
    heardAt: Date.now(),
    receivedAt: Date.now(),
    rssi: -80,
    snr: 4,
    sourceBroker: "test",
    ...overrides,
  };
}

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: "node-1",
    publicKey: "AABBCCDDEEFF0011",
    nodeType: 1,
    nodeTypeName: "Client",
    name: "Node 1",
    lat: 43.65,
    lng: -79.38,
    iatas: [{ iata: "YYZ", lastHeard: Date.now() }],
    ...overrides,
  };
}

function visibleMap() {
  const setFeatureState = vi.fn();
  return {
    getContainer: () => ({
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    }),
    getSource: () => ({}),
    project: () => ({ x: 400, y: 300 }),
    setFeatureState,
  } as unknown as MapLibreMap & { setFeatureState: ReturnType<typeof vi.fn> };
}

describe("live-map-animation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("indexes map nodes by ids, public keys, observer ids, and path prefixes", () => {
    const maps = buildNodeCoordMaps([
      node({ id: "node-a", publicKey: "AABBCCDDEEFF0011", observerId: "observer-1" }),
    ]);

    expect(maps.byKey.get("node-a")?.id).toBe("node-a");
    expect(maps.byKey.get("aabbccddeeff0011")?.id).toBe("node-a");
    expect(maps.byKey.get("observer-1")?.id).toBe("node-a");
    expect(maps.byPathPrefix.get("AABB")?.[0]?.id).toBe("node-a");
  });

  it("resolves observer targets from nodes before falling back to IATA coordinates", () => {
    const maps = buildNodeCoordMaps([
      node({ id: "node-a", name: "Ridge", observerId: "observer-1" }),
    ]);
    const iatas = buildIataCoordMap([{ iata: "YYZ", lat: 43, lon: -79, regionId: 1, regionName: "Ontario" }]);

    expect(resolveObserverTarget(event(), maps.byKey, iatas)?.label).toBe("Ridge");
    expect(resolveObserverTarget(event({ observerId: "unknown" }), maps.byKey, iatas)?.coord).toEqual({ lat: 43, lng: -79 });
  });

  it("constructs visible route animations, pulses, heat, rain, and requests a canvas frame", () => {
    vi.useFakeTimers();
    const map = visibleMap();
    const maps = buildNodeCoordMaps([
      node({ id: "observer-node", publicKey: "FFEEDDCCBBAA0011", observerId: "observer-1", lat: 43.7, lng: -79.4 }),
    ]);
    const requestCanvasFrame = vi.fn();
    const playPacketAudio = vi.fn();
    const animationsRef = ref([]);
    const pulsesRef = ref([]);
    const heatRef = ref([]);
    const rainRef = ref([]);

    const played = playLivePacketAnimation({
      animationsRef,
      byPathPrefix: maps.byPathPrefix,
      colorByHash: false,
      event: event({
        resolvedPath: [
          {
            confidence: "high",
            nodes: [{ id: "node-a", publicKey: "AAAA", latitude: 43.61, longitude: -79.36 }],
          },
          {
            confidence: "high",
            nodes: [{ id: "node-b", publicKey: "BBBB", latitude: 43.63, longitude: -79.37 }],
          },
        ],
      }),
      heatRef,
      iataCoords: new Map(),
      map,
      matrixMode: true,
      matrixRain: true,
      nodeCoords: maps.byKey,
      playPacketAudio,
      pulsesRef,
      rainRef,
      requestCanvasFrame,
      visualPressureRef: ref(0),
      visualQueueRef: ref([]),
      waveCount: 2,
      waveIndex: 1,
    });

    expect(played).toBe(true);
    expect(animationsRef.current).toHaveLength(1);
    expect(animationsRef.current[0].path).toHaveLength(3);
    expect(animationsRef.current[0].waveIndex).toBe(1);
    expect(pulsesRef.current.length).toBeGreaterThanOrEqual(2);
    expect(heatRef.current).toHaveLength(3);
    expect(rainRef.current).toHaveLength(1);
    expect(playPacketAudio).toHaveBeenCalledTimes(1);
    expect(requestCanvasFrame).toHaveBeenCalledTimes(1);
    expect(map.setFeatureState).toHaveBeenCalled();
  });
});
