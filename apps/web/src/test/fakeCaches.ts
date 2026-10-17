/**
 * Cache Storage em memória para os testes (o jsdom não a tem). Implementa só o que a app usa:
 * open, delete, has e, em cada cache, match, put, delete e keys.
 */
export function createFakeCacheStorage(): CacheStorage & { failNextPut?: Error } {
  const caches = new Map<string, Map<string, Response>>();
  const keyOf = (request: RequestInfo | URL) =>
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;

  const storage = {
    failNextPut: undefined as Error | undefined,
    async open(name: string) {
      let entries = caches.get(name);
      if (!entries) {
        entries = new Map();
        caches.set(name, entries);
      }
      const data = entries;
      return {
        async match(request: RequestInfo | URL) {
          return data.get(keyOf(request))?.clone();
        },
        async put(request: RequestInfo | URL, response: Response) {
          if (storage.failNextPut) {
            const error = storage.failNextPut;
            storage.failNextPut = undefined;
            throw error;
          }
          // Lê o corpo já, como a Cache Storage real.
          const body = await response.arrayBuffer();
          data.set(keyOf(request), new Response(body, { headers: response.headers }));
        },
        async delete(request: RequestInfo | URL) {
          return data.delete(keyOf(request));
        },
        async keys() {
          // Só o URL (as chaves podem ser relativas, como "/index.html" no service worker).
          return [...data.keys()].map((url) => ({ url }) as Request);
        },
        async addAll(requests: RequestInfo[]) {
          for (const request of requests) data.set(keyOf(request), new Response('precache'));
        },
      } as unknown as Cache;
    },
    async delete(name: string) {
      return caches.delete(name);
    },
    async has(name: string) {
      return caches.has(name);
    },
    async keys() {
      return [...caches.keys()];
    },
    async match() {
      return undefined;
    },
  };
  return storage as unknown as CacheStorage & { failNextPut?: Error };
}
