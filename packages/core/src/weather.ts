// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { LngLat } from './geo';
import { isValidLngLat, roundTo } from './geo';
import type { RouteSample } from './route-timing';

/** Variáveis horárias pedidas ao Open-Meteo (nomes da API). */
export const OPEN_METEO_HOURLY = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'visibility',
  'is_day',
] as const;

/** Máximo de pontos por pedido (a função /api/weather aplica o mesmo limite). */
export const MAX_WEATHER_POINTS = 12;
/** A previsão só é pedida até este número de dias. */
export const WEATHER_FORECAST_DAYS = 7;

/** Previsão horária num ponto. Os tempos são instantes Unix em segundos (UTC). */
export interface HourlyForecast {
  readonly times: readonly number[];
  readonly temperature: readonly (number | null)[];
  readonly precipitation: readonly (number | null)[];
  readonly precipitationProbability: readonly (number | null)[];
  readonly weatherCode: readonly (number | null)[];
  readonly windSpeed: readonly (number | null)[];
  readonly windGusts: readonly (number | null)[];
  readonly visibility: readonly (number | null)[];
  readonly isDay: readonly (number | null)[];
}

/** Tempo previsto num ponto da rota, à hora estimada de passagem. */
export interface RouteWeatherPoint {
  readonly sample: RouteSample;
  /** Instante estimado de passagem (ms). */
  readonly at: number;
  /** °C */
  readonly temperature?: number;
  /** mm na hora */
  readonly precipitation?: number;
  /** % */
  readonly precipitationProbability?: number;
  /** Código WMO usado pelo Open-Meteo. */
  readonly weatherCode?: number;
  /** km/h */
  readonly windSpeed?: number;
  /** km/h */
  readonly windGusts?: number;
  /** metros */
  readonly visibility?: number;
  readonly isDay?: boolean;
}

export type WeatherCategory =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing'
  | 'snow'
  | 'showers'
  | 'thunderstorm'
  | 'unknown';

/** Grupos dos códigos WMO (tabela "WMO Weather interpretation codes" do Open-Meteo). */
export function weatherCategory(code: number | undefined): WeatherCategory {
  if (code === undefined) return 'unknown';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'freezing';
  if (code >= 61 && code <= 65) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  return 'unknown';
}

export type WeatherWarningKind =
  'thunderstorm' | 'snow' | 'ice' | 'heavy_rain' | 'fog' | 'wind' | 'heat';

export interface WeatherWarning {
  readonly kind: WeatherWarningKind;
  /** Primeiro ponto da rota onde a condição é prevista. */
  readonly point: RouteWeatherPoint;
}

/**
 * Limiares próprios do Trajecto para avisar o condutor (não são os limiares oficiais do IPMA).
 * Chuva forte: ≥ 4 mm/h ou código de chuva forte; nevoeiro: código de nevoeiro ou visibilidade
 * < 1 km; vento: rajadas ≥ 60 km/h; calor: ≥ 35 °C; gelo: ≤ 1 °C com precipitação.
 */
export const WEATHER_THRESHOLDS = {
  heavyRainMm: 4,
  fogVisibility: 1000,
  windGusts: 60,
  heat: 35,
  iceTemperature: 1,
} as const;

const HEAVY_RAIN_CODES = new Set([65, 67, 82]);

function warningKinds(p: RouteWeatherPoint): WeatherWarningKind[] {
  const kinds: WeatherWarningKind[] = [];
  const category = weatherCategory(p.weatherCode);
  const wet =
    (p.precipitation ?? 0) > 0 ||
    ['drizzle', 'rain', 'showers', 'freezing', 'snow'].includes(category);
  if (category === 'thunderstorm') kinds.push('thunderstorm');
  if (category === 'snow') kinds.push('snow');
  if (
    category === 'freezing' ||
    (wet && p.temperature !== undefined && p.temperature <= WEATHER_THRESHOLDS.iceTemperature)
  ) {
    kinds.push('ice');
  }
  if (
    (p.precipitation ?? 0) >= WEATHER_THRESHOLDS.heavyRainMm ||
    (p.weatherCode !== undefined && HEAVY_RAIN_CODES.has(p.weatherCode))
  ) {
    kinds.push('heavy_rain');
  }
  if (category === 'fog' || (p.visibility ?? Infinity) < WEATHER_THRESHOLDS.fogVisibility) {
    kinds.push('fog');
  }
  if ((p.windGusts ?? 0) >= WEATHER_THRESHOLDS.windGusts) kinds.push('wind');
  if ((p.temperature ?? -Infinity) >= WEATHER_THRESHOLDS.heat) kinds.push('heat');
  return kinds;
}

/** Avisos ao longo da rota: um por tipo, no primeiro ponto onde aparece. */
export function weatherWarnings(points: readonly RouteWeatherPoint[]): WeatherWarning[] {
  const seen = new Map<WeatherWarningKind, WeatherWarning>();
  for (const point of points) {
    for (const kind of warningKinds(point)) {
      if (!seen.has(kind)) seen.set(kind, { kind, point });
    }
  }
  return [...seen.values()];
}

function valueAt(values: readonly (number | null)[], index: number): number | undefined {
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Junta a previsão de cada ponto à hora estimada de passagem (`departure` + tempo até ao ponto).
 * Usa a hora da previsão mais próxima; pontos fora do período previsto ficam sem valores.
 */
export function weatherAlongRoute(
  samples: readonly RouteSample[],
  forecasts: readonly HourlyForecast[],
  departure: number,
): RouteWeatherPoint[] {
  return samples.map((sample, i) => {
    const at = departure + sample.seconds * 1000;
    const forecast = forecasts[i];
    const base = { sample, at };
    if (!forecast || forecast.times.length === 0) return base;
    const target = at / 1000;
    let best = -1;
    let bestDiff = Infinity;
    forecast.times.forEach((time, index) => {
      const diff = Math.abs(time - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = index;
      }
    });
    // Mais de 1 h fora do período previsto: sem dados.
    if (best < 0 || bestDiff > 3600) return base;
    const isDay = valueAt(forecast.isDay, best);
    return {
      ...base,
      ...optional('temperature', valueAt(forecast.temperature, best)),
      ...optional('precipitation', valueAt(forecast.precipitation, best)),
      ...optional('precipitationProbability', valueAt(forecast.precipitationProbability, best)),
      ...optional('weatherCode', valueAt(forecast.weatherCode, best)),
      ...optional('windSpeed', valueAt(forecast.windSpeed, best)),
      ...optional('windGusts', valueAt(forecast.windGusts, best)),
      ...optional('visibility', valueAt(forecast.visibility, best)),
      ...(isDay === undefined ? {} : { isDay: isDay === 1 }),
    };
  });
}

function optional<K extends string>(key: K, value: number | undefined) {
  return (value === undefined ? {} : { [key]: value }) as Partial<Record<K, number>>;
}

// --- Open-Meteo -------------------------------------------------------------------------------

const series = z
  .array(z.union([z.number(), z.null()]))
  .max(24 * 16)
  .optional()
  .catch(undefined);

const locationSchema = z.object({
  hourly: z.object({
    time: z.array(z.number().int()).max(24 * 16),
    temperature_2m: series,
    precipitation: series,
    precipitation_probability: series,
    weather_code: series,
    wind_speed_10m: series,
    wind_gusts_10m: series,
    visibility: series,
    is_day: series,
  }),
});

export class WeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherError';
  }
}

/** Converte a resposta do Open-Meteo (um objeto, ou uma lista com vários pontos). */
export function parseOpenMeteoResponse(body: unknown, expected: number): HourlyForecast[] {
  const list = Array.isArray(body) ? body : [body];
  if (list.length !== expected) {
    throw new WeatherError('Resposta da meteorologia com um número de pontos inesperado.');
  }
  return list.map((item) => {
    const parsed = locationSchema.safeParse(item);
    if (!parsed.success) throw new WeatherError('Resposta da meteorologia em formato inesperado.');
    const h = parsed.data.hourly;
    const pick = (values: (number | null)[] | undefined) =>
      h.time.map((_, i) => values?.[i] ?? null);
    return {
      times: h.time,
      temperature: pick(h.temperature_2m),
      precipitation: pick(h.precipitation),
      precipitationProbability: pick(h.precipitation_probability),
      weatherCode: pick(h.weather_code),
      windSpeed: pick(h.wind_speed_10m),
      windGusts: pick(h.wind_gusts_10m),
      visibility: pick(h.visibility),
      isDay: pick(h.is_day),
    };
  });
}

/** Coordenadas com 3 casas decimais (~100 m): chega para a meteorologia e expõe menos a posição. */
export function weatherQuery(points: readonly LngLat[]): URLSearchParams {
  if (points.length === 0 || points.length > MAX_WEATHER_POINTS) {
    throw new WeatherError('Número de pontos inválido.');
  }
  if (points.some((p) => !isValidLngLat(p))) throw new WeatherError('Coordenadas inválidas.');
  return new URLSearchParams({
    lat: points.map((p) => roundTo(p.lat, 3)).join(','),
    lon: points.map((p) => roundTo(p.lng, 3)).join(','),
  });
}

export interface WeatherProvider {
  forecast(
    points: readonly LngLat[],
    options?: { signal?: AbortSignal },
  ): Promise<HourlyForecast[]>;
}

export function createWeatherProvider(options: {
  readonly url: string;
  readonly fetch?: typeof fetch;
}): WeatherProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async forecast(points, requestOptions = {}) {
      const query = weatherQuery(points);
      let response: Response;
      try {
        response = await fetchImpl(`${options.url}?${query.toString()}`, {
          headers: { Accept: 'application/json' },
          ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new WeatherError('Sem ligação ao serviço de meteorologia.');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new WeatherError(`Serviço de meteorologia indisponível (HTTP ${response.status}).`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new WeatherError('Resposta da meteorologia inválida.');
      }
      return parseOpenMeteoResponse(body, points.length);
    },
  };
}
