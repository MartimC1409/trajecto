import type { Page, Request } from '@playwright/test';
import { REVERSE_RESPONSE, SEARCH_RESPONSE } from './fixtures/photon';

export interface MockState {
  readonly searchRequests: URL[];
  readonly reverseRequests: URL[];
  readonly consoleErrors: string[];
}

/**
 * Substitui os serviços externos por respostas locais:
 * - pesquisa (proxy /geocoder → Photon);
 * - tiles do OpenFreeMap (TileJSON com tiles vazios).
 * Assim os testes são rápidos, repetíveis e não sobrecarregam serviços públicos.
 */
export async function mockServices(
  page: Page,
  options: { searchStatus?: number } = {},
): Promise<MockState> {
  const state: MockState = { searchRequests: [], reverseRequests: [], consoleErrors: [] };

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
  return state;
}

export function isCspViolation(text: string): boolean {
  return /Content Security Policy|Refused to/iu.test(text);
}

export function queryOf(request: Request): URLSearchParams {
  return new URL(request.url()).searchParams;
}
