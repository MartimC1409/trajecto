/**
 * Função do Vercel que reencaminha pedidos de rota para o servidor público do Valhalla (FOSSGIS).
 * Também é usada em desenvolvimento pelo Vite (vite.config.ts), para o comportamento ser igual.
 *
 * - só aceita POST com JSON (as coordenadas vão no corpo e não ficam nos registos de URLs);
 * - recusa pedidos de outros sites (cabeçalho Sec-Fetch-Site) e corpos grandes;
 * - reconstrói o pedido só com campos conhecidos e validados, dentro da área suportada;
 * - nunca envia cookies, IP ou cabeçalhos do visitante; identifica a aplicação com um User-Agent;
 * - impõe tempo máximo e tamanho máximo de resposta.
 *
 * O servidor público tem um limite de uso justo (1 pedido por segundo por utilizador) e não tem
 * garantias de disponibilidade: serve para uso pessoal, não para um serviço com muitos utilizadores.
 */

const UPSTREAM = 'https://valhalla1.openstreetmap.de/route';
const USER_AGENT = 'Trajecto/0.1.0 (projeto pessoal)';
const TIMEOUT_MS = 15_000;
const MAX_REQUEST_BYTES = 16_000;
const MAX_RESPONSE_BYTES = 5_000_000;

/**
 * Península Ibérica, Açores, Madeira e Baleares; Canárias e Selvagens: [oeste, sul, este, norte].
 * Cópia de ROUTING_AREAS em packages/core/src/routing.ts (um teste confirma que são iguais).
 */
export const ROUTING_AREAS = [
  [-31.5, 32, 4.5, 44],
  [-18.5, 27.4, -13.2, 30.2],
] as const;
const MAX_LOCATIONS = 10;
const MAX_ALTERNATES = 2;

const COSTINGS = ['auto', 'motorcycle', 'pedestrian', 'bicycle'] as const;
const LANGUAGES = ['pt-PT', 'en-US'] as const;
const LOCAL_DATE_TIME =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** Opções de custo aceites, com o intervalo permitido. */
const COSTING_OPTION_RULES: Readonly<Record<string, (value: unknown) => boolean>> = {
  use_tolls: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  use_highways: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  use_ferry: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  shortest: (v) => typeof v === 'boolean',
};

export interface RouteProxyOptions {
  readonly upstream?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

class BadRequest extends Error {}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return list.some((item) => item === value);
}

function finite(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BadRequest(field);
  }
  return value;
}

function sanitizeLocation(value: unknown) {
  if (!isRecord(value)) throw new BadRequest('locations');
  const lat = finite(value.lat, -90, 90, 'locations');
  const lon = finite(value.lon, -180, 180, 'locations');
  const inside = ROUTING_AREAS.some(
    ([west, south, east, north]) => lon >= west && lon <= east && lat >= south && lat <= north,
  );
  if (!inside) throw new BadRequest('locations');
  if (value.type !== undefined && value.type !== 'break') throw new BadRequest('locations');
  const location: Record<string, unknown> = { lat, lon, type: 'break' };
  if (value.heading !== undefined) {
    location.heading = Math.round(finite(value.heading, 0, 360, 'heading'));
    location.heading_tolerance = Math.round(
      finite(value.heading_tolerance ?? 60, 0, 180, 'heading_tolerance'),
    );
  }
  return location;
}

/** Reconstrói o pedido só com campos conhecidos. Lança BadRequest com o nome do campo inválido. */
export function sanitizeRouteRequest(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) throw new BadRequest('body');
  const { locations, costing, costing_options: costingOptions, language } = body;

  if (!Array.isArray(locations) || locations.length < 2 || locations.length > MAX_LOCATIONS) {
    throw new BadRequest('locations');
  }
  if (!isOneOf(COSTINGS, costing)) throw new BadRequest('costing');
  if (!isOneOf(LANGUAGES, language)) throw new BadRequest('language');

  const options: Record<string, unknown> = {};
  if (costingOptions !== undefined) {
    if (!isRecord(costingOptions)) throw new BadRequest('costing_options');
    for (const [key, value] of Object.entries(costingOptions)) {
      if (key !== costing || !isRecord(value)) throw new BadRequest('costing_options');
      for (const [option, optionValue] of Object.entries(value)) {
        // Só chaves próprias: "constructor" ou "toString" não podem passar pela lista.
        const rule = Object.hasOwn(COSTING_OPTION_RULES, option)
          ? COSTING_OPTION_RULES[option]
          : undefined;
        if (!rule || !rule(optionValue)) throw new BadRequest('costing_options');
        options[option] = optionValue;
      }
    }
  }

  let dateTime: { type: 1 | 2; value: string } | undefined;
  if (body.date_time !== undefined) {
    const value = body.date_time;
    if (
      !isRecord(value) ||
      (value.type !== 1 && value.type !== 2) ||
      typeof value.value !== 'string' ||
      !LOCAL_DATE_TIME.test(value.value)
    ) {
      throw new BadRequest('date_time');
    }
    dateTime = { type: value.type, value: value.value };
  }

  let alternates = 0;
  if (body.alternates !== undefined) {
    alternates = finite(body.alternates, 0, MAX_ALTERNATES, 'alternates');
    if (!Number.isInteger(alternates)) throw new BadRequest('alternates');
    // O Valhalla não calcula alternativas com paragens nem com hora marcada.
    if (locations.length > 2 || dateTime) alternates = 0;
  }

  return {
    locations: locations.map(sanitizeLocation),
    costing,
    costing_options: Object.keys(options).length > 0 ? { [costing]: options } : {},
    units: 'kilometers',
    language,
    directions_type: 'instructions',
    turn_lanes: body.turn_lanes === true,
    ...(alternates > 0 ? { alternates } : {}),
    ...(dateTime ? { date_time: dateTime } : {}),
  };
}

/** Lê o corpo até um limite de bytes; devolve `null` se o ultrapassar. */
async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(declaredLength);
  if (declaredLength !== null && Number.isFinite(declared) && declared > maxBytes) {
    await body?.cancel();
    return null;
  }
  if (!body) return new Uint8Array();
  const reader = body.getReader();
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
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Erro 400 do Valhalla: devolvemos só o código e a mensagem (texto curto). */
async function forwardRouteError(response: Response): Promise<Response> {
  let bytes: Uint8Array | null = null;
  try {
    bytes = await readLimited(response.body, response.headers.get('content-length'), 10_000);
  } catch {
    // Ligação cortada ou tempo esgotado a meio do corpo: devolve o erro sem detalhes.
  }
  let errorCode: number | undefined;
  let message: string | undefined;
  try {
    const parsed: unknown = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined;
    if (isRecord(parsed)) {
      if (typeof parsed.error_code === 'number' && Number.isInteger(parsed.error_code)) {
        errorCode = parsed.error_code;
      }
      if (typeof parsed.error === 'string') message = parsed.error.slice(0, 200);
    }
  } catch {
    // Corpo que não é JSON: devolvemos o erro sem detalhes.
  }
  return json(
    {
      error: message ?? 'route_error',
      ...(errorCode !== undefined ? { error_code: errorCode } : {}),
    },
    400,
  );
}

export async function handleRouteRequest(
  request: Request,
  options: RouteProxyOptions = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }
  // Os browsers indicam a origem do pedido: só aceitamos pedidos da própria aplicação.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return json({ error: 'forbidden' }, 403);
  }
  if (!/^application\/json\b/iu.test(request.headers.get('content-type') ?? '')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }

  const raw = await readLimited(
    request.body,
    request.headers.get('content-length'),
    MAX_REQUEST_BYTES,
  );
  if (!raw) return json({ error: 'payload_too_large' }, 413);

  let sanitized: Record<string, unknown>;
  try {
    sanitized = sanitizeRouteRequest(JSON.parse(new TextDecoder().decode(raw)));
  } catch (error) {
    const field = error instanceof BadRequest ? error.message : 'body';
    return json({ error: 'bad_request', field }, 400);
  }

  const fetchImpl = options.fetch ?? fetch;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(options.upstream ?? UPSTREAM, {
      method: 'POST',
      // Só estes cabeçalhos: nunca cookies, Referer ou credenciais do visitante.
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sanitized),
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
  if (upstreamResponse.status === 400) return forwardRouteError(upstreamResponse);
  if (!upstreamResponse.ok) {
    await upstreamResponse.body?.cancel();
    return json({ error: 'upstream_error', status: upstreamResponse.status }, 502);
  }
  const contentType = upstreamResponse.headers.get('content-type') ?? '';
  if (!/^application\/json\b/iu.test(contentType)) {
    await upstreamResponse.body?.cancel();
    return json({ error: 'upstream_bad_content_type' }, 502);
  }

  // O tempo máximo também se aplica à leitura do corpo, que pode falhar a meio.
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readLimited(
      upstreamResponse.body,
      upstreamResponse.headers.get('content-length'),
      options.maxResponseBytes ?? MAX_RESPONSE_BYTES,
    );
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
      // Rotas revelam onde a pessoa está e para onde vai: nunca ficam em cache.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Ponto de entrada da função no Vercel (assinatura Web: Request → Response). */
export function POST(request: Request): Promise<Response> {
  // ROUTER_UPSTREAM (opcional, nas variáveis do projeto no Vercel) aponta para um Valhalla próprio.
  const upstream = process.env.ROUTER_UPSTREAM;
  return handleRouteRequest(request, upstream ? { upstream } : {});
}
