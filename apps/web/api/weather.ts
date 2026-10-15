/**
 * Função do Vercel que pede ao Open-Meteo a previsão horária para pontos de uma rota.
 * Também é usada em desenvolvimento pelo Vite (vite-api-plugin.ts).
 *
 * - só aceita GET com `lat` e `lon` (listas separadas por vírgulas, até 12 pontos, dentro da
 *   área suportada) e reconstrói o pedido com variáveis fixas;
 * - o Open-Meteo recebe o IP do Vercel e não o do utilizador;
 * - identifica a aplicação com um User-Agent, com tempo máximo e tamanho máximo de resposta.
 *
 * Termos do Open-Meteo: uso gratuito só não comercial, com limites diários, e atribuição
 * obrigatória (CC BY 4.0). Ver docs/adr/0012-meteorologia-na-rota.md.
 */

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';
const USER_AGENT = 'Trajecto/0.1.0 (projeto pessoal)';
const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_POINTS = 12;
const FORECAST_DAYS = 7;
const HOURLY = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'visibility',
  'is_day',
].join(',');

/** Cópia de ROUTING_AREAS (packages/core/src/routing.ts); um teste confirma que são iguais. */
export const ROUTING_AREAS = [
  [-31.5, 32, 4.5, 44],
  [-18.5, 27.4, -13.2, 30.2],
] as const;

const COORDINATE = /^-?\d{1,3}(?:\.\d{1,6})?$/u;

export interface WeatherProxyOptions {
  readonly upstream?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Lê uma lista de coordenadas; devolve `null` se alguma for inválida. */
function parseList(value: string | null, max: number): number[] | null {
  if (value === null || value.length > 200) return null;
  const parts = value.split(',');
  if (parts.length === 0 || parts.length > MAX_POINTS) return null;
  const numbers = parts.map((part) => (COORDINATE.test(part) ? Number(part) : Number.NaN));
  return numbers.every((n) => Number.isFinite(n) && Math.abs(n) <= max) ? numbers : null;
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get('content-length'));
  if (response.headers.has('content-length') && Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleWeatherRequest(
  request: Request,
  options: WeatherProxyOptions = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET' },
    });
  }
  const url = new URL(request.url);
  const lats = parseList(url.searchParams.get('lat'), 90);
  const lons = parseList(url.searchParams.get('lon'), 180);
  if (!lats || !lons || lats.length !== lons.length) {
    return json({ error: 'bad_request', field: 'lat,lon' }, 400);
  }
  const inside = lats.every((lat, i) => {
    const lon = lons[i] as number;
    return ROUTING_AREAS.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
  });
  if (!inside) return json({ error: 'bad_request', field: 'lat,lon' }, 400);

  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    hourly: HOURLY,
    timeformat: 'unixtime',
    timezone: 'GMT',
    forecast_days: String(FORECAST_DAYS),
    wind_speed_unit: 'kmh',
  });

  const fetchImpl = options.fetch ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${options.upstream ?? UPSTREAM}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return json(
      { error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' },
      timedOut ? 504 : 502,
    );
  }
  if (upstream.status === 429) {
    await upstream.body?.cancel();
    return json({ error: 'rate_limited' }, 429);
  }
  if (!upstream.ok || !/^application\/json\b/iu.test(upstream.headers.get('content-type') ?? '')) {
    await upstream.body?.cancel();
    return json({ error: 'upstream_error', status: upstream.status }, 502);
  }
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readLimited(upstream, options.maxResponseBytes ?? MAX_RESPONSE_BYTES);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return json(
      { error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' },
      timedOut ? 504 : 502,
    );
  }
  if (!body) return json({ error: 'upstream_too_large' }, 502);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // A previsão muda pouco em 15 min; só a cache do próprio browser (contém posições).
      'Cache-Control': 'private, max-age=900',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Ponto de entrada da função no Vercel (assinatura Web: Request → Response). */
export function GET(request: Request): Promise<Response> {
  return handleWeatherRequest(request);
}
