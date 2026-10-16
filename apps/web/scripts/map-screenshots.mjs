/* global window, document -- o código em addInitScript e evaluate corre dentro da página. */
/**
 * Fotografias do mapa real (tiles do OpenFreeMap e relevo do Mapterhorn) em vários sítios de
 * Portugal, para rever o estilo à vista. Corre no GitHub Actions (workflow "Mapa à vista"),
 * contra `pnpm preview`:
 *   node apps/web/scripts/map-screenshots.mjs http://127.0.0.1:4173 <pasta-de-saída>
 * Também regista erros da consola, violações da CSP e as respostas dos serviços de tiles.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices, webkit } from '@playwright/test';

const [baseUrl = 'http://127.0.0.1:4173', outDir = 'map-screenshots'] = process.argv.slice(2);

const PLACES = [
  { name: 'baixa-claro', lng: -9.1375, lat: 38.7105, zoom: 16.4, theme: 'light' },
  { name: 'baixa-escuro', lng: -9.1375, lat: 38.7105, zoom: 16.4, theme: 'dark' },
  { name: 'rossio-z17', lng: -9.1395, lat: 38.7139, zoom: 17.2, theme: 'light' },
  { name: 'ponte-25-abril', lng: -9.1775, lat: 38.6915, zoom: 14, theme: 'light' },
  { name: 'autoestradas-lisboa', lng: -9.15, lat: 38.8, zoom: 10.5, theme: 'light' },
  { name: 'serra-da-estrela', lng: -7.6127, lat: 40.3217, zoom: 11, theme: 'light' },
  { name: 'serra-da-estrela-escuro', lng: -7.6127, lat: 40.3217, zoom: 11, theme: 'dark' },
  { name: 'porto-ribeira', lng: -8.6125, lat: 41.1407, zoom: 15, theme: 'light' },
  { name: 'funchal', lng: -16.91, lat: 32.65, zoom: 12.5, theme: 'light' },
];

const BROWSERS = [
  { name: 'chromium', type: chromium, device: { viewport: { width: 900, height: 700 } } },
  {
    name: 'iphone',
    type: webkit,
    device: devices['iPhone 15'],
    only: ['baixa-claro', 'serra-da-estrela'],
  },
];

await mkdir(outDir, { recursive: true });
const report = { baseUrl, results: [] };

// Opcional: só alguns browsers (por exemplo MAP_SHOTS_BROWSERS=chromium) e um Chromium já
// instalado (PLAYWRIGHT_CHROMIUM_EXECUTABLE), como no playwright.config.ts.
const wanted = process.env.MAP_SHOTS_BROWSERS?.split(',');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

for (const spec of BROWSERS) {
  if (wanted && !wanted.includes(spec.name)) continue;
  const browser = await spec.type.launch(
    spec.name === 'chromium' && executablePath ? { executablePath } : {},
  );
  for (const place of PLACES) {
    if (spec.only && !spec.only.includes(place.name)) continue;
    const device = { ...spec.device };
    delete device.defaultBrowserType;
    const context = await browser.newContext({ ...device, locale: 'pt-PT' });
    const page = await context.newPage();
    const result = { browser: spec.name, place: place.name, console: [], csp: [], tiles: {} };
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) result.console.push(message.text());
    });
    page.on('pageerror', (error) => result.console.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      const host = new URL(response.url()).host;
      if (!host.includes('openfreemap') && !host.includes('mapterhorn')) return;
      const entry = (result.tiles[host] ??= { count: 0, statuses: {}, cors: null });
      entry.count += 1;
      entry.statuses[response.status()] = (entry.statuses[response.status()] ?? 0) + 1;
      entry.cors ??= response.headers()['access-control-allow-origin'] ?? null;
    });
    await page.addInitScript(
      ({ lng, lat, zoom, theme }) => {
        window.localStorage.setItem(
          'trajecto:v1:preferences',
          JSON.stringify({ version: 1, theme, lastView: { center: { lng, lat }, zoom } }),
        );
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__csp.push(`${event.effectiveDirective} ${event.blockedURI}`);
        });
      },
      { lng: place.lng, lat: place.lat, zoom: place.zoom, theme: place.theme },
    );
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    // O WebKit sem placa gráfica desenha mais devagar.
    await page.waitForTimeout(spec.name === 'iphone' ? 10_000 : 4000);
    result.csp = await page.evaluate(() => window.__csp ?? []);
    // caret 'initial': sem o estilo que o Playwright injeta (a CSP do WebKit recusava-o).
    await page.screenshot({ path: `${outDir}/${spec.name}-${place.name}.png`, caret: 'initial' });
    report.results.push(result);
    await context.close();
  }
  await browser.close();
}

await writeFile(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
