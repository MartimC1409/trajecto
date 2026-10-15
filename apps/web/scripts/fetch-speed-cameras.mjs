/**
 * Descarrega os radares fixos de Portugal do OpenStreetMap (uma consulta ao Overpass) e grava
 * apps/web/public/data/speed-cameras.json. Corre no GitHub Actions uma vez por mês (ou à mão):
 *   node apps/web/scripts/fetch-speed-cameras.mjs
 * Regras do servidor público do Overpass: User-Agent próprio, poucas consultas, esperar ≥ 30 s
 * depois de um erro 429. Por isso não é usado a cada rota, só para gerar este ficheiro.
 */
import { writeFile } from 'node:fs/promises';
import {
  buildDataset,
  camerasFromOverpass,
  OVERPASS_QUERY,
  OVERPASS_URL,
} from './speed-cameras-lib.mjs';

const OUTPUT = new URL('../public/data/speed-cameras.json', import.meta.url);
const USER_AGENT = 'Trajecto/0.1.0 (projeto pessoal; https://github.com/MartimC1409/trajecto)';

const response = await fetch(OVERPASS_URL, {
  method: 'POST',
  headers: {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  },
  body: new URLSearchParams({ data: OVERPASS_QUERY }),
  signal: AbortSignal.timeout(180_000),
});
if (!response.ok) {
  console.error(`Overpass respondeu HTTP ${response.status}. Tenta mais tarde (≥ 30 s).`);
  process.exit(1);
}
const cameras = camerasFromOverpass(await response.json());
if (cameras.length === 0) {
  console.error('A resposta não trouxe radares: o ficheiro anterior fica como está.');
  process.exit(1);
}
const dataset = buildDataset(cameras, new Date().toISOString());
await writeFile(OUTPUT, `${JSON.stringify(dataset, null, 1)}\n`);
console.log(`${cameras.length} radares gravados em ${OUTPUT.pathname}`);
