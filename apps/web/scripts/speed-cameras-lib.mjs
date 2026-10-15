/**
 * Conversão da resposta do Overpass (OpenStreetMap) num ficheiro de radares fixos para a app.
 * Usado por fetch-speed-cameras.mjs (corre no GitHub Actions, uma vez por mês).
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Uma só consulta para todo o país (Continente, Açores e Madeira). */
export const OVERPASS_QUERY = `[out:json][timeout:120];
area["ISO3166-1"="PT"][admin_level=2]->.pt;
(
  node["highway"="speed_camera"](area.pt);
  relation["type"="enforcement"]["enforcement"~"^(maxspeed|average_speed)$"](area.pt);
);
out body;
>;
out skel qt;`;

const CARDINAL = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

/** "50" → 50; outros formatos (mph, condicionais…) são ignorados. */
export function parseMaxspeed(value) {
  if (typeof value !== 'string' || !/^\d{1,3}$/u.test(value.trim())) return undefined;
  const speed = Number(value.trim());
  return speed > 0 && speed <= 200 ? speed : undefined;
}

/** Direção em graus ("90") ou ponto cardeal ("NE"); "forward"/"backward" não se resolvem aqui. */
export function parseDirection(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toUpperCase();
  if (/^\d{1,3}(?:\.\d+)?$/u.test(text)) {
    const degrees = Number(text);
    return degrees >= 0 && degrees <= 360 ? Math.round(degrees) % 360 : undefined;
  }
  const index = CARDINAL.indexOf(text);
  return index === -1 ? undefined : index * 22.5;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** Converte os elementos do Overpass na lista de radares (sem repetidos, por ordem de id). */
export function camerasFromOverpass(body) {
  const elements = Array.isArray(body?.elements) ? body.elements : [];
  const nodes = new Map();
  for (const el of elements) {
    if (el?.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodes.set(el.id, el);
    }
  }
  const cameras = new Map();
  for (const el of elements) {
    if (el?.type !== 'node' || el.tags?.highway !== 'speed_camera') continue;
    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
    cameras.set(`n${el.id}`, {
      id: `n${el.id}`,
      lat: round(el.lat),
      lon: round(el.lon),
      ...optional('maxspeed', parseMaxspeed(el.tags.maxspeed)),
      ...optional('direction', parseDirection(el.tags.direction)),
    });
  }
  for (const el of elements) {
    if (el?.type !== 'relation' || el.tags?.type !== 'enforcement') continue;
    const members = Array.isArray(el.members) ? el.members : [];
    const device =
      members.find((m) => m.type === 'node' && m.role === 'device') ??
      members.find((m) => m.type === 'node' && m.role === 'from');
    const node = device ? nodes.get(device.ref) : undefined;
    if (!node || cameras.has(`n${node.id}`)) continue;
    cameras.set(`r${el.id}`, {
      id: `r${el.id}`,
      lat: round(node.lat),
      lon: round(node.lon),
      ...optional('maxspeed', parseMaxspeed(el.tags.maxspeed)),
      ...(el.tags.enforcement === 'average_speed' ? { average: true } : {}),
    });
  }
  return [...cameras.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function optional(key, value) {
  return value === undefined ? {} : { [key]: value };
}

/** Ficheiro final, com a atribuição e a licença exigidas pela ODbL. */
export function buildDataset(cameras, generatedAt) {
  return {
    source: 'OpenStreetMap (highway=speed_camera e relações type=enforcement)',
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    copyrightUrl: 'https://www.openstreetmap.org/copyright',
    generatedAt,
    cameras,
  };
}
