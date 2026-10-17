/**
 * Service worker do Trajecto: a app abre sem rede (Fase 7, ADR 0016).
 *
 * - Na instalação guarda os ficheiros da app (página, código, estilos, ícones, radares).
 * - Página: pede-a à rede (para receber atualizações); sem rede ou ao fim de 4 s, a cópia guardada.
 * - Código, estilos e ícones: da cópia guardada (os nomes mudam a cada versão).
 * - Funções (/api), pesquisa (/geocoder) e outros sites: sempre à rede, sem passar por aqui.
 * - Os mapas offline estão noutra Cache Storage, gerida pela app; este ficheiro não lhes mexe.
 *
 * A lista de ficheiros e a versão são escritas na build (vite-sw-plugin.ts). JavaScript simples,
 * sem módulos, para funcionar em todos os browsers.
 */

const VERSION = self.__TRAJECTO_VERSION__ ?? 'dev';
/** @type {string[]} */
const PRECACHE = self.__TRAJECTO_PRECACHE__ ?? [];
const APP_CACHE_PREFIX = 'trajecto-app-';
const APP_CACHE = APP_CACHE_PREFIX + VERSION;
const NAVIGATION_TIMEOUT_MS = 4000;
const NETWORK_ONLY = ['/api/', '/geocoder/', '/__offline/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(APP_CACHE_PREFIX) && name !== APP_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.some((prefix) => url.pathname.startsWith(prefix))) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith(fromCache(request, url.pathname));
});

/** Rede primeiro (com tempo máximo); sem rede, a página guardada. */
async function page(request) {
  try {
    return await Promise.race([
      fetch(request),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const cached = await (await caches.open(APP_CACHE)).match('/index.html');
    if (cached) return cached;
    throw error;
  }
}

/** Cópia guardada; se faltar (por exemplo, a instalação falhou), a rede. */
async function fromCache(request, path) {
  const cached = await (await caches.open(APP_CACHE)).match(path);
  return cached ?? fetch(request);
}
