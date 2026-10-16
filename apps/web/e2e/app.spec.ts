import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isCspViolation, mockServices, recordCspViolations } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Trajecto (Fase 1)', () => {
  test('carrega o mapa em pt-PT, com atribuições e sem violações de CSP', async ({ page }) => {
    const mocks = await mockServices(page);
    const cspViolations = await recordCspViolations(page);
    await page.goto('/');
    await expect(page).toHaveTitle('Trajecto');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const attribution = page.locator('.maplibregl-ctrl-attrib-inner');
    await expect(attribution).toContainText('© OpenStreetMap');
    await expect(attribution).toContainText('© OpenMapTiles');
    await expect(page.getByRole('button', { name: 'Aproximar' })).toBeVisible();
    const violations = await cspViolations();
    // A mensagem de erro inclui a origem (elemento, ficheiro, linha) para facilitar o diagnóstico.
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(mocks.consoleErrors.filter(isCspViolation)).toEqual([]);
  });

  test('o botão "Que sítio é este?" não tapa as atribuições do mapa', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    const attribution = page.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    const button = await page.getByRole('button', { name: /Que sítio é este/ }).boundingBox();
    const box = await attribution.boundingBox();
    expect(button && box).toBeTruthy();
    if (!button || !box) return;
    const overlaps =
      button.x < box.x + box.width &&
      box.x < button.x + button.width &&
      button.y < box.y + box.height &&
      box.y < button.y + button.height;
    expect(overlaps).toBe(false);
  });

  test('pesquisa, guarda como Casa e o favorito sobrevive a recarregar', async ({ page }) => {
    const mocks = await mockServices(page);
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Pesquisar moradas e locais' });
    await search.fill('Rua Augusta');
    await expect(page.getByRole('option', { name: /Rua Augusta/ })).toBeVisible();
    // A contagem é anunciada a leitores de ecrã (região "status"), mesmo sem ficar visível.
    await expect(page.getByRole('status').filter({ hasText: '2 resultados' })).toHaveCount(1);

    // Um só pedido (debounce), com foco no mapa e limitado a Portugal.
    expect(mocks.searchRequests).toHaveLength(1);
    const params = mocks.searchRequests[0]?.searchParams;
    expect(params?.get('q')).toBe('Rua Augusta');
    expect(params?.get('countrycode')).toBe('PT');
    expect(params?.get('lat')).not.toBeNull();

    await search.press('Enter');
    const sheet = page.getByRole('region', { name: 'Rua Augusta' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('1100-053 Lisboa');
    await sheet.getByRole('button', { name: 'Casa' }).click();
    await expect(sheet.getByRole('button', { name: 'Casa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.favorite-home')).toHaveCount(1);

    await page.reload();
    await page.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: /Casa.*Rua Augusta/ })).toBeVisible();

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const menu = page.getByRole('complementary', { name: 'Menu' });
    await expect(menu.getByRole('button', { name: /Mostrar Casa: Rua Augusta/ })).toBeVisible();
    await expect(menu.getByRole('button', { name: /Mostrar Rua Augusta no mapa/ })).toBeVisible();
    await menu.getByRole('button', { name: 'Remover Rua Augusta' }).click();
    await expect(menu.getByText('Ainda não tens favoritos.')).toBeVisible();
    await menu.getByRole('button', { name: 'Apagar todo o histórico' }).click();
    await menu.getByRole('button', { name: 'Confirmar: apagar histórico' }).click();
    await expect(menu.getByText('O histórico está vazio.')).toBeVisible();
  });

  test('escolher um resultado com toque (ecrã tátil)', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'Só em dispositivos com ecrã tátil.');
    await mockServices(page);
    await page.goto('/');
    await page.getByRole('combobox').fill('Sé');
    await page.getByRole('combobox').fill('Sé de Lisboa');
    await page.getByRole('option', { name: /Sé de Lisboa/ }).tap();
    await expect(page.getByRole('region', { name: 'Sé de Lisboa' })).toBeVisible();
  });

  test('clicar no mapa mostra a morada desse ponto', async ({ page }) => {
    const mocks = await mockServices(page);
    await page.goto('/');
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('O mapa não tem dimensões.');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    await expect(page.getByRole('heading', { name: 'Café da Sé' })).toBeVisible();
    await expect(page.getByText('Largo da Sé, 2, 1100-585 Lisboa')).toBeVisible();
    expect(mocks.reverseRequests).toHaveLength(1);
  });

  test('"Que sítio é este?" funciona só com teclado', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Que sítio é este/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Café da Sé' })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('heading', { name: 'Café da Sé' })).toHaveCount(0);
  });

  test('tema escuro e língua inglesa', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('radio', { name: 'Escuro' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('combobox', { name: 'Search addresses and places' })).toBeVisible();
  });

  test('mostra erro quando o serviço de pesquisa falha', async ({ page }) => {
    await mockServices(page, { searchStatus: 503 });
    await page.goto('/');
    await page.getByRole('combobox').fill('Porto');
    await expect(
      page.getByText('O serviço de pesquisa está indisponível. Tenta mais tarde.'),
    ).toBeVisible();
  });

  test('manifesto da PWA e ícones', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as { lang: string; icons: { src: string }[] };
    expect(manifest.lang).toBe('pt-PT');
    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), icon.src).toBe(true);
      expect(iconResponse.headers()['content-type']).toBe('image/png');
    }
  });

  test('cabeçalhos de segurança na versão de produção', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test.describe('acessibilidade (WCAG 2.2 AA, verificação automática)', () => {
    test('ecrã inicial, tema claro e escuro', async ({ page }) => {
      await mockServices(page);
      await page.goto('/');
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
      const light = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(light.violations).toEqual([]);
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const dark = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(dark.violations).toEqual([]);
    });

    test('resultados de pesquisa, painel do local e menu', async ({ page }) => {
      await mockServices(page);
      await page.goto('/');
      await page.getByRole('combobox').fill('Rua Augusta');
      await expect(page.getByRole('option', { name: /Rua Augusta/ })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
      await page.getByRole('combobox').press('Enter');
      await expect(page.getByRole('region', { name: 'Rua Augusta' })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    });
  });
});
