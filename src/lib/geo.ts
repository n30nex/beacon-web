export interface GeoCoord {
  lat: number;
  lng: number;
}

export function toValidGeoCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): GeoCoord | null {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}
