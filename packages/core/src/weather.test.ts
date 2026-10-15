import { describe, expect, it, vi } from 'vitest';
import type { RouteSample } from './route-timing';
import type { HourlyForecast, RouteWeatherPoint } from './weather';
import {
  MAX_WEATHER_POINTS,
  WeatherError,
  createWeatherProvider,
  parseOpenMeteoResponse,
  weatherAlongRoute,
  weatherCategory,
  weatherQuery,
  weatherWarnings,
} from './weather';

const HOUR = 3600;
const T0 = Date.UTC(2026, 9, 15, 12) / 1000;

function openMeteoLocation(overrides: Record<string, unknown[]> = {}) {
  return {
    latitude: 38.72,
    longitude: -9.14,
    hourly_units: { time: 'unixtime', temperature_2m: '°C' },
    hourly: {
      time: [T0, T0 + HOUR, T0 + 2 * HOUR],
      temperature_2m: [18.5, 17.9, 0.5],
      precipitation: [0, 5.2, 0.4],
      precipitation_probability: [10, 90, 60],
      weather_code: [1, 65, 71],
      wind_speed_10m: [12, 30, 20],
      wind_gusts_10m: [25, 70, 40],
      visibility: [24140, 800, 5000],
      is_day: [1, 1, 0],
      ...overrides,
    },
  };
}

const sample = (seconds: number): RouteSample => ({
  lngLat: { lng: -9.14, lat: 38.72 },
  distance: seconds * 10,
  seconds,
});

describe('weatherCategory', () => {
  it.each([
    [0, 'clear'],
    [2, 'partly_cloudy'],
    [3, 'cloudy'],
    [45, 'fog'],
    [53, 'drizzle'],
    [56, 'freezing'],
    [63, 'rain'],
    [75, 'snow'],
    [86, 'snow'],
    [81, 'showers'],
    [95, 'thunderstorm'],
    [99, 'thunderstorm'],
    [4, 'unknown'],
    [undefined, 'unknown'],
  ])('código %s → %s', (code, category) => {
    expect(weatherCategory(code)).toBe(category);
  });
});

describe('parseOpenMeteoResponse', () => {
  it('aceita um objeto (1 ponto) ou uma lista (vários pontos)', () => {
    const [one] = parseOpenMeteoResponse(openMeteoLocation(), 1);
    expect(one?.times).toHaveLength(3);
    expect(one?.weatherCode).toEqual([1, 65, 71]);
    const many = parseOpenMeteoResponse([openMeteoLocation(), openMeteoLocation()], 2);
    expect(many).toHaveLength(2);
  });

  it('preenche com null as variáveis em falta ou com tamanho diferente', () => {
    const [forecast] = parseOpenMeteoResponse(
      openMeteoLocation({ visibility: ['x'] as never, precipitation_probability: [10] }),
      1,
    );
    expect(forecast?.visibility).toEqual([null, null, null]);
    expect(forecast?.precipitationProbability).toEqual([10, null, null]);
  });

  it('recusa respostas inesperadas', () => {
    expect(() => parseOpenMeteoResponse([openMeteoLocation()], 2)).toThrow(WeatherError);
    expect(() => parseOpenMeteoResponse({ error: true, reason: 'x' }, 1)).toThrow(WeatherError);
    expect(() => parseOpenMeteoResponse(null, 1)).toThrow(WeatherError);
  });
});

describe('weatherAlongRoute', () => {
  const [forecast] = parseOpenMeteoResponse(openMeteoLocation(), 1) as [HourlyForecast];

  it('usa a hora prevista mais próxima da passagem', () => {
    const [start, middle] = weatherAlongRoute(
      [sample(0), sample(80 * 60)],
      [forecast, forecast],
      T0 * 1000,
    );
    expect(start).toMatchObject({ at: T0 * 1000, temperature: 18.5, weatherCode: 1, isDay: true });
    expect(middle).toMatchObject({ precipitation: 5.2, windGusts: 70, visibility: 800 });
  });

  it('não inventa valores fora do período previsto ou sem previsão', () => {
    const [late, missing] = weatherAlongRoute(
      [sample(10 * HOUR), sample(0)],
      [forecast],
      T0 * 1000,
    );
    expect(late).not.toHaveProperty('temperature');
    expect(missing).toEqual({ sample: sample(0), at: T0 * 1000 });
    const empty = { ...forecast, times: [] };
    expect(weatherAlongRoute([sample(0)], [empty], T0 * 1000)[0]).not.toHaveProperty('temperature');
  });
});

describe('weatherWarnings', () => {
  const point = (p: Partial<RouteWeatherPoint>): RouteWeatherPoint => ({
    sample: sample(0),
    at: 0,
    ...p,
  });

  it('deteta cada tipo de aviso uma vez, no primeiro ponto', () => {
    const warnings = weatherWarnings([
      point({ weatherCode: 1, temperature: 20 }),
      point({ weatherCode: 65, precipitation: 6, windGusts: 70, visibility: 800 }),
      point({ weatherCode: 63, precipitation: 8 }),
      point({ weatherCode: 71, temperature: 0.5, precipitation: 0.4 }),
      point({ weatherCode: 95 }),
      point({ temperature: 38 }),
      point({ weatherCode: 56 }),
    ]);
    expect(warnings.map((w) => w.kind)).toEqual([
      'heavy_rain',
      'fog',
      'wind',
      'snow',
      'ice',
      'thunderstorm',
      'heat',
    ]);
    expect(warnings[0]?.point.precipitation).toBe(6);
  });

  it('sem condições adversas não há avisos', () => {
    expect(weatherWarnings([point({ weatherCode: 3, temperature: 15, windGusts: 30 })])).toEqual(
      [],
    );
    expect(weatherWarnings([point({ temperature: -2 })])).toEqual([]);
  });
});

describe('createWeatherProvider', () => {
  const points = [
    { lng: -9.14123, lat: 38.72256 },
    { lng: -8.6291, lat: 41.1579 },
  ];

  it('pede /api/weather com coordenadas arredondadas', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify([openMeteoLocation(), openMeteoLocation()])));
    const provider = createWeatherProvider({ url: '/api/weather', fetch: fetchMock });
    const result = await provider.forecast(points);
    expect(result).toHaveLength(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/weather?lat=38.723%2C41.158&lon=-9.141%2C-8.629',
    );
  });

  it('valida os pontos antes de pedir', () => {
    expect(() => weatherQuery([])).toThrow(WeatherError);
    expect(() =>
      weatherQuery(Array.from({ length: MAX_WEATHER_POINTS + 1 }, () => points[0] as never)),
    ).toThrow(WeatherError);
    expect(() => weatherQuery([{ lng: 999, lat: 0 }])).toThrow(WeatherError);
  });

  it('converte falhas em WeatherError e deixa passar cancelamentos', async () => {
    const abort = new DOMException('x', 'AbortError');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('x', { status: 502 }))
      .mockResolvedValueOnce(new Response('{'))
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(abort) } as Response);
    const provider = createWeatherProvider({ url: '/w', fetch: fetchMock });
    await expect(provider.forecast(points)).rejects.toThrow(WeatherError);
    await expect(provider.forecast(points)).rejects.toThrow('HTTP 502');
    await expect(provider.forecast(points)).rejects.toThrow(WeatherError);
    await expect(provider.forecast(points, { signal: new AbortController().signal })).rejects.toBe(
      abort,
    );
    await expect(provider.forecast(points)).rejects.toBe(abort);
  });
});
