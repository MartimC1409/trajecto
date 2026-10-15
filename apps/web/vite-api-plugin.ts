import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleRouteRequest } from './api/route';

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

async function toWebRequest(req: IncomingMessage): Promise<Request | null> {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await readBody(req) : undefined;
  if (body === null) return null;
  return new Request('http://localhost/api/route', {
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

/**
 * Serve /api/route no `vite` e no `vite preview` com a mesma função usada no Vercel,
 * para o comportamento ser igual em desenvolvimento e em produção.
 */
export function apiPlugin(options: { routeUpstream?: string } = {}): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const request = await toWebRequest(req);
        if (!request) {
          res.statusCode = 413;
          res.end();
          return;
        }
        const response = await handleRouteRequest(
          request,
          options.routeUpstream ? { upstream: options.routeUpstream } : {},
        );
        await sendWebResponse(res, response);
      } catch (error) {
        console.error('[api/route]', error);
        res.statusCode = 500;
        res.end();
      }
    })();
  };
  return {
    name: 'trajecto-api',
    configureServer(server) {
      server.middlewares.use('/api/route', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/route', handle);
    },
  };
}
