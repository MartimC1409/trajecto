import type {
  LngLat,
  Place,
  Route,
  RouteLanguage,
  RoutePreferences,
  Router,
  RouterErrorCode,
  RouteTime,
  TravelMode,
} from '@trajecto/core';
import { isAbortError, RouterError } from '@trajecto/core';
import { useEffect, useRef, useState } from 'react';
import type { LocationErrorCode } from './location';
import { LocationError } from './location';

/** Ponto de partida ou de chegada: a posição atual ou um local escolhido. */
export type Endpoint =
  { readonly kind: 'current' } | { readonly kind: 'place'; readonly place: Place };

export interface PlannerInput {
  readonly origin: Endpoint;
  readonly stops: readonly Place[];
  readonly destination: Endpoint;
  readonly mode: TravelMode;
  readonly preferences: RoutePreferences;
  readonly time: RouteTime;
  readonly language: RouteLanguage;
}

export type PlannerState =
  | { readonly status: 'idle' }
  | { readonly status: 'locating' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly routes: readonly Route[];
      /** Partida, paragens e destino usados no pedido. */
      readonly waypoints: readonly LngLat[];
      readonly input: PlannerInput;
      /** Instante em que a rota foi calculada (para estimar a hora de chegada). */
      readonly computedAt: number;
    }
  | { readonly status: 'error'; readonly code: RouterErrorCode | LocationErrorCode };

/** Espera depois da última alteração antes de pedir a rota. */
export const PLANNER_DEBOUNCE_MS = 400;
/** O servidor público aceita no máximo um pedido por segundo. */
export const PLANNER_MIN_INTERVAL_MS = 1100;

export function needsLocation(input: PlannerInput): boolean {
  return input.origin.kind === 'current' || input.destination.kind === 'current';
}

/**
 * Calcula rotas sempre que o pedido muda (com espera e intervalo mínimo entre pedidos).
 * Pedidos anteriores são cancelados; só o resultado do pedido mais recente é mostrado.
 */
export function useRoutePlanner(
  router: Router,
  input: PlannerInput | null,
  locate: () => Promise<LngLat>,
): PlannerState {
  const [state, setState] = useState<PlannerState>({ status: 'idle' });
  const lastRequestAt = useRef(-Infinity);

  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    const wait = Math.max(
      PLANNER_DEBOUNCE_MS,
      lastRequestAt.current + PLANNER_MIN_INTERVAL_MS - Date.now(),
    );

    const timer = setTimeout(() => {
      void (async () => {
        try {
          let here: LngLat | undefined;
          if (needsLocation(input)) {
            setState({ status: 'locating' });
            here = await locate();
            if (controller.signal.aborted) return;
          }
          const point = (endpoint: Endpoint): LngLat =>
            endpoint.kind === 'place' ? endpoint.place.lngLat : (here as LngLat);
          const waypoints = [
            point(input.origin),
            ...input.stops.map((stop) => stop.lngLat),
            point(input.destination),
          ];
          setState({ status: 'loading' });
          lastRequestAt.current = Date.now();
          const routes = await router.route(
            {
              mode: input.mode,
              waypoints,
              preferences: input.preferences,
              time: input.time,
              alternatives: 2,
              language: input.language,
            },
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setState({ status: 'success', routes, waypoints, input, computedAt: Date.now() });
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          const code =
            error instanceof RouterError || error instanceof LocationError
              ? error.code
              : 'unavailable';
          setState({ status: 'error', code });
        }
      })();
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [router, input, locate]);

  return input ? state : { status: 'idle' };
}
