/* global window, document -- o código em addInitScript e evaluate corre dentro da página. */
/**
 * Orçamento de dados e de bateria (Fase 7): mede, com os serviços reais, quanto a app transfere e
 * quanto ocupa o processador. Corre no GitHub Actions (workflow "Mapa à vista"), contra
 * `pnpm preview`:
 *   node apps/web/scripts/budget.mjs http://127.0.0.1:4173 <pasta-de-saída> <pasta-dist>
 *
 * - App: tamanho dos ficheiros que o service worker guarda, comprimidos (gzip).
 * - Abrir o mapa: bytes na primeira visita e ao voltar (cache do browser e service worker).
 * - Navegação simulada em Lisboa (Marquês de Pombal → Oriente), 2 minutos a 4× (8 minutos de
 *   condução), com e sem relevo, e com a zona da rota guardada (mapas offline): bytes por tipo e
 *   tempo do processador na página (CDP Performance.getMetrics, "TaskDuration"). No CI o desenho
 *   do mapa é feito por software (SwiftShader), por isso os valores servem para comparar
 *   variantes, não para prever a bateria.
 * - Zona offline pequena (Baixa, zoom 16): estimativa da app e bytes reais transferidos.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const [baseUrl = 'http://127.0.0.1:4173', outDir = 'map-screenshots', distDir = 'dist'] =
  process.argv.slice(2);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const origin = new URL(baseUrl).origin;

const START = { latitude: 38.7253, longitude: -9.15 }; // Marquês de Pombal
const DESTINATION = { lng: -9.0945, lat: 38.7686 }; // Oriente
/** Vista que mostra a rota toda no telemóvel (zona a guardar antes de navegar). */
const ROUTE_VIEW = { center: { lng: -9.122, lat: 38.747 }, zoom: 12 };
const SIMULATION_S = 120;
const SIMULATION_FACTOR = 4;

function category(url) {
  const u = new URL(url);
  if (u.origin === origin) {
    return u.pathname.startsWith('/api/') || u.pathname.startsWith('/geocoder/') ? 'api' : 'app';
  }
  if (u.hostname === 'tiles.openfreemap.org') {
    return u.pathname.startsWith('/fonts/') ? 'fonts' : 'tiles';
  }
  if (u.hostname === 'tiles.mapterhorn.com') return 'relief';
  return 'other';
}

/** Conta os bytes recebidos (com cabeçalhos) por tipo, a partir dos eventos de rede (CDP). */
async function trackNetwork(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Performance.enable');
  const urls = new Map();
  let totals = {};
  let requests = {};
  client.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  client.on('Network.loadingFinished', (e) => {
    const url = urls.get(e.requestId);
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
    const key = category(url);
    totals[key] = (totals[key] ?? 0) + e.encodedDataLength;
    requests[key] = (requests[key] ?? 0) + 1;
  });
  return {
    reset() {
      totals = {};
      requests = {};
    },
    snapshot() {
      return { bytes: { ...totals }, requests: { ...requests } };
    },
    async taskSeconds() {
      const { metrics } = await client.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
    },
  };
}

async function newPage(browser, { relief = true, view, geolocation } = {}) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    locale: 'pt-PT',
    ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}),
  });
  await context.addInitScript(
    ({ relief: mapRelief, view: lastView }) => {
      if (window.localStorage.getItem('trajecto:v1:preferences')) return;
      window.localStorage.setItem(
        'trajecto:v1:preferences',
        JSON.stringify({ version: 1, mapRelief, ...(lastView ? { lastView } : {}) }),
      );
    },
    { relief, view },
  );
  const page = await context.newPage();
  const network = await trackNetwork(page);
  return { context, page, network };
}

async function waitForMap(page) {
  await page.locator('canvas.maplibregl-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(6000);
}

async function appSize() {
  const sw = await readFile(join(distDir, 'sw.js'), 'utf8');
  const files = JSON.parse(/const PRECACHE = (\[[^\]]*\])/u.exec(sw)?.[1] ?? '[]');
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const body = await readFile(join(distDir, file));
    raw += body.byteLength;
    gzip += gzipSync(body).byteLength;
  }
  return { files: files.length, raw, gzip };
}

async function openMap(browser) {
  const { context, page, network } = await newPage(browser);
  await page.goto(baseUrl);
  await waitForMap(page);
  const first = network.snapshot();
  network.reset();
  await page.reload();
  await waitForMap(page);
  const again = network.snapshot();
  await context.close();
  return { first, again };
}

/** Distância que falta (m), lida no ecrã de navegação ("12 min · 7,3 km"). */
async function remainingMeters(page) {
  // Ao chegar ao destino o resumo desaparece: sem ele, não há medida.
  const text = await page
    .locator('.nav-remaining')
    .textContent({ timeout: 2000 })
    .catch(() => '');
  const match = /([\d.,\s\u00a0\u202f]+)(km|m)\s*$/u.exec((text ?? '').trim());
  if (!match) return null;
  const value = Number(match[1].replace(/[\s\u00a0\u202f]/gu, '').replace(',', '.'));
  return match[2] === 'km' ? value * 1000 : value;
}

/** Guarda a zona visível pelo menu "Mapas offline" e devolve o resultado. */
async function saveVisibleZone(page) {
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const section = page.getByRole('region', { name: 'Mapas offline' });
  const estimate = await section.getByText(/Zona no ecrã/u).textContent();
  await section.getByRole('button', { name: 'Guardar esta zona' }).click();
  await section.getByText(/está guardada|ficou incompleta|parou/u).waitFor({ timeout: 180_000 });
  const message = await section.getByRole('status').textContent();
  const area = await page.evaluate(() => {
    const raw = window.localStorage.getItem('trajecto:v1:offline-areas');
    return raw ? JSON.parse(raw).areas[0] : null;
  });
  return { estimate, message, tiles: area?.tiles, storedBytes: area?.bytes };
}

async function navigation(browser, relief, { savedZone = false } = {}) {
  const destinationView = { center: DESTINATION, zoom: 15 };
  const { context, page, network } = await newPage(browser, {
    relief,
    geolocation: START,
    view: savedZone ? ROUTE_VIEW : destinationView,
  });
  await page.goto(baseUrl);
  await waitForMap(page);
  let zone;
  if (savedZone) {
    zone = await saveVisibleZone(page);
    // Volta à vista do destino; a zona fica guardada no dispositivo.
    await page.evaluate((lastView) => {
      const key = 'trajecto:v1:preferences';
      const preferences = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      window.localStorage.setItem(key, JSON.stringify({ ...preferences, lastView }));
    }, destinationView);
    await page.reload();
    await waitForMap(page);
  }
  // Destino: o centro do mapa (pesquisa inversa real), depois "Direções" e "Simular".
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole('button', { name: 'Direções' }).click({ timeout: 20_000 });
  const simulate = page.getByRole('button', { name: 'Simular' });
  await simulate.waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => !document.querySelector('.start-bar .button:not(.primary)')?.hasAttribute('disabled'),
    undefined,
    { timeout: 30_000 },
  );
  await simulate.click();
  const speed = `Velocidade da simulação: ${String(SIMULATION_FACTOR)}×`;
  await page.getByRole('button', { name: speed }).click();
  await page.getByRole('button', { name: speed, pressed: true }).waitFor();
  network.reset();
  const before = await network.taskSeconds();
  const startMeters = await remainingMeters(page);
  const started = Date.now();
  await page.waitForTimeout(SIMULATION_S * 1000);
  const elapsed = (Date.now() - started) / 1000;
  const after = await network.taskSeconds();
  const arrived = await page.getByText('Chegaste ao destino.').isVisible();
  const endMeters = arrived ? 0 : await remainingMeters(page);
  const result = {
    relief,
    savedZone: zone ?? null,
    elapsedSeconds: Math.round(elapsed),
    drivingMinutes: (elapsed * SIMULATION_FACTOR) / 60,
    arrived,
    travelledKm:
      startMeters !== null && endMeters !== null ? (startMeters - endMeters) / 1000 : null,
    mainThreadBusy: (after - before) / elapsed,
    ...network.snapshot(),
  };
  await context.close();
  return result;
}

async function offlineArea(browser) {
  const { context, page, network } = await newPage(browser, {
    relief: false,
    view: { center: { lng: -9.1375, lat: 38.7105 }, zoom: 16 },
  });
  await page.goto(baseUrl);
  await waitForMap(page);
  network.reset();
  const zone = await saveVisibleZone(page);
  const traffic = network.snapshot();
  await context.close();
  return { ...zone, ...traffic };
}

const mb = (bytes) => `${((bytes ?? 0) / 1e6).toFixed(2)} MB`;
const sum = (bytes) => Object.values(bytes ?? {}).reduce((a, b) => a + b, 0);

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const report = { baseUrl, date: new Date().toISOString(), errors: {} };
/** Cada medição é independente: uma falha fica no relatório e as outras correm na mesma. */
async function measure(name, run) {
  try {
    report[name] = await run();
  } catch (error) {
    report.errors[name] = String(error?.stack ?? error);
  }
}
try {
  await measure('app', () => appSize());
  await measure('openMap', () => openMap(browser));
  await measure('navigationWithRelief', () => navigation(browser, true));
  await measure('navigationWithoutRelief', () => navigation(browser, false));
  await measure('navigationWithSavedZone', () => navigation(browser, true, { savedZone: true }));
  await measure('offlineArea', () => offlineArea(browser));
} finally {
  await browser.close();
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'budget.json'), JSON.stringify(report, null, 2));

const lines = ['# Orçamento de dados e processador', '', `Medido em ${report.date}.`, ''];
if (report.app) {
  lines.push(
    `- App (${String(report.app.files)} ficheiros guardados pelo service worker): ${mb(report.app.raw)} sem compressão, ${mb(report.app.gzip)} comprimida (gzip).`,
  );
}
if (report.openMap) {
  lines.push(
    `- Abrir o mapa em Lisboa, 1.ª visita: ${mb(sum(report.openMap.first.bytes))} (${JSON.stringify(report.openMap.first.bytes)}).`,
    `- Abrir de novo: ${mb(sum(report.openMap.again.bytes))} (${JSON.stringify(report.openMap.again.bytes)}).`,
  );
}
for (const key of ['navigationWithRelief', 'navigationWithoutRelief', 'navigationWithSavedZone']) {
  const nav = report[key];
  if (!nav) continue;
  const perHour = (sum(nav.bytes) / nav.drivingMinutes) * 60;
  const zone = nav.savedZone
    ? `, zona da rota guardada antes (${String(nav.savedZone.tiles)} tiles, ${mb(nav.savedZone.storedBytes)}; ${nav.savedZone.estimate ?? ''})`
    : '';
  const perKm = nav.travelledKm ? ` (${mb(sum(nav.bytes) / nav.travelledKm)} por km)` : '';
  const km = nav.travelledKm === null ? '' : `, ${nav.travelledKm.toFixed(1)} km`;
  lines.push(
    `- Navegação simulada ${nav.relief ? 'com' : 'sem'} relevo${zone} (${nav.drivingMinutes.toFixed(1)} min de condução${km}): ${mb(sum(nav.bytes))}, ≈ ${mb(perHour)} por hora${perKm}; processador ocupado na página ${(nav.mainThreadBusy * 100).toFixed(0)} % (${JSON.stringify(nav.bytes)}; pedidos ${JSON.stringify(nav.requests)}).`,
  );
}
if (report.offlineArea) {
  lines.push(
    `- Zona offline (Baixa, zoom 16): ${report.offlineArea.estimate ?? ''} Guardados ${String(report.offlineArea.tiles)} tiles, ${mb(report.offlineArea.storedBytes)}; transferido ${mb(sum(report.offlineArea.bytes))}. ${report.offlineArea.message ?? ''}`,
  );
}
for (const [name, error] of Object.entries(report.errors))
  lines.push('', `Erro (${name}): ${error}`);
await writeFile(join(outDir, 'budget.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
if (Object.keys(report.errors).length > 0) process.exitCode = 1;
