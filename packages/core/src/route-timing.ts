import type { LngLat } from './geo';
import { cumulativeDistances, pointAlong } from './geometry';
import type { Route } from './routing';

/** Ponto da rota com a distância desde a partida e o tempo estimado até lá chegar. */
export interface RouteSample {
  readonly lngLat: LngLat;
  /** Metros desde a partida. */
  readonly distance: number;
  /** Segundos desde a partida, pelas estimativas do serviço de rotas. */
  readonly seconds: number;
}

/**
 * Função que dá o tempo estimado (s) para chegar a uma distância (m) ao longo da rota.
 * Usa a duração de cada manobra, distribuída de forma proporcional à distância dentro dela.
 */
export function routeTimeAt(route: Route): (distance: number) => number {
  const cumulative = cumulativeDistances(route.geometry);
  const total = cumulative.at(-1) ?? 0;
  // Pontos (distância, tempo) no início de cada manobra e no fim da rota.
  const knots: { d: number; t: number }[] = [{ d: 0, t: 0 }];
  let elapsed = 0;
  for (const maneuver of route.maneuvers) {
    elapsed += Math.max(0, maneuver.duration);
    const end = cumulative[maneuver.endIndex] ?? total;
    const last = knots.at(-1) as { d: number; t: number };
    if (end > last.d) knots.push({ d: end, t: elapsed });
    else last.t = elapsed;
  }
  const lastKnot = knots.at(-1) as { d: number; t: number };
  if (lastKnot.d < total) knots.push({ d: total, t: Math.max(lastKnot.t, route.duration) });

  return (distance) => {
    if (!(distance > 0)) return 0;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1] as { d: number; t: number };
      const b = knots[i] as { d: number; t: number };
      if (distance <= b.d) {
        const span = b.d - a.d;
        return span > 0 ? a.t + ((distance - a.d) / span) * (b.t - a.t) : b.t;
      }
    }
    return (knots.at(-1) as { t: number }).t;
  };
}

export interface SampleOptions {
  /** Distância mínima entre pontos (m). */
  readonly intervalMeters: number;
  /** Número máximo de pontos (inclui a partida e o destino). */
  readonly maxSamples: number;
}

/**
 * Pontos espaçados ao longo da rota, sempre com a partida e o destino.
 * Se a rota for longa, o intervalo aumenta para não passar de `maxSamples`.
 */
export function sampleAlongRoute(route: Route, options: SampleOptions): RouteSample[] {
  const line = route.geometry;
  if (line.length === 0) return [];
  const cumulative = cumulativeDistances(line);
  const total = cumulative.at(-1) ?? 0;
  const timeAt = routeTimeAt(route);
  const maxSamples = Math.max(2, Math.floor(options.maxSamples));
  const interval = Math.max(options.intervalMeters, total / (maxSamples - 1), 1);
  const count = total === 0 ? 1 : Math.min(maxSamples, Math.floor(total / interval) + 2);
  const samples: RouteSample[] = [];
  for (let i = 0; i < count; i++) {
    // O último ponto é sempre o destino; os outros ficam a intervalos iguais.
    const distance = i === count - 1 ? total : Math.min(total, i * interval);
    if (i > 0 && i < count - 1 && total - distance < interval / 2) continue;
    samples.push({
      lngLat: pointAlong(line, cumulative, distance).point,
      distance,
      seconds: timeAt(distance),
    });
  }
  return samples;
}
