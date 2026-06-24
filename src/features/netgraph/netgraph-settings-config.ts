import {
  DEFAULT_NETGRAPH_GALAXY_PROFILE,
  DEFAULT_NETGRAPH_ROUTE_LIMIT,
  DEFAULT_NETGRAPH_VISUAL_PROFILE,
  type NetgraphCinematicPreset,
  type NetgraphGalaxyProfile,
  type NetgraphRouteLimit,
  type NetgraphVisualProfile,
} from "./netgraph-model";

export const MOBILE_NETGRAPH_ROUTE_LIMIT: NetgraphRouteLimit = 800;
export const MOBILE_NETGRAPH_QUERY = "(max-width: 767px)";

export const CINEMATIC_PRESETS: Record<NetgraphCinematicPreset, {
  label: string;
  description: string;
  galaxy: NetgraphGalaxyProfile;
  visual: NetgraphVisualProfile;
}> = {
  cinematic: {
    label: "Cinematic",
    description: "Balanced spectacle",
    galaxy: DEFAULT_NETGRAPH_GALAXY_PROFILE,
    visual: DEFAULT_NETGRAPH_VISUAL_PROFILE,
  },
  clarity: {
    label: "Clarity",
    description: "Readable topology",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spherical",
      clusterScale: 2.12,
      spiralIntensity: 0.28,
      depthContrast: 2.78,
      settleStrength: 1.46,
      edgeSpacingScale: 2.08,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.92,
      nodeScale: 2.2,
      labelScale: 1.48,
      labelDensity: 1.25,
      edgeOpacity: 1.32,
      pulseDensity: 1.05,
      glowDensity: 0.95,
      glowIntensity: 1.12,
      starDensity: 0.72,
      cameraDistanceScale: 0.86,
      atmosphereDensity: 0.82,
    },
  },
  performance: {
    label: "Performance",
    description: "Lean effects",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spherical",
      clusterScale: 1.88,
      spiralIntensity: 0.18,
      depthContrast: 2.48,
      settleStrength: 1.26,
      edgeSpacingScale: 1.72,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.72,
      nodeScale: 2.02,
      labelScale: 1.12,
      labelDensity: 0.7,
      edgeOpacity: 0.82,
      pulseDensity: 0.72,
      glowDensity: 0.62,
      glowIntensity: 0.86,
      starDensity: 0.45,
      cameraDistanceScale: 0.96,
      atmosphereDensity: 0.55,
    },
  },
  presentation: {
    label: "Presentation",
    description: "Showpiece orbit",
    galaxy: {
      ...DEFAULT_NETGRAPH_GALAXY_PROFILE,
      seedShape: "spiral",
      clusterScale: 2.68,
      spiralIntensity: 0.9,
      depthContrast: 3.35,
      settleStrength: 1.88,
      edgeSpacingScale: 2.8,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 1.9,
      orbitControlSpeed: 1.28,
      nodeScale: 2.58,
      labelScale: 1.64,
      labelDensity: 0.9,
      edgeOpacity: 1.45,
      pulseDensity: 1.72,
      glowDensity: 1.62,
      glowIntensity: 2.05,
      starDensity: 1.4,
      cameraDistanceScale: 0.82,
      atmosphereDensity: 1.45,
      focusHaloScale: 1.18,
    },
  },
};

export function defaultRouteLimitForViewport(): NetgraphRouteLimit {
  if (typeof window !== "undefined" && window.matchMedia?.(MOBILE_NETGRAPH_QUERY).matches) {
    return MOBILE_NETGRAPH_ROUTE_LIMIT;
  }
  return DEFAULT_NETGRAPH_ROUTE_LIMIT;
}
