import type { Feature, FeatureCollection, Point } from "geojson";
import type { NodeSummary } from "../nodes/types";
import { nullableDisplayLabel } from "../../lib/display-label";
import { toValidGeoCoord } from "../../lib/geo";

// Build the maplibre GeoJSON source from the nodes API response. Properties stay primitive because
// clustering serializes them, and there's no maplibre import, so this stays unit-testable.

const ASTRAL_CODEPOINT_RE = /[\uD800-\uDFFF]/g;
const WHITESPACE_RE = /\s+/g;

export interface NodeFeatureProps {
  id: string;
  name: string | null;
  nodeTypeName: string;
  isObserver: boolean; // role flag; selects the observer-pip marker variant (default false)
}

function mapDisplayLabel(value: string | null | undefined): string | null {
  const label = nullableDisplayLabel(value);
  if (!label) return null;
  // OpenFreeMap's bundled glyph PBFs do not cover astral-plane symbols; strip them only from map
  // labels so a single unusual node name cannot spam 404 glyph-range warnings.
  const cleaned = label.replace(ASTRAL_CODEPOINT_RE, "").replace(WHITESPACE_RE, " ").trim();
  return cleaned || null;
}

export function nodesToFeatureCollection(
  nodes: NodeSummary[],
): FeatureCollection<Point, NodeFeatureProps> {
  const features: Feature<Point, NodeFeatureProps>[] = [];
  for (const n of nodes) {
    const coord = toValidGeoCoord(n.lat, n.lng);
    if (!coord) continue;
    features.push({
      type: "Feature",
      id: n.id,
      // GeoJSON/maplibre order is [lng, lat]; the API sends decimal degrees as-is
      geometry: { type: "Point", coordinates: [coord.lng, coord.lat] },
      properties: {
        id: n.id,
        name: mapDisplayLabel(n.name),
        nodeTypeName: n.nodeTypeName,
        isObserver: !!n.isObserver,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

// Filter to a single device type ("" = All). Filtering the data (not a layer filter) lets the
// clustered source re-count only the visible type.
export function filterByNodeType(
  fc: FeatureCollection<Point, NodeFeatureProps>,
  typeName: string,
): FeatureCollection<Point, NodeFeatureProps> {
  if (typeName === "") return fc;
  return { ...fc, features: fc.features.filter((f) => f.properties.nodeTypeName === typeName) };
}
