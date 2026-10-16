import type {
  LngLat,
  RouteTime,
  TransitErrorCode,
  TransitItinerary,
  TransitPlanner,
} from '@trajecto/core';
import { isAbortError, TransitError } from '@trajecto/core';
import { useEffect, useRef, useState } from 'react';
import type { LocationErrorCode } from './location';
import { LocationError } from './location';
import type { Endpoint } from './useRoutePlanner';

export interface TransitInput {
  readonly origin: Endpoint;
  readonly destination: Endpoint;
  readonly time: RouteTime;
}

export type TransitState =
  | { readonly status: 'idle' }
  | { readonly status: 'locating' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly itineraries: readonly TransitItinerary[];
      readonly input: TransitInput;
    }
  | { readonly status: 'error'; readonly code: TransitErrorCode | LocationErrorCode };

/** Espera depois da última alteração antes de pedir ligações. */
export const TRANSIT_DEBOUNCE_MS = 500;
/**
 * O Transitous aceita 20 pedidos de rotas por minuto por IP (e o IP é o do servidor do Vercel,
 * partilhado): no máximo um pedido a cada 3 s por dispositivo.
 */
export const TRANSIT_MIN_INTERVAL_MS = 3000;

/** "AAAA-MM-DDThh:mm" na hora local → milissegundos. */
export function localDateTimeToMs(value: string): number {
  const [date = '', clock = ''] = value.split('T');
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = clock.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
}

/**
 * Pede ligações de transportes públicos sempre que o pedido muda (com espera e intervalo mínimo
 * entre pedidos). Pedidos anteriores são cancelados; só o resultado do mais recente é mostrado.
 */
export function useTransitPlanner(
  planner: TransitPlanner,
  input: TransitInput | null,
  locate: () => Promise<LngLat>,
): TransitState {
  const [state, setState] = useState<TransitState>({ status: 'idle' });
  const lastRequestAt = useRef(-Infinity);

  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    const wait = Math.max(
      TRANSIT_DEBOUNCE_MS,
      lastRequestAt.current + TRANSIT_MIN_INTERVAL_MS - Date.now(),
    );

    const timer = setTimeout(() => {
      void (async () => {
        try {
          let here: LngLat | undefined;
          if (input.origin.kind === 'current' || input.destination.kind === 'current') {
            setState({ status: 'locating' });
            here = await locate();
            if (controller.signal.aborted) return;
          }
          const point = (endpoint: Endpoint): LngLat =>
            endpoint.kind === 'place' ? endpoint.place.lngLat : (here as LngLat);
          setState({ status: 'loading' });
          lastRequestAt.current = Date.now();
          const itineraries = await planner.plan(
            {
              from: point(input.origin),
              to: point(input.destination),
              ...(input.time.kind === 'now'
                ? {}
                : {
                    time: localDateTimeToMs(input.time.value),
                    arriveBy: input.time.kind === 'arrive',
                  }),
            },
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setState({ status: 'success', itineraries, input });
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          const code =
            error instanceof TransitError || error instanceof LocationError
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
  }, [planner, input, locate]);

  return input ? state : { status: 'idle' };
}
