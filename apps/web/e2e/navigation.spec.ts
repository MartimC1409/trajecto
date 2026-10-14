import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { isCspViolation, mockServices, recordCspViolations } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Início do percurso de teste (Avenida da Liberdade, Lisboa).
const START = { latitude: 38.715, longitude: -9.145 };

test.use({ geolocation: START, permissions: ['geolocation'] });

async function openDirections(page: Page) {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Pesquisar moradas e locais' });
  await search.fill('Rua Augusta');
  await expect(page.getByRole('option', { name: /Rua Augusta/ })).toBeVisible();
  await search.press('Enter');
  await page
    .getByRole('region', { name: 'Rua Augusta' })
    .getByRole('button', { name: 'Direções' })
    .click();
  const panel = page.getByRole('region', { name: 'Direções' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Trajecto (Fases 2 e 3: rotas e navegação)', () => {
  test('calcula rotas a partir da localização atual, com alternativas e custo', async ({
    page,
  }) => {
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
    const panel = await openDirections(page);
    const routes = panel.locator('.route-option');
    await expect(routes).toHaveCount(2);
    await expect(routes.first()).toContainText('2 min');
    await expect(routes.first()).toContainText('1,2 km');
    await expect(routes.first()).toContainText('Com portagens');
    await expect(routes.first()).toContainText('combustível');

    expect(mocks.routeRequests).toHaveLength(1);
    expect(mocks.routeRequests[0]).toMatchObject({
      costing: 'auto',
      alternates: 2,
      language: 'pt-PT',
      units: 'kilometers',
      locations: [{ lat: START.latitude, lon: START.longitude, type: 'break' }, { type: 'break' }],
    });

    await routes.nth(1).click();
    await expect(routes.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await panel.getByRole('radio', { name: 'A pé' }).check({ force: true });
    await expect.poll(() => mocks.routeRequests.length).toBe(2);
    expect(mocks.routeRequests[1]).toMatchObject({ costing: 'pedestrian' });

    await panel.getByRole('button', { name: 'Opções de rota' }).click();
    await panel.getByRole('checkbox', { name: 'Evitar ferries' }).check();
    await expect.poll(() => mocks.routeRequests.length).toBe(3);
    expect(mocks.routeRequests[2]).toMatchObject({
      costing_options: { pedestrian: { use_ferry: 0 } },
    });

    await panel.getByRole('button', { name: 'Ver passos' }).click();
    await expect(panel.getByRole('list', { name: 'Passos da rota' })).toContainText(
      'Vire à esquerda na Rua Castilho.',
    );

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    const violations = await cspViolations();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(mocks.consoleErrors.filter(isCspViolation)).toEqual([]);
  });

  test('hora de partida marcada (sem alternativas)', async ({ page, browserName }) => {
    // O campo de data e hora do WebKit ainda não foi validado contra a CSP no CI.
    test.skip(browserName === 'webkit', 'Validado só em Chromium');
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
    const panel = await openDirections(page);
    await expect(panel.locator('.route-option')).toHaveCount(2);
    await panel.getByRole('button', { name: 'Opções de rota' }).click();
    await panel.getByRole('radio', { name: 'Partir às' }).check();
    await panel.getByLabel('Data e hora').fill('2026-10-20T08:30');
    await expect
      .poll(() => JSON.stringify(mocks.routeRequests.at(-1)))
      .toContain('2026-10-20T08:30');
    const last = mocks.routeRequests.at(-1);
    expect(last).toMatchObject({ date_time: { type: 1, value: '2026-10-20T08:30' } });
    expect(last).not.toHaveProperty('alternates');
    await expect(panel.locator('.route-option').first()).toContainText('Chegada às 08:32');
    expect(await cspViolations()).toEqual([]);
  });

  test('simula a viagem com instruções e volta às direções', async ({ page }) => {
    await mockServices(page);
    const panel = await openDirections(page);
    await panel.getByRole('button', { name: 'Simular' }).click();
    const nav = page.getByRole('region', { name: 'Navegação' });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText('Vire à direita na Rua Alexandre Herculano.');
    await expect(nav).toContainText('Simulação');
    await expect(page.locator('.nav-puck')).toBeVisible();
    await expect(page.getByRole('search')).toHaveCount(0);
    await nav.getByRole('button', { name: 'Velocidade da simulação: 4×' }).click();
    // A distância à próxima manobra vai diminuindo.
    const distance = nav.locator('.nav-distance');
    const first = await distance.textContent();
    await expect.poll(() => distance.textContent(), { timeout: 10_000 }).not.toBe(first);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    await nav.getByRole('button', { name: 'Terminar' }).click();
    await expect(nav).toHaveCount(0);
    await expect(panel).toBeVisible();
  });

  test('navega com o GPS e chega ao destino', async ({ page, context }) => {
    await mockServices(page);
    const panel = await openDirections(page);
    await panel.getByRole('button', { name: 'Iniciar' }).click();
    const nav = page.getByRole('region', { name: 'Navegação' });
    await expect(nav).toContainText('Vire à direita na Rua Alexandre Herculano.');
    await expect(nav.locator('.nav-distance')).toHaveText('550 m');

    // Avança ao longo da rota até depois da primeira viragem.
    await context.setGeolocation({ latitude: 38.72, longitude: -9.1435 });
    await expect(nav).toContainText('Vire à esquerda na Rua Castilho.');
    await context.setGeolocation({ latitude: 38.722, longitude: -9.14 });
    await expect(nav).toContainText('Chegaste ao destino.');
    await nav.getByRole('button', { name: 'Terminar' }).click();
    await expect(panel).toBeVisible();
  });
});
