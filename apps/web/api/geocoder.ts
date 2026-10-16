/**
 * Função do Vercel que reencaminha a pesquisa para o servidor público do Photon.
 * Faz em produção o mesmo que o proxy do Vite faz em desenvolvimento (vite.config.ts):
 * - só aceita GET e só os caminhos "api" (pesquisa) e "reverse" (morada de um ponto);
 * - só reencaminha parâmetros conhecidos e validados (nunca cookies nem outros cabeçalhos);
 * - identifica a aplicação com um User-Agent e impõe tempo máximo e tamanho máximo de resposta.
 *
 * O cliente chama /geocoder/api?... e /geocoder/reverse?...; o vercel.json reescreve esses
 * caminhos para /api/geocoder?endpoint=api|reverse. O destino é lido do parâmetro "endpoint"
 * ou, se não existir, do próprio caminho (/geocoder/api ou /geocoder/reverse), para funcionar
 * qualquer que seja o URL que o Vercel entregue à função depois da reescrita.
 */

const UPSTREAM = 'https://photon.komoot.io';
const USER_AGENT = 'Trajecto/0.1.0 (projeto pessoal)';
const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_COUNTRY_CODES = 5;

const ENDPOINTS = ['api', 'reverse'] as const;
type Endpoint = (typeof ENDPOINTS)[number];

const COORDINATE = /^-?\d{1,3}(?:\.\d{1,10})?$/u;

/** Parâmetros aceites e respetiva validação. Tudo o resto é ignorado. */
const PARAM_RULES: Readonly<Record<string, (value: string) => boolean>> = {
  q: (v) => v.trim().length > 0 && v.length <= 200,
  limit: (v) => /^\d{1,2}$/u.test(v) && Number(v) >= 1 && Number(v) <= 10,
  lat: (v) => COORDINATE.test(v) && Math.abs(Number(v)) <= 90,
  lon: (v) => COORDINATE.test(v) && Math.abs(Number(v)) <= 180,
  zoom: (v) => /^\d{1,2}$/u.test(v) && Number(v) <= 22,
  countrycode: (v) => /^[A-Za-z]{2}$/u.test(v),
};

export interface GeocoderProxyOptions {
  readonly upstream?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function isEndpoint(value: string | null | undefined): value is Endpoint {
  return ENDPOINTS.some((e) => e === value);
}

/** Destino pedido: parâmetro "endpoint" ou último segmento de /geocoder/<destino>. */
function endpointOf(url: URL): Endpoint | null {
  const fromQuery = url.searchParams.get('endpoint');
  if (fromQuery !== null) return isEndpoint(fromQuery) ? fromQuery : null;
  const fromPath = /\/geocoder\/([a-z]+)\/?$/u.exec(url.pathname)?.[1];
  return isEndpoint(fromPath) ? fromPath : null;
}

/** Lê o corpo até um limite de bytes; devolve `null` se o ultrapassar. */
async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
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

export async function handleGeocoderRequest(
  request: Request,
  options: GeocoderProxyOptions = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  // Os browsers indicam a origem do pedido: só aceitamos pedidos da própria aplicação.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return json({ error: 'forbidden' }, 403);
  }

  const url = new URL(request.url);
  const endpoint = endpointOf(url);
  if (!endpoint) return json({ error: 'not_found' }, 404);

  const params = new URLSearchParams();
  let countryCodes = 0;
  for (const [key, value] of url.searchParams) {
    const rule = PARAM_RULES[key];
    if (!rule) continue; // parâmetros desconhecidos (incluindo "endpoint") não seguem para o Photon
    if (!rule(value)) return json({ error: 'bad_request', param: key }, 400);
    if (key === 'countrycode') {
      countryCodes += 1;
      if (countryCodes > MAX_COUNTRY_CODES) return json({ error: 'bad_request', param: key }, 400);
      params.append(key, value.toUpperCase());
    } else if (!params.has(key)) {
      params.set(key, value);
    }
  }
  if (endpoint === 'api' && !params.has('q'))
    return json({ error: 'bad_request', param: 'q' }, 400);
  if (endpoint === 'reverse' && !(params.has('lat') && params.has('lon'))) {
    return json({ error: 'bad_request', param: 'lat,lon' }, 400);
  }

  const upstream = (options.upstream ?? UPSTREAM).replace(/\/+$/u, '');
  const fetchImpl = options.fetch ?? fetch;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(`${upstream}/${endpoint}?${params.toString()}`, {
      method: 'GET',
      // Só estes cabeçalhos: nunca cookies, Referer ou credenciais do visitante.
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

  if (upstreamResponse.status === 429) {
    await upstreamResponse.body?.cancel();
    const retryAfter = upstreamResponse.headers.get('retry-after');
    return json(
      { error: 'rate_limited' },
      429,
      retryAfter && /^\d{1,4}$/u.test(retryAfter) ? { 'Retry-After': retryAfter } : {},
    );
  }
  if (!upstreamResponse.ok) {
    await upstreamResponse.body?.cancel();
    return json({ error: 'upstream_error', status: upstreamResponse.status }, 502);
  }
  const contentType = upstreamResponse.headers.get('content-type') ?? '';
  if (!/^application\/(?:geo\+)?json\b/iu.test(contentType)) {
    await upstreamResponse.body?.cancel();
    return json({ error: 'upstream_bad_content_type' }, 502);
  }

  const body = await readLimited(upstreamResponse, options.maxResponseBytes ?? MAX_RESPONSE_BYTES);
  if (!body) return json({ error: 'upstream_too_large' }, 502);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Só a cache do próprio browser: o texto pesquisado não fica guardado em caches partilhadas.
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Ponto de entrada da função no Vercel (assinatura Web: Request → Response). */
export function GET(request: Request): Promise<Response> {
  return handleGeocoderRequest(request);
}
