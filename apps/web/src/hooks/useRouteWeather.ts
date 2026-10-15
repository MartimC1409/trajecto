import type { Route, RouteWeatherPoint, WeatherProvider, WeatherWarning } from '@trajecto/core';
import {
  MAX_WEATHER_POINTS,
  isAbortError,
  sampleAlongRoute,
  weatherAlongRoute,
  weatherWarnings,
  WEATHER_FORECAST_DAYS,
} from '@trajecto/core';
import { useEffect, useState } from 'react';

export type RouteWeatherState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'out_of_range' }
  | { readonly status: 'error' }
  | {
      readonly status: 'success';
      readonly points: readonly RouteWeatherPoint[];
      readonly warnings: readonly WeatherWarning[];
    };

/** Um ponto a cada 15 km (no máximo 10), para a previsão acompanhar a viagem. */
export const WEATHER_SAMPLE_INTERVAL = 15_000;
export const WEATHER_SAMPLES = Math.min(10, MAX_WEATHER_POINTS);

/**
 * Previsão do tempo ao longo de uma rota, à hora estimada de passagem em cada ponto.
 * `departure` é o instante de partida (ms) ou `null` quando ainda não se sabe.
 */
export function useRouteWeather(
  provider: WeatherProvider,
  route: Route | null,
  departure: number | null,
  now: number,
): RouteWeatherState {
  const [result, setResult] = useState<{
    key: unknown;
    state: RouteWeatherState;
  } | null>(null);

  const arrival = route && departure !== null ? departure + route.duration * 1000 : null;
  const outOfRange =
    arrival !== null && arrival > now + WEATHER_FORECAST_DAYS * 24 * 3600 * 1000 - 3600 * 1000;
  const key = route && departure !== null && !outOfRange ? `${departure}` : null;

  useEffect(() => {
    if (!route || departure === null || key === null) return;
    const controller = new AbortController();
    const samples = sampleAlongRoute(route, {
      intervalMeters: WEATHER_SAMPLE_INTERVAL,
      maxSamples: WEATHER_SAMPLES,
    });
    provider
      .forecast(
        samples.map((s) => s.lngLat),
        { signal: controller.signal },
      )
      .then((forecasts) => {
        const points = weatherAlongRoute(samples, forecasts, departure);
        setResult({
          key: [route, key],
          state: { status: 'success', points, warnings: weatherWarnings(points) },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setResult({ key: [route, key], state: { status: 'error' } });
      });
    return () => controller.abort();
  }, [provider, route, departure, key]);

  if (!route || departure === null) return { status: 'idle' };
  if (outOfRange) return { status: 'out_of_range' };
  // O resultado só vale para a rota e a hora em que foi pedido.
  const current =
    result && Array.isArray(result.key) && result.key[0] === route && result.key[1] === key
      ? result.state
      : null;
  return current ?? { status: 'loading' };
}
