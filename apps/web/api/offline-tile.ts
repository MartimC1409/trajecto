/**
 * Função do Vercel que transfere um tile vetorial do OpenFreeMap para os mapas offline.
 * Também é usada em desenvolvimento pelo Vite (vite-api-plugin.ts).
 *
 * Os termos do OpenFreeMap ("Offline Downloads", verificados em 2026-10-16) permitem transferir
 * zonas para uso offline com no máximo 3000 tiles ou 50 MB por transferência, 4 pedidos em
 * paralelo e um User-Agent próprio que identifique a app. Os browsers não deixam a página mudar o
 * User-Agent, por isso as transferências passam por aqui. Ver docs/adr/0016.
 *
 * - só aceita GET com `v` (versão dos tiles ou "latest"), `z` (0–14), `x` e `y`;
 * - só tiles que tocam na área suportada pela app (Portugal, Espanha, ilhas e Canárias);
 * - devolve o tile comprimido (gzip) como dados binários, sem `Content-Encoding`: o browser não o
 *   descomprime e a app guarda-o assim (ocupa ~3 vezes menos). O tamanho conta para o limite de
 *   50 MB e vai também em `X-Tile-Bytes`;
 * - impõe tempo máximo e tamanho máximo de resposta.
 */
import { gzipSync } from 'node:zlib';

const UPSTREAM = 'https://tiles.openfreemap.org/planet';
const USER_AGENT =
  'Trajecto/0.1.0 (+https://github.com/MartimC1409/trajecto; https://trajecto-psi.vercel.app)';
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ZOOM = 14;

/** Cópia de ROUTING_AREAS (packages/core/src/routing.ts); um teste confirma que são iguais. */
export const ROUTING_AREAS = [
  [-31.5, 32, 4.5, 44],
  [-18.5, 27.4, -13.2, 30.2],
] as const;

const VERSION = /^(?:\d{8}_\d{6}_pt|latest)$/u;
const INTEGER = /^\d{1,5}$/u;

export interface OfflineTileOptions {
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

/** Retângulo [oeste, sul, este, norte] de um tile XYZ. */
function tileBBox(z: number, x: number, y: number): readonly [number, number, number, number] {
  const n = 2 ** z;
  const lat = (row: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

export function isTileAllowed(z: number, x: number, y: number): boolean {
  if (z < 0 || z > MAX_ZOOM) return false;
  const n = 2 ** z;
  if (x < 0 || x >= n || y < 0 || y >= n) return false;
  const [west, south, east, north] = tileBBox(z, x, y);
  return ROUTING_AREAS.some(([w, s, e, nn]) => west < e && east > w && south < nn && north > s);
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
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

export async function handleOfflineTileRequest(
  request: Request,
  options: OfflineTileOptions = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  // Os browsers indicam a origem do pedido: só aceitamos pedidos da própria aplicação.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return json({ error: 'forbidden' }, 403);
  }

  const params = new URL(request.url).searchParams;
  const version = params.get('v') ?? '';
  const [z, x, y] = ['z', 'x', 'y'].map((name) => params.get(name) ?? '');
  if (!VERSION.test(version) || ![z, x, y].every((value) => INTEGER.test(value ?? ''))) {
    return json({ error: 'bad_request' }, 400);
  }
  const tile = [Number(z), Number(x), Number(y)] as const;
  if (!isTileAllowed(...tile)) return json({ error: 'tile_not_allowed' }, 400);

  const url = `${options.upstream ?? UPSTREAM}/${version}/${tile.join('/')}.pbf`;
  let upstream: Response;
  try {
    upstream = await (options.fetch ?? fetch)(url, {
      // Só estes cabeçalhos: nunca cookies, Referer ou o IP do visitante.
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/x-protobuf,*/*' },
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
  if (upstream.status !== 200 && upstream.status !== 204) {
    await upstream.body?.cancel();
    return json({ error: 'upstream_error', status: upstream.status }, 502);
  }

  let body: Uint8Array | null;
  try {
    body = await readLimited(upstream, options.maxResponseBytes ?? MAX_RESPONSE_BYTES);
  } catch (error) {
    return upstreamFailure(error);
  }
  if (!body) return json({ error: 'upstream_too_large' }, 502);

  const headers = {
    // Os tiles de uma versão não mudam; a app guarda-os ela própria (Cache Storage).
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };
  // Tile vazio (por exemplo, mar aberto): sem corpo.
  if (body.byteLength === 0) {
    return new Response(null, { status: 204, headers: { ...headers, 'X-Tile-Bytes': '0' } });
  }
  const compressed = gzipSync(body);
  return new Response(new Uint8Array(compressed), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'X-Tile-Encoding': 'gzip',
      'X-Tile-Bytes': String(compressed.byteLength),
    },
  });
}

/** Ponto de entrada da função no Vercel (assinatura Web: Request → Response). */
export function GET(request: Request): Promise<Response> {
  return handleOfflineTileRequest(request);
}
