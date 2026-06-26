import {
  DEFAULT_NETGRAPH_GALAXY_PROFILE,
  DEFAULT_NETGRAPH_ROUTE_LIMIT,
  DEFAULT_NETGRAPH_VISUAL_PROFILE,
  type NetgraphCinematicPreset,
  type NetgraphGalaxyProfile,
  type NetgraphQualityMode,
  type NetgraphRouteLimit,
  type NetgraphVisualMode,
  type NetgraphVisualProfile,
} from "./netgraph-model";

export const MOBILE_NETGRAPH_ROUTE_LIMIT: NetgraphRouteLimit = 800;
export const MOBILE_NETGRAPH_QUERY = "(max-width: 767px)";

export const NETGRAPH_VISUAL_MODE_CONFIGS: Record<NetgraphVisualMode, {
  label: string;
  detail: string;
  quality: NetgraphQualityMode;
  galaxy: NetgraphGalaxyProfile;
  visual: NetgraphVisualProfile;
}> = {
  galaxy: {
    label: "Galaxy",
    detail: "Full assets / live packets",
    quality: "high",
    galaxy: DEFAULT_NETGRAPH_GALAXY_PROFILE,
    visual: DEFAULT_NETGRAPH_VISUAL_PROFILE,
  },
  "low-power": {
    label: "Low Power",
    detail: "FPS / lean render",
    quality: "battery",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spherical",
      clusterScale: 2.02,
      spiralIntensity: 0.1,
      depthContrast: 2.72,
      settleStrength: 1.18,
      edgeSpacingScale: 1.92,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0,
      orbitDamping: 0.12,
      nodeScale: 2,
      labelScale: 0.96,
      labelDensity: 0.42,
      edgeOpacity: 0.45,
      pulseDensity: 0,
      glowDensity: 0,
      glowIntensity: 0.55,
      starDensity: 0.2,
      lightIntensity: 0.88,
      atmosphereDensity: 0.25,
      cameraDistanceScale: 1.06,
      focusHaloScale: 0.58,
    },
  },
};

export const CINEMATIC_PRESETS: Record<NetgraphCinematicPreset, {
  label: string;
  description: string;
  galaxy: NetgraphGalaxyProfile;
  visual: NetgraphVisualProfile;
}> = {
  cinematic: {
    label: "Cinematic",
    description: "Dimensional clarity",
    galaxy: DEFAULT_NETGRAPH_GALAXY_PROFILE,
    visual: DEFAULT_NETGRAPH_VISUAL_PROFILE,
  },
  clarity: {
    label: "Clarity",
    description: "Readable topology",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spherical",
      clusterScale: 2.32,
      spiralIntensity: 0.22,
      depthContrast: 3.02,
      settleStrength: 1.52,
      edgeSpacingScale: 2.34,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.62,
      orbitDamping: 0.11,
      nodeScale: 2.24,
      labelScale: 1.18,
      labelDensity: 1.04,
      edgeOpacity: 0.9,
      pulseDensity: 0.92,
      glowDensity: 0.82,
      glowIntensity: 1.08,
      starDensity: 0.58,
      cameraFov: 42,
      cameraDistanceScale: 0.94,
      atmosphereDensity: 0.74,
      focusHaloScale: 0.96,
    },
  },
  performance: {
    label: "Performance",
    description: "Lean effects",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spherical",
      clusterScale: 2.02,
      spiralIntensity: 0.12,
      depthContrast: 2.72,
      settleStrength: 1.18,
      edgeSpacingScale: 1.92,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.48,
      orbitDamping: 0.12,
      nodeScale: 2.08,
      labelScale: 1.02,
      labelDensity: 0.56,
      edgeOpacity: 0.62,
      pulseDensity: 0.5,
      glowDensity: 0.48,
      glowIntensity: 0.82,
      starDensity: 0.34,
      cameraDistanceScale: 1.02,
      atmosphereDensity: 0.46,
      focusHaloScale: 0.82,
    },
  },
  presentation: {
    label: "Presentation",
    description: "Showpiece orbit",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spiral",
      clusterScale: 2.76,
      spiralIntensity: 0.86,
      depthContrast: 3.38,
      settleStrength: 1.98,
      edgeSpacingScale: 2.88,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 1.86,
      orbitControlSpeed: 1.28,
      orbitDamping: 0.08,
      nodeScale: 2.62,
      labelScale: 1.36,
      labelDensity: 0.74,
      edgeOpacity: 1.3,
      pulseDensity: 1.84,
      glowDensity: 1.72,
      glowIntensity: 2.18,
      starDensity: 1.52,
      cameraFov: 50,
      cameraDistanceScale: 0.82,
      atmosphereDensity: 1.58,
      focusHaloScale: 1.28,
    },
  },
};

export function defaultRouteLimitForViewport(): NetgraphRouteLimit {
  if (typeof window !== "undefined" && window.matchMedia?.(MOBILE_NETGRAPH_QUERY).matches) {
    return MOBILE_NETGRAPH_ROUTE_LIMIT;
  }
  return DEFAULT_NETGRAPH_ROUTE_LIMIT;
}
