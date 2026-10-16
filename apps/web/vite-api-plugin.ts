import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleRouteRequest } from './api/route';
import { handleTransitRequest } from './api/transit';
import { handleWeatherRequest } from './api/weather';

/** Limite de leitura do corpo antes de entregar à função (a função aplica o seu próprio limite). */
const MAX_BODY_BYTES = 64_000;
/** Só estes cabeçalhos do browser interessam à função. */
const FORWARDED_HEADERS = ['content-type', 'content-length', 'sec-fetch-site'];

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(req: IncomingMessage, path: string): Promise<Request | null> {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await readBody(req) : undefined;
  if (body === null) return null;
  // Depois de montado num caminho, `req.url` só tem o resto (por exemplo "/?lat=…").
  const query = (req.url ?? '').replace(/^[^?]*/u, '');
  return new Request(`http://localhost${path}${query}`, {
    method,
    headers,
    ...(body ? { body: new Uint8Array(body) } : {}),
  });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

type Handler = (request: Request) => Promise<Response>;

function middleware(path: string, handler: Handler) {
  return (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const request = await toWebRequest(req, path);
        if (!request) {
          res.statusCode = 413;
          res.end();
          return;
        }
        await sendWebResponse(res, await handler(request));
      } catch (error) {
        console.error(`[${path}]`, error);
        res.statusCode = 500;
        res.end();
      }
    })();
  };
}

/**
 * Serve /api/route, /api/weather e /api/transit no `vite` e no `vite preview` com as mesmas funções usadas
 * no Vercel, para o comportamento ser igual em desenvolvimento e em produção.
 */
export function apiPlugin(options: { routeUpstream?: string } = {}): Plugin {
  const routes: [string, Handler][] = [
    [
      '/api/route',
      (request) =>
        handleRouteRequest(
          request,
          options.routeUpstream ? { upstream: options.routeUpstream } : {},
        ),
    ],
    ['/api/weather', (request) => handleWeatherRequest(request)],
    ['/api/transit', (request) => handleTransitRequest(request)],
  ];
  return {
    name: 'trajecto-api',
    configureServer(server) {
      for (const [path, handler] of routes) server.middlewares.use(path, middleware(path, handler));
    },
    configurePreviewServer(server) {
      for (const [path, handler] of routes) server.middlewares.use(path, middleware(path, handler));
    },
  };
}
