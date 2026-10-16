import type { Page, Request } from '@playwright/test';
import { REVERSE_RESPONSE, SEARCH_RESPONSE } from './fixtures/photon';
import { TRANSIT_RESPONSE } from './fixtures/transitous';
import { ROUTE_RESPONSE } from './fixtures/valhalla';

export interface MockState {
  readonly searchRequests: URL[];
  readonly reverseRequests: URL[];
  /** Corpos JSON dos pedidos de rota (POST /api/route). */
  readonly routeRequests: Record<string, unknown>[];
  readonly weatherRequests: URL[];
  readonly transitRequests: URL[];
  readonly consoleErrors: string[];
}

/**
 * Substitui os serviços externos por respostas locais:
 * - pesquisa (proxy /geocoder → Photon);
 * - rotas (função /api/route → Valhalla);
 * - meteorologia (função /api/weather → Open-Meteo);
 * - transportes públicos (função /api/transit → Transitous);
 * - tiles do OpenFreeMap (TileJSON com tiles vazios) e do relevo (Mapterhorn).
 * Assim os testes são rápidos, repetíveis e não sobrecarregam serviços públicos.
 */
/** Detalhes de uma violação da política de segurança de conteúdo, registados pelo browser. */
export interface CspViolation {
  readonly directive: string;
  readonly blockedURI: string;
  readonly sourceFile: string;
  readonly lineNumber: number;
  readonly sample: string;
  readonly target: string;
}

declare global {
  interface Window {
    __cspViolations?: CspViolation[];
  }
}

/** Regista, dentro da página, cada violação de CSP com a sua origem (elemento, ficheiro e linha). */
export async function recordCspViolations(page: Page): Promise<() => Promise<CspViolation[]>> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      const target = event.target;
      let description = String(target);
      if (target instanceof Element) {
        description = `${target.tagName.toLowerCase()}${target.className ? `.${String(target.className)}` : ''}`;
      } else if (target instanceof Document) {
        description = 'document';
      }
      window.__cspViolations?.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
        sample: event.sample,
        target: description,
      });
    });
  });
  return () => page.evaluate(() => window.__cspViolations ?? []);
}

export async function mockServices(
  page: Page,
  options: { searchStatus?: number } = {},
): Promise<MockState> {
  const state: MockState = {
    searchRequests: [],
    reverseRequests: [],
    routeRequests: [],
    weatherRequests: [],
    transitRequests: [],
    consoleErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') state.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => state.consoleErrors.push(error.message));

  await page.route('**/geocoder/api?**', async (route) => {
    state.searchRequests.push(new URL(route.request().url()));
    if (options.searchStatus && options.searchStatus !== 200) {
      await route.fulfill({ status: options.searchStatus, body: 'erro' });
      return;
    }
    await route.fulfill({ json: SEARCH_RESPONSE });
  });
  await page.route('**/geocoder/reverse?**', async (route) => {
    state.reverseRequests.push(new URL(route.request().url()));
    await route.fulfill({ json: REVERSE_RESPONSE });
  });
  await page.route('**/api/route', async (route) => {
    state.routeRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: ROUTE_RESPONSE });
  });
  // Previsão no formato do Open-Meteo (um objeto por ponto), com chuva forte daqui a 1 hora.
  await page.route('**/api/weather?**', async (route) => {
    const url = new URL(route.request().url());
    state.weatherRequests.push(url);
    const count = (url.searchParams.get('lat') ?? '').split(',').length;
    const start = Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
    const time = Array.from({ length: 6 }, (_, i) => start + i * 3600);
    const location = {
      latitude: 38.72,
      longitude: -9.14,
      hourly: {
        time,
        temperature_2m: [16, 16, 15, 15, 14, 14],
        precipitation: [0, 0.2, 6.5, 3, 0, 0],
        precipitation_probability: [10, 40, 95, 80, 20, 10],
        weather_code: [2, 61, 65, 63, 3, 3],
        wind_speed_10m: [10, 15, 30, 20, 10, 10],
        wind_gusts_10m: [20, 30, 50, 40, 20, 20],
        visibility: [20000, 15000, 4000, 8000, 20000, 20000],
        is_day: [1, 1, 1, 1, 0, 0],
      },
    };
    await route.fulfill({
      json: count === 1 ? location : Array.from({ length: count }, () => location),
    });
  });
  await page.route('**/api/transit?**', async (route) => {
    state.transitRequests.push(new URL(route.request().url()));
    await route.fulfill({ json: TRANSIT_RESPONSE });
  });
  await page.route('https://tiles.openfreemap.org/planet', (route) =>
    route.fulfill({
      json: {
        tilejson: '3.0.0',
        tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'],
        minzoom: 0,
        maxzoom: 14,
        attribution: '<a href="https://openfreemap.org">OpenFreeMap</a>',
      },
    }),
  );
  await page.route('https://tiles.openfreemap.org/test/**', (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route('https://tiles.openfreemap.org/fonts/**', (route) =>
    route.fulfill({ status: 204 }),
  );
  // Relevo (Mapterhorn): sem pedidos reais nos testes.
  await page.route('https://tiles.mapterhorn.com/**', (route) => route.fulfill({ status: 204 }));
  return state;
}

export function isCspViolation(text: string): boolean {
  return /Content Security Policy|Refused to/iu.test(text);
}

export function queryOf(request: Request): URLSearchParams {
  return new URL(request.url()).searchParams;
}
