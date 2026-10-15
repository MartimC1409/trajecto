import type { LngLat } from './geo';
import { bearingDegrees, cumulativeDistances, projectOnSegment } from './geometry';
import type { Route } from './routing';

/** Algo a avisar durante a viagem: um reporte, um radar fixo, etc. */
export interface AlertSource {
  readonly id: string;
  /** Tipo (por exemplo "police" ou "speed_camera"); a interface traduz. */
  readonly kind: string;
  readonly lngLat: LngLat;
  /** Direção em que o aviso se aplica (graus); sem direção, vale para os dois sentidos. */
  readonly bearing?: number;
  /** Valor extra a mostrar (por exemplo, o limite de velocidade de um radar). */
  readonly detail?: number;
}

export interface RouteAlert extends AlertSource {
  /** Metros desde o início da rota até ao aviso. */
  readonly progress: number;
}

export interface AlongRouteOptions {
  /** Distância máxima à rota para o aviso contar (m). */
  readonly maxDistance?: number;
  /** Diferença máxima entre a direção do aviso e a da rota (graus). */
  readonly maxAngle?: number;
}

function angleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Avisos que ficam em cima da rota (até `maxDistance` metros), por ordem de passagem.
 * Avisos com direção só contam se a rota passar nesse sentido. Onde a rota passa duas vezes
 * no mesmo sítio, conta a primeira passagem no sentido certo.
 */
export function alertsAlongRoute(
  route: Route,
  sources: readonly AlertSource[],
  options: AlongRouteOptions = {},
): RouteAlert[] {
  const maxDistance = options.maxDistance ?? 30;
  const maxAngle = options.maxAngle ?? 60;
  const line = route.geometry;
  if (line.length < 2) return [];
  const cumulative = cumulativeDistances(line);
  const bearings = line.slice(0, -1).map((a, i) => bearingDegrees(a, line[i + 1] ?? a));

  // Retângulo da rota com margem, para descartar depressa o que está longe.
  // (Sem `Math.min(...lista)`: rotas longas têm demasiados pontos para uma chamada.)
  const margin = maxDistance / 111_000 + 0.001;
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const point of line) {
    west = Math.min(west, point.lng);
    south = Math.min(south, point.lat);
    east = Math.max(east, point.lng);
    north = Math.max(north, point.lat);
  }
  west -= margin * 2;
  east += margin * 2;
  south -= margin;
  north += margin;

  const alerts: RouteAlert[] = [];
  for (const source of sources) {
    const p = source.lngLat;
    if (p.lng < west || p.lng > east || p.lat < south || p.lat > north) continue;
    // A primeira passagem da rota perto do aviso: o troço mais perto dentro dessa passagem
    // (troços seguidos dentro da distância), para não ficar preso no fim do troço anterior.
    let best: { distance: number; progress: number } | undefined;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i] as LngLat;
      const b = line[i + 1] as LngLat;
      const proj = projectOnSegment(p, a, b);
      const sameWay =
        source.bearing === undefined ||
        angleDifference(source.bearing, bearings[i] ?? 0) <= maxAngle;
      if (proj.distance > maxDistance || !sameWay) {
        if (best) break;
        continue;
      }
      if (!best || proj.distance < best.distance) {
        const start = cumulative[i] ?? 0;
        const length = (cumulative[i + 1] ?? start) - start;
        best = { distance: proj.distance, progress: start + length * proj.t };
      }
    }
    if (best) alerts.push({ ...source, progress: best.progress });
  }
  return alerts.sort((x, y) => x.progress - y.progress);
}

/** Primeiro aviso à frente da posição (`traveled`), até `lookahead` metros. */
export function nextAlert(
  alerts: readonly RouteAlert[],
  traveled: number,
  lookahead: number,
): RouteAlert | undefined {
  return alerts.find((a) => a.progress > traveled && a.progress - traveled <= lookahead);
}
