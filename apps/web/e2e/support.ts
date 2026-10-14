import type { Page, Request } from '@playwright/test';
import { REVERSE_RESPONSE, SEARCH_RESPONSE } from './fixtures/photon';
import { ROUTE_RESPONSE } from './fixtures/valhalla';

export interface MockState {
  readonly searchRequests: URL[];
  readonly reverseRequests: URL[];
  /** Corpos JSON dos pedidos de rota (POST /api/route). */
  readonly routeRequests: Record<string, unknown>[];
  readonly consoleErrors: string[];
}

/**
 * Substitui os serviços externos por respostas locais:
 * - pesquisa (proxy /geocoder → Photon);
 * - rotas (função /api/route → Valhalla);
 * - tiles do OpenFreeMap (TileJSON com tiles vazios).
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
