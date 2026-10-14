/** Coordenada geográfica em graus decimais (WGS84). */
export interface LngLat {
  readonly lng: number;
  readonly lat: number;
}

/** Retângulo envolvente: [oeste, sul, este, norte]. */
export type BBox = readonly [west: number, south: number, east: number, north: number];

/** Centro inicial do mapa: Lisboa. */
export const DEFAULT_CENTER: LngLat = { lng: -9.1393, lat: 38.7223 };
export const DEFAULT_ZOOM = 12;

export function isValidLngLat(value: LngLat): boolean {
  return (
    Number.isFinite(value.lng) &&
    Number.isFinite(value.lat) &&
    value.lng >= -180 &&
    value.lng <= 180 &&
    value.lat >= -90 &&
    value.lat <= 90
  );
}

/** Arredonda para `decimals` casas decimais (5 casas ≈ 1 m). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Formato legível e estável para mostrar ao utilizador: "38.72230, -9.13930". */
export function formatLngLat(value: LngLat, decimals = 5): string {
  return `${value.lat.toFixed(decimals)}, ${value.lng.toFixed(decimals)}`;
}
