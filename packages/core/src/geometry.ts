import type { LngLat } from './geo';

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo inicial de `a` para `b`, em graus (0 = norte, 90 = este). */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lng - a.lng) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };
}

/** Distâncias acumuladas (m) desde o início da linha até cada vértice. */
export function cumulativeDistances(line: readonly LngLat[]): number[] {
  const result: number[] = [];
  let total = 0;
  line.forEach((point, i) => {
    const prev = line[i - 1];
    if (prev) total += distanceMeters(prev, point);
    result.push(total);
  });
  return result;
}

export interface SegmentProjection {
  /** Ponto da linha mais próximo. */
  readonly point: LngLat;
  /** Fração ao longo do segmento (0 = início, 1 = fim). */
  readonly t: number;
  /** Distância em metros do ponto original à linha. */
  readonly distance: number;
}

/**
 * Projeta `p` no segmento `a`–`b`. Usa uma projeção plana local (precisa para segmentos
 * de rua, que têm no máximo alguns quilómetros).
 */
export function projectOnSegment(p: LngLat, a: LngLat, b: LngLat): SegmentProjection {
  const cosLat = Math.cos(a.lat * RAD);
  const toXY = (q: LngLat) => ({
    x: (q.lng - a.lng) * RAD * EARTH_RADIUS_M * cosLat,
    y: (q.lat - a.lat) * RAD * EARTH_RADIUS_M,
  });
  const pb = toXY(b);
  const pp = toXY(p);
  const lengthSq = pb.x * pb.x + pb.y * pb.y;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (pp.x * pb.x + pp.y * pb.y) / lengthSq));
  const dx = pp.x - pb.x * t;
  const dy = pp.y - pb.y * t;
  return { point: interpolate(a, b, t), t, distance: Math.hypot(dx, dy) };
}

/** Ponto a uma dada distância (m) ao longo da linha. */
export function pointAlong(
  line: readonly LngLat[],
  cumulative: readonly number[],
  distance: number,
): { point: LngLat; segment: number } {
  const last = line.length - 1;
  if (last <= 0) return { point: line[0] ?? { lng: 0, lat: 0 }, segment: 0 };
  if (distance <= 0) return { point: line[0] as LngLat, segment: 0 };
  const total = cumulative[last] ?? 0;
  if (distance >= total) return { point: line[last] as LngLat, segment: last - 1 };
  // Pesquisa binária pelo segmento que contém a distância pedida.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cumulative[mid] ?? 0) <= distance) lo = mid;
    else hi = mid;
  }
  const start = cumulative[lo] ?? 0;
  const length = (cumulative[hi] ?? start) - start;
  const t = length === 0 ? 0 : (distance - start) / length;
  return { point: interpolate(line[lo] as LngLat, line[hi] as LngLat, t), segment: lo };
}
