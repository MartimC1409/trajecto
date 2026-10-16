import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { isCspViolation, mockServices, recordCspViolations } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Este teste precisa do service worker (a app abre sem rede).
test.use({ serviceWorkers: 'allow' });

const CENTER = { lng: -9.1365, lat: 38.7107 };
/** Zona à volta do centro, maior do que o ecrã no zoom 16 (telemóvel e computador). */
const AREA: [number, number, number, number] = [-9.155, 38.699, -9.118, 38.722];
/** Tile do zoom 14 no centro da vista. */
const CENTER_TILE = '14/7776/6278';

function tileOf(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lng + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  ];
}

/** Guarda uma zona como a app (tiles vazios na Cache Storage e o registo da zona). */
async function saveAreaDirectly(page: Page) {
  const keys: string[] = [];
  for (let z = 0; z <= 14; z += 1) {
    const [minX, minY] = tileOf(AREA[0], AREA[3], z);
    const [maxX, maxY] = tileOf(AREA[2], AREA[1], z);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) keys.push(`${String(z)}/${String(x)}/${String(y)}`);
    }
  }
  await page.evaluate(
    async ({ tiles, bbox }) => {
      const cache = await caches.open('trajecto-offline-tiles-v1');
      for (const key of tiles) {
        await cache.put(`${location.origin}/__offline/tiles/${key}`, new Response(null));
      }
      localStorage.setItem(
        'trajecto:v1:offline-areas',
        JSON.stringify({
          version: 1,
          areas: [
            {
              id: 'baixa',
              name: 'Lisboa',
              bbox,
              minZoom: 0,
              maxZoom: 14,
              tiles: tiles.length,
              bytes: 0,
              version: 'latest',
              createdAt: Date.now(),
              complete: true,
            },
          ],
        }),
      );
    },
    { tiles: keys, bbox: AREA },
  );
}

/** Lê um tile guardado como a app o lê (para diagnóstico quando o mapa falha). */
async function readStoredTile(page: Page, key: string) {
  return page.evaluate(async (tileKey) => {
    try {
      const cache = await caches.open('trajecto-offline-tiles-v1');
      const response = await cache.match(`${location.origin}/__offline/tiles/${tileKey}`);
      if (!response) return { found: false, keys: (await cache.keys()).length };
      const body = await response.arrayBuffer();
      return {
        found: true,
        bytes: body.byteLength,
        encoding: response.headers.get('x-trajecto-encoding'),
      };
    } catch (error) {
      return { error: String(error) };
    }
  }, key);
}

test.describe('Trajecto (Fase 7: sem rede)', () => {
  test('a app é instalável (sem erros de instalação no Chromium)', async ({
    playwright,
    browserName,
    launchOptions,
    baseURL,
  }) => {
    test.skip(browserName !== 'chromium', 'Só o Chromium indica os erros de instalação (CDP).');
    // Os contextos habituais do Playwright são anónimos, e aí o Chrome só responde "in-incognito":
    // é preciso um perfil normal (numa pasta sem acentos: com eles o service worker não arranca).
    const profile = await mkdtemp(join(tmpdir(), 'trajecto-perfil-'));
    const context = await playwright.chromium.launchPersistentContext(profile, {
      ...launchOptions,
      ...(baseURL ? { baseURL } : {}),
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await mockServices(page);
      await page.goto('/');
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors).toEqual([]);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });

  test('guarda a zona visível, e sem rede a app abre e mostra o mapa guardado', async ({
    page,
    context,
    browserName,
  }) => {
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
    // Vista inicial pequena (Baixa de Lisboa, zoom 16): poucos tiles a guardar. Sem relevo: não é
    // guardado para usar sem rede (ADR 0016) e daria avisos esperados.
    await page.addInitScript((center) => {
      if (window.localStorage.getItem('trajecto:v1:preferences')) return;
      window.localStorage.setItem(
        'trajecto:v1:preferences',
        JSON.stringify({ version: 1, lastView: { center, zoom: 16 }, mapRelief: false }),
      );
    }, CENTER);
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    const failedRequests: string[] = [];
    const diagnostics: [string, unknown][] = [];
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    await page.goto('/');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    // O service worker fica ativo e com os ficheiros da app guardados.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const section = page.getByRole('region', { name: 'Mapas offline' });
    await expect(section).toContainText(/Zona no ecrã: cerca de/u);
    if (browserName === 'webkit') {
      // No WebKit, o Playwright não interceta os pedidos de uma página controlada por um service
      // worker: a transferência iria aos serviços reais. A transferência é testada no Chromium;
      // aqui a zona é posta diretamente no armazenamento, como a app a deixa.
      // Visto no CI: o que a primeira página (aberta antes de o service worker a controlar)
      // escreve na Cache Storage perde-se no WebKit ao recarregar. Guarda-se numa página já
      // controlada; o caso da primeira visita está na verificação no iPhone.
      await page.evaluate(async () => {
        const cache = await caches.open('trajecto-offline-tiles-v1');
        await cache.put(`${location.origin}/__offline/tiles/0/0/0`, new Response(null));
      });
      await page.reload();
      // Registo para o CI: o tile escrito pela primeira página sobreviveu ao recarregar?
      console.warn(
        `WebKit, escrito antes de recarregar: ${JSON.stringify(await readStoredTile(page, '0/0/0'))}`,
      );
      await saveAreaDirectly(page);
      diagnostics.push(['guardado', await readStoredTile(page, CENTER_TILE)]);
      await page.reload();
      diagnostics.push(['recarregado', await readStoredTile(page, CENTER_TILE)]);
      await page.getByRole('button', { name: 'Abrir menu' }).click();
    } else {
      await section.getByRole('button', { name: 'Guardar esta zona' }).click();
      await expect(section.getByRole('status')).toHaveText(
        '«Lisboa» está guardada: o mapa desta zona funciona sem rede.',
      );
      // Os pedidos passam pela função própria (User-Agent da app), com a versão dos tiles.
      expect(mocks.offlineTileRequests.length).toBeGreaterThan(10);
      expect(mocks.offlineTileRequests.length).toBeLessThanOrEqual(3000);
      expect(mocks.offlineTileRequests[0]?.searchParams.get('v')).toBe('latest');
    }
    await expect(section.getByRole('list', { name: 'Zonas guardadas' })).toContainText('Lisboa');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    // Sem rede: a página vem do service worker e o mapa usa a zona guardada. As respostas
    // simuladas saem todas, para qualquer pedido à rede falhar de verdade.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.setOffline(true);
    warnings.length = 0;
    failedRequests.length = 0;
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Pesquisar moradas e locais' })).toBeVisible();
    await expect(page.getByText(/Sem rede: o mapa mostra só as zonas guardadas/u)).toBeVisible();
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await page.waitForTimeout(1500);
    diagnostics.push(['sem rede', await readStoredTile(page, CENTER_TILE)]);
    // Nenhum recurso do mapa falhou: TileJSON, tiles e tipos de letra vieram do dispositivo.
    expect(
      warnings.filter((w) => w.includes('[mapa]')),
      `Pedidos falhados: ${JSON.stringify(failedRequests)}; tile guardado: ${JSON.stringify(diagnostics)}`,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(
      page.getByRole('region', { name: 'Mapas offline' }).getByRole('list'),
    ).toContainText('Lisboa');

    const violations = await cspViolations();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(mocks.consoleErrors.filter(isCspViolation)).toEqual([]);
    await context.setOffline(false);
  });
});
