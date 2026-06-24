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
      clusterScale: 1.76,
      spiralIntensity: 0.28,
      depthContrast: 2.45,
      settleStrength: 1.36,
      edgeSpacingScale: 1.65,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.92,
      nodeScale: 2.2,
      labelDensity: 1.25,
      edgeOpacity: 1.25,
      pulseDensity: 0.85,
      glowDensity: 0.85,
      glowIntensity: 0.92,
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
      clusterScale: 1.58,
      spiralIntensity: 0.18,
      depthContrast: 2.15,
      settleStrength: 1.2,
      edgeSpacingScale: 1.4,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 0.72,
      nodeScale: 2.02,
      labelDensity: 0.7,
      edgeOpacity: 0.82,
      pulseDensity: 0.55,
      glowDensity: 0.5,
      glowIntensity: 0.72,
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
      clusterScale: 2.05,
      spiralIntensity: 0.9,
      depthContrast: 2.8,
      settleStrength: 1.62,
      edgeSpacingScale: 1.95,
    },
    visual: {
      ...DEFAULT_NETGRAPH_VISUAL_PROFILE,
      autoRotateSpeed: 1.9,
      orbitControlSpeed: 1.28,
      nodeScale: 2.58,
      labelDensity: 0.9,
      edgeOpacity: 1.45,
      pulseDensity: 1.35,
      glowDensity: 1.3,
      glowIntensity: 1.55,
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
