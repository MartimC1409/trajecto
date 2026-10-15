import type { LngLat } from './geo';
import { bearingDegrees, cumulativeDistances, pointAlong } from './geometry';
import type { NavigationFix } from './navigation';
import type { Route } from './routing';

/** Velocidade usada quando uma manobra não tem duração (m/s). */
const FALLBACK_SPEED = 10;

export interface RouteSimulator {
  /** Duração total da simulação, em milissegundos (já com o multiplicador aplicado). */
  readonly durationMs: number;
  /** Posição simulada `elapsedMs` depois da partida; `null` depois do fim. */
  positionAt(elapsedMs: number, timestamp: number): NavigationFix | null;
}

/**
 * Percorre a rota à velocidade estimada pelo serviço de rotas (útil para testar a navegação
 * sem sair de casa). `speedMultiplier` acelera a simulação (2 = duas vezes mais depressa).
 */
export function createRouteSimulator(route: Route, speedMultiplier = 1): RouteSimulator {
  const multiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const line = route.geometry;
  const cumulative = cumulativeDistances(line);
  const total = cumulative.at(-1) ?? 0;

  // Troços com velocidade constante: um por manobra.
  const parts = route.maneuvers.map((m) => {
    const start = cumulative[m.beginIndex] ?? 0;
    const end = cumulative[m.endIndex] ?? start;
    const length = Math.max(0, end - start);
    const speed = m.duration > 0 && length > 0 ? length / m.duration : FALLBACK_SPEED;
    return { start, length, speed, seconds: length / speed };
  });
  if (parts.length === 0)
    parts.push({ start: 0, length: total, speed: FALLBACK_SPEED, seconds: total / FALLBACK_SPEED });
  const totalSeconds = parts.reduce((sum, part) => sum + part.seconds, 0);

  return {
    durationMs: (totalSeconds * 1000) / multiplier,
    positionAt(elapsedMs, timestamp) {
      let seconds = (Math.max(0, elapsedMs) * multiplier) / 1000;
      if (seconds > totalSeconds) return null;
      let distance = total;
      let speed = 0;
      for (const part of parts) {
        if (seconds <= part.seconds) {
          distance = part.start + seconds * part.speed;
          speed = part.speed;
          break;
        }
        seconds -= part.seconds;
      }
      const { point, segment } = pointAlong(line, cumulative, distance);
      const a = line[segment] as LngLat;
      const b = line[segment + 1] ?? a;
      return {
        lngLat: point,
        accuracy: 5,
        heading: a === b ? null : bearingDegrees(a, b),
        speed: speed * multiplier,
        timestamp,
      };
    },
  };
}
