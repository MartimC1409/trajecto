import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isCspViolation, mockServices, recordCspViolations } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const START = { latitude: 38.715, longitude: -9.145 };

test.use({ geolocation: START, permissions: ['geolocation'] });

test.describe('Trajecto (Fase 6: transportes públicos)', () => {
  test('mostra ligações com linhas, atrasos e o itinerário no mapa', async ({ page }) => {
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
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
    await panel.getByRole('radio', { name: 'Transportes públicos' }).check({ force: true });

    const options = panel.locator('.route-option');
    await expect(options).toHaveCount(2);
    // Horas em Lisboa (o fuso dos testes): 08:00 UTC são 09:00 em outubro (hora de verão).
    await expect(options.first()).toContainText('12 min');
    await expect(options.first()).toContainText('09:00 – 09:12');
    await expect(options.first()).toContainText('Sem transbordos');
    await expect(options.first()).toContainText('Az');
    await expect(options.nth(1)).toContainText('711');

    const steps = panel.getByRole('list', { name: 'Passos da ligação' });
    await expect(steps).toContainText('Sentido Santa Apolónia');
    await expect(steps).toContainText('09:06 Entrar em Restauradores');
    await expect(steps).toContainText('Sair em Baixa-Chiado');
    await expect(steps).toContainText('Atraso de 1 minuto (previsto às 09:05)');
    await expect(steps).toContainText('A pé até Rua Augusta');
    await expect(steps).not.toContainText('END');
    await expect(panel.getByRole('link', { name: /Transitous/ })).toHaveAttribute(
      'href',
      'https://transitous.org/sources/',
    );

    // O pedido leva só a partida, o destino (5 casas decimais) e nada mais.
    expect(mocks.transitRequests).toHaveLength(1);
    expect(Object.fromEntries(mocks.transitRequests[0]?.searchParams ?? [])).toEqual({
      fromPlace: '38.715,-9.145',
      toPlace: '38.7105,-9.1376',
    });
    // Sem pedidos de rota de carro enquanto os transportes estão escolhidos.
    expect(mocks.routeRequests.length).toBeLessThanOrEqual(1);

    // Autocarro: o texto amarelo-branco do operador passa a preto para se ler.
    await options.nth(1).click();
    await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(options.nth(1).locator('.line-badge')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(steps).toContainText('Hora do horário (sem tempo real)');

    const light = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(light.violations, JSON.stringify(light.violations, null, 2)).toEqual([]);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(dark.violations, JSON.stringify(dark.violations, null, 2)).toEqual([]);

    const violations = await cspViolations();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(mocks.consoleErrors.filter(isCspViolation)).toEqual([]);
  });
});
