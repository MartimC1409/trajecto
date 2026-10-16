/**
 * Função do Vercel que pede ao Transitous (MOTIS 2, `/api/v6/plan`) ligações de transportes
 * públicos. Também é usada em desenvolvimento pelo Vite (vite-api-plugin.ts).
 *
 * - só aceita GET com `fromPlace` e `toPlace` ("lat,lon", dentro da área suportada) e, opcional,
 *   `time` (ISO 8601 em UTC, entre ontem e daqui a 60 dias) e `arriveBy=true`;
 * - reconstrói o pedido só com estes campos (mais a língua); o Transitous recebe o IP do Vercel
 *   e não o do utilizador;
 * - identifica a aplicação com um User-Agent com contacto, como pede a política de uso;
 * - impõe tempo máximo e tamanho máximo de resposta.
 *
 * Política de uso do Transitous (transitous.org/api): projeto de código aberto e não comercial,
 * poucos pedidos, User-Agent com nome, versão e contacto, ligação visível para
 * transitous.org/sources. Limite: 20 pedidos de rotas por minuto por IP. Ver docs/adr/0015.
 */

const UPSTREAM = 'https://api.transitous.org/api/v6/plan';
/** User-Agent da app (o mesmo em todas as funções que falam com serviços externos). */
export const USER_AGENT =
  'Trajecto/0.1.0 (+https://github.com/MartimC1409/trajecto; https://trajecto-psi.vercel.app)';
const TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const DAY_MS = 86_400_000;
const MAX_DAYS_AHEAD = 60;

/** Cópia de ROUTING_AREAS (packages/core/src/routing.ts); um teste confirma que são iguais. */
export const ROUTING_AREAS = [
  [-31.5, 32, 4.5, 44],
  [-18.5, 27.4, -13.2, 30.2],
] as const;

const PLACE = /^(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export interface TransitProxyOptions {
  readonly upstream?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly now?: () => number;
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

/** "lat,lon" dentro da área suportada, ou `null`. */
function parsePlace(value: string | null): string | null {
  const match = value === null ? null : PLACE.exec(value);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  const inside = ROUTING_AREAS.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
  return inside ? `${String(lat)},${String(lon)}` : null;
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

function upstreamFailure(error: unknown): Response {
  const timedOut = error instanceof Error && error.name === 'TimeoutError';
  return json(
    { error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' },
    timedOut ? 504 : 502,
  );
}

export async function handleTransitRequest(
  request: Request,
  options: TransitProxyOptions = {},
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
  const fromPlace = parsePlace(url.searchParams.get('fromPlace'));
  const toPlace = parsePlace(url.searchParams.get('toPlace'));
  if (!fromPlace || !toPlace) return json({ error: 'bad_request', field: 'place' }, 400);

  const params = new URLSearchParams({ fromPlace, toPlace, language: 'pt' });
  const time = url.searchParams.get('time');
  if (time !== null) {
    const ms = ISO_UTC.test(time) ? Date.parse(time) : Number.NaN;
    const now = (options.now ?? Date.now)();
    if (!Number.isFinite(ms) || ms < now - DAY_MS || ms > now + MAX_DAYS_AHEAD * DAY_MS) {
      return json({ error: 'bad_request', field: 'time' }, 400);
    }
    params.set('time', new Date(ms).toISOString());
    if (url.searchParams.get('arriveBy') === 'true') params.set('arriveBy', 'true');
  }

  const fetchImpl = options.fetch ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${options.upstream ?? UPSTREAM}?${params.toString()}`, {
      // Só estes cabeçalhos: nunca cookies, Referer ou o IP do visitante.
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (error) {
    return upstreamFailure(error);
  }

  if (upstream.status === 429) {
    await upstream.body?.cancel();
    const retryAfter = upstream.headers.get('retry-after');
    return json(
      { error: 'rate_limited' },
      429,
      retryAfter && /^\d{1,4}$/u.test(retryAfter) ? { 'Retry-After': retryAfter } : {},
    );
  }
  // Pedido recusado (por exemplo, um ponto sem rede viária perto): só a mensagem, curta.
  if (upstream.status === 400 || upstream.status === 422) {
    let message = 'route_error';
    try {
      const bytes = await readLimited(upstream, 10_000);
      const parsed: unknown = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined;
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        const value = (parsed as { error: unknown }).error;
        if (typeof value === 'string') message = value.slice(0, 200);
      }
    } catch {
      // Corpo inválido: fica a mensagem genérica.
    }
    return json({ error: message }, upstream.status);
  }
  if (!upstream.ok || !/^application\/json\b/iu.test(upstream.headers.get('content-type') ?? '')) {
    await upstream.body?.cancel();
    return json({ error: 'upstream_error', status: upstream.status }, 502);
  }

  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readLimited(upstream, options.maxResponseBytes ?? MAX_RESPONSE_BYTES);
  } catch (error) {
    return upstreamFailure(error);
  }
  if (!body) return json({ error: 'upstream_too_large' }, 502);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Horários mudam pouco num minuto; só a cache do próprio browser (contém posições).
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Ponto de entrada da função no Vercel (assinatura Web: Request → Response). */
export function GET(request: Request): Promise<Response> {
  return handleTransitRequest(request);
}
