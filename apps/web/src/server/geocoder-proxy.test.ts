// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, handleGeocoderRequest } from '../../api/geocoder';

const BASE = 'https://trajecto.example/api/geocoder';

function jsonUpstream(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    ...init,
  });
}

function setup(response: Response | (() => Promise<Response>) = jsonUpstream({ features: [] })) {
  const fetchMock = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  const call = (query: string, init: RequestInit = {}) =>
    handleGeocoderRequest(new Request(`${BASE}?${query}`, init), {
      upstream: 'https://photon.test/',
      fetch: fetchMock,
      timeoutMs: 50,
      maxResponseBytes: 1_000,
    });
  return { fetchMock, call };
}

describe('função geocoder (proxy para o Photon)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reencaminha a pesquisa só com parâmetros conhecidos e cabeçalhos próprios', async () => {
    const { fetchMock, call } = setup(jsonUpstream({ features: [{ id: 1 }] }));
    const response = await call(
      'endpoint=api&q=Rua%20Augusta&limit=6&lat=38.7223&lon=-9.1393&zoom=13&countrycode=pt&osm_tag=x&endpoint=reverse',
      { headers: { Cookie: '_vercel_jwt=segredo', Referer: 'https://trajecto.example/' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ features: [{ id: 1 }] });
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://photon.test/api?q=Rua+Augusta&limit=6&lat=38.7223&lon=-9.1393&zoom=13&countrycode=PT',
    );
    expect(init?.headers).toEqual({
      'User-Agent': 'Trajecto/0.1.0 (projeto pessoal)',
      Accept: 'application/json',
    });
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('geocodificação inversa exige latitude e longitude', async () => {
    const { fetchMock, call } = setup();
    expect((await call('endpoint=reverse&lat=38.7')).status).toBe(400);
    expect((await call('endpoint=reverse&lat=38.7&lon=-9.1&limit=1')).status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://photon.test/reverse?lat=38.7&lon=-9.1&limit=1',
    );
  });

  it('recusa pedidos de outros sites', async () => {
    const { call, fetchMock } = setup();
    const response = await call('endpoint=api&q=lisboa', {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa métodos que não sejam GET', async () => {
    const { fetchMock, call } = setup();
    const response = await call('endpoint=api&q=abc', { method: 'POST', body: 'x' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'endpoint=status', 'endpoint=../status', 'endpoint=api%2F..%2Fstatus'])(
    'só existem os caminhos api e reverse (%s)',
    async (query) => {
      const { fetchMock, call } = setup();
      expect((await call(query)).status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['endpoint=api', 'q'],
    ['endpoint=api&q=%20%20', 'q'],
    [`endpoint=api&q=${'a'.repeat(201)}`, 'q'],
    ['endpoint=api&q=abc&limit=50', 'limit'],
    ['endpoint=api&q=abc&limit=0', 'limit'],
    ['endpoint=api&q=abc&lat=91', 'lat'],
    ['endpoint=api&q=abc&lon=-180.5', 'lon'],
    ['endpoint=api&q=abc&lat=1e3', 'lat'],
    ['endpoint=api&q=abc&zoom=23', 'zoom'],
    ['endpoint=api&q=abc&countrycode=PRT', 'countrycode'],
    [`endpoint=api&q=abc${'&countrycode=PT'.repeat(6)}`, 'countrycode'],
  ])('valida parâmetros (%s)', async (query, param) => {
    const { fetchMock, call } = setup();
    const response = await call(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request', param });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('também aceita o destino no caminho (/geocoder/api e /geocoder/reverse)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream({ features: [] }));
    const options = { upstream: 'https://photon.test', fetch: fetchMock };
    const search = await handleGeocoderRequest(
      new Request('https://trajecto.example/geocoder/api?q=Porto'),
      options,
    );
    const reverse = await handleGeocoderRequest(
      new Request('https://trajecto.example/geocoder/reverse/?lat=41.1&lon=-8.6'),
      options,
    );
    const unknown = await handleGeocoderRequest(
      new Request('https://trajecto.example/geocoder/status?q=x'),
      options,
    );
    expect([search.status, reverse.status, unknown.status]).toEqual([200, 200, 404]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://photon.test/api?q=Porto',
      'https://photon.test/reverse?lat=41.1&lon=-8.6',
    ]);
  });

  it('o parâmetro endpoint tem prioridade e um valor inválido não recorre ao caminho', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream({ features: [] }));
    const response = await handleGeocoderRequest(
      new Request('https://trajecto.example/geocoder/api?endpoint=status&q=x'),
      { upstream: 'https://photon.test', fetch: fetchMock },
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa só o primeiro valor de parâmetros repetidos', async () => {
    const { fetchMock, call } = setup();
    await call('endpoint=api&q=um&q=dois&limit=2&limit=3');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://photon.test/api?q=um&limit=2');
  });

  it('limite de pedidos do Photon (429) passa ao cliente com Retry-After', async () => {
    const { call } = setup(new Response('x', { status: 429, headers: { 'Retry-After': '30' } }));
    const response = await call('endpoint=api&q=abc');
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('ignora Retry-After inválido', async () => {
    const { call } = setup(
      new Response('x', { status: 429, headers: { 'Retry-After': 'amanhã' } }),
    );
    expect((await call('endpoint=api&q=abc')).headers.get('retry-after')).toBeNull();
  });

  it('erros do Photon resultam em 502', async () => {
    const { call } = setup(new Response('erro', { status: 503 }));
    const response = await call('endpoint=api&q=abc');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream_error', status: 503 });
  });

  it('respostas que não são JSON resultam em 502', async () => {
    const { call } = setup(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }));
    expect(await (await call('endpoint=api&q=abc')).json()).toEqual({
      error: 'upstream_bad_content_type',
    });
  });

  it('aceita application/geo+json', async () => {
    const { call } = setup(
      new Response('{"features":[]}', { headers: { 'Content-Type': 'application/geo+json' } }),
    );
    expect((await call('endpoint=api&q=abc')).status).toBe(200);
  });

  it('recusa respostas demasiado grandes (com e sem Content-Length)', async () => {
    const big = JSON.stringify({ features: 'x'.repeat(2_000) });
    const declared = setup(
      new Response(big, {
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(big.length) },
      }),
    );
    expect(await (await declared.call('endpoint=api&q=abc')).json()).toEqual({
      error: 'upstream_too_large',
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new TextEncoder().encode('x'.repeat(400)));
        controller.close();
      },
    });
    const streamed = setup(
      new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    );
    expect((await streamed.call('endpoint=api&q=abc')).status).toBe(502);
  });

  it('falha de rede resulta em 502 e tempo esgotado em 504', async () => {
    const offline = setup(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await (await offline.call('endpoint=api&q=abc')).json()).toEqual({
      error: 'upstream_unreachable',
    });

    const slow = setup(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new DOMException('Tempo esgotado', 'TimeoutError')), 10);
        }),
    );
    const response = await slow.call('endpoint=api&q=abc');
    expect(response.status).toBe(504);
  });

  it('o tempo máximo cancela pedidos que nunca respondem', async () => {
    // Este fetch falso só termina quando o sinal de tempo limite dispara.
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const response = await handleGeocoderRequest(new Request(`${BASE}?endpoint=api&q=abc`), {
      upstream: 'https://photon.test',
      fetch: fetchMock,
      timeoutMs: 20,
    });
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'upstream_timeout' });
  });

  it('GET usa o Photon público por omissão', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonUpstream({ features: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new Request(`${BASE}?endpoint=reverse&lat=38.7&lon=-9.1`));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://photon.komoot.io/reverse?lat=38.7&lon=-9.1');
  });
});
