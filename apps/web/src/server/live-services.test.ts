// @vitest-environment node
/**
 * Testes contra os serviços reais (Valhalla da FOSSGIS e Open-Meteo), pelo mesmo caminho da app:
 * cliente do `core` → função do servidor (api/route.ts, api/weather.ts) → serviço externo.
 *
 * Não correm com `pnpm test`: só com TRAJECTO_LIVE=1 (workflow "Serviços reais" no GitHub
 * Actions). Fazem poucos pedidos, com pausas, para respeitar o uso justo dos serviços públicos.
 * As respostas ficam em `live-output/` para servirem de exemplo real nos testes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import type { LngLat, RouteRequest } from '@trajecto/core';
import {
  createValhallaRouter,
  createWeatherProvider,
  parseSpeedCameras,
  parseValhallaResponse,
} from '@trajecto/core';
import { describe, expect, it } from 'vitest';
import { handleRouteRequest } from '../../api/route';
import { handleWeatherRequest } from '../../api/weather';

const LIVE = process.env.TRAJECTO_LIVE === '1';
/** Endereço público de produção (por exemplo https://trajecto-psi.vercel.app), para testar o site real. */
const PRODUCTION = process.env.TRAJECTO_PRODUCTION_URL ?? '';
const OUTPUT = new URL('../../live-output/', import.meta.url);

const LISBOA: LngLat = { lng: -9.1393, lat: 38.7223 };
const PORTO: LngLat = { lng: -8.6291, lat: 41.1579 };
const BAIXA: LngLat = { lng: -9.1365, lat: 38.7107 };

/** O servidor público pede no máximo 1 pedido por segundo. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 1500));

async function save(name: string, body: unknown) {
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(new URL(name, OUTPUT), JSON.stringify(body, null, 2));
}

/** `fetch` que passa pela função do servidor, como no Vercel. Guarda a última resposta. */
function throughHandler(handler: (request: Request) => Promise<Response>) {
  const last: { status?: number; body?: unknown } = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'https://trajecto.example');
    const headers = new Headers(init?.headers);
    headers.set('Sec-Fetch-Site', 'same-origin');
    const response = await handler(new Request(url, { ...init, headers }));
    const text = await response.text();
    last.status = response.status;
    try {
      last.body = JSON.parse(text) as unknown;
    } catch {
      last.body = text;
    }
    return new Response(text, { status: response.status, headers: response.headers });
  };
  return { fetchImpl, last };
}

describe.skipIf(!LIVE)('serviços reais', () => {
  it('rotas: carro Lisboa → Porto com alternativas', async () => {
    const { fetchImpl, last } = throughHandler((r) => handleRouteRequest(r));
    const router = createValhallaRouter({ url: '/api/route', fetch: fetchImpl });
    const request: RouteRequest = {
      mode: 'car',
      waypoints: [LISBOA, PORTO],
      alternatives: 2,
      language: 'pt-PT',
    };
    let routes;
    try {
      routes = await router.route(request);
    } finally {
      await save('route-car.json', last);
    }
    console.warn(
      `carro: HTTP ${String(last.status)}, ${String(routes.length)} rota(s),`,
      routes.map(
        (r) => `${(r.distance / 1000).toFixed(1)} km / ${(r.duration / 60).toFixed(0)} min`,
      ),
    );
    expect(routes.length).toBeGreaterThanOrEqual(1);
    const [main] = routes;
    expect(main?.distance).toBeGreaterThan(250_000);
    expect(main?.maneuvers.length).toBeGreaterThan(3);
    expect(main?.maneuvers[0]?.instruction).toMatch(/\p{L}/u);
    // A mesma resposta, lida diretamente: o formato real continua a ser o esperado.
    expect(parseValhallaResponse(last.body, 'car').length).toBe(routes.length);
    await pause();
  }, 60_000);

  it('rotas: a pé, de bicicleta e de mota, com paragem e hora marcada', async () => {
    const { fetchImpl, last } = throughHandler((r) => handleRouteRequest(r));
    const router = createValhallaRouter({ url: '/api/route', fetch: fetchImpl });
    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const value = `${String(tomorrow.getFullYear())}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:00`;
    const cases: [string, RouteRequest][] = [
      ['walk', { mode: 'walk', waypoints: [LISBOA, BAIXA], language: 'pt-PT' }],
      ['bike', { mode: 'bike', waypoints: [LISBOA, BAIXA], language: 'en-US' }],
      [
        'motorcycle',
        {
          mode: 'motorcycle',
          waypoints: [LISBOA, BAIXA, { lng: -9.15, lat: 38.73 }],
          time: { kind: 'depart', value },
          preferences: { avoidTolls: true, avoidHighways: true },
          language: 'pt-PT',
          heading: 180,
        },
      ],
    ];
    for (const [name, request] of cases) {
      let routes;
      try {
        routes = await router.route(request);
      } finally {
        await save(`route-${name}.json`, last);
      }
      console.warn(`${name}: HTTP ${String(last.status)}, ${String(routes.length)} rota(s)`);
      expect(routes[0]?.maneuvers.length).toBeGreaterThan(1);
      await pause();
    }
  }, 90_000);

  it('meteorologia: pontos ao longo de uma rota', async () => {
    const { fetchImpl, last } = throughHandler((r) => handleWeatherRequest(r));
    const weather = createWeatherProvider({ url: '/api/weather', fetch: fetchImpl });
    const points = [LISBOA, { lng: -8.65, lat: 39.75 }, PORTO];
    let forecasts;
    try {
      forecasts = await weather.forecast(points);
    } finally {
      await save('weather.json', last);
    }
    console.warn(`meteorologia: HTTP ${String(last.status)}, ${String(forecasts.length)} ponto(s)`);
    expect(forecasts).toHaveLength(points.length);
    expect(forecasts[0]?.times.length).toBeGreaterThan(24);
  }, 60_000);
});

/**
 * O site publicado no Vercel: tem de abrir sem login e as funções têm de chegar aos serviços
 * a partir dos servidores do Vercel (o IP de saída é diferente do do GitHub).
 */
describe.skipIf(!LIVE || !PRODUCTION)('produção', () => {
  const at = (path: string) => new URL(path, PRODUCTION);

  it('a página abre sem login e tem a política de segurança', async () => {
    const response = await fetch(at('/'), { redirect: 'manual' });
    console.warn(`produção /: HTTP ${String(response.status)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await response.text()).toContain('<div id="root">');
  }, 30_000);

  it('o ficheiro de radares está publicado com a licença', async () => {
    const response = await fetch(at('/data/speed-cameras.json'));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ license: 'ODbL-1.0' });
    console.warn(`produção radares: ${String(parseSpeedCameras(body).length)}`);
    expect(parseSpeedCameras(body).length).toBeGreaterThan(100);
  }, 30_000);

  it('rotas através da função do Vercel', async () => {
    const router = createValhallaRouter({ url: at('/api/route').href });
    const routes = await router.route({
      mode: 'car',
      waypoints: [LISBOA, BAIXA],
      alternatives: 1,
      language: 'pt-PT',
    });
    console.warn(`produção rotas: ${String(routes.length)} rota(s)`);
    expect(routes[0]?.maneuvers.length).toBeGreaterThan(1);
    await pause();
  }, 60_000);

  it('meteorologia através da função do Vercel', async () => {
    const weather = createWeatherProvider({ url: at('/api/weather').href });
    const forecasts = await weather.forecast([LISBOA, PORTO]);
    expect(forecasts).toHaveLength(2);
  }, 60_000);
});
