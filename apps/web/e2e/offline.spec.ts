import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isCspViolation, mockServices, recordCspViolations } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Este teste precisa do service worker (a app abre sem rede).
test.use({ serviceWorkers: 'allow' });

test.describe('Trajecto (Fase 7: sem rede)', () => {
  test('guarda a zona visível, e sem rede a app abre e mostra o mapa guardado', async ({
    page,
    context,
  }) => {
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
    // Vista inicial pequena (Baixa de Lisboa, zoom 16): poucos tiles a guardar. Sem relevo: não é
    // guardado para usar sem rede (ADR 0016) e daria avisos esperados.
    await page.addInitScript(() => {
      if (window.localStorage.getItem('trajecto:v1:preferences')) return;
      window.localStorage.setItem(
        'trajecto:v1:preferences',
        JSON.stringify({
          version: 1,
          lastView: { center: { lng: -9.1365, lat: 38.7107 }, zoom: 16 },
          mapRelief: false,
        }),
      );
    });
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });

    await page.goto('/');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    // O service worker fica ativo e com os ficheiros da app guardados.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const section = page.getByRole('region', { name: 'Mapas offline' });
    await expect(section).toContainText(/Zona no ecrã: cerca de/u);
    await section.getByRole('button', { name: 'Guardar esta zona' }).click();
    await expect(section.getByRole('status')).toHaveText(
      '«Lisboa» está guardada: o mapa desta zona funciona sem rede.',
    );
    await expect(section.getByRole('list', { name: 'Zonas guardadas' })).toContainText('Lisboa');
    // Os pedidos passam pela função própria (User-Agent da app), com a versão dos tiles.
    expect(mocks.offlineTileRequests.length).toBeGreaterThan(10);
    expect(mocks.offlineTileRequests.length).toBeLessThanOrEqual(3000);
    expect(mocks.offlineTileRequests[0]?.searchParams.get('v')).toBe('latest');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    // Sem rede: a página vem do service worker e o mapa usa a zona guardada. As respostas
    // simuladas saem todas, para qualquer pedido à rede falhar de verdade.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.setOffline(true);
    warnings.length = 0;
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Pesquisar moradas e locais' })).toBeVisible();
    await expect(page.getByText(/Sem rede: o mapa mostra só as zonas guardadas/u)).toBeVisible();
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await page.waitForTimeout(1500);
    // Nenhum recurso do mapa falhou: TileJSON, tiles e tipos de letra vieram do dispositivo.
    expect(warnings.filter((w) => w.includes('[mapa]'))).toEqual([]);
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
