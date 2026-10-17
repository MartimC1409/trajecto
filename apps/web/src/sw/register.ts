/**
 * Regista o service worker (só na versão de produção: em desenvolvimento atrapalharia o
 * recarregamento automático do Vite). Espera pelo fim do carregamento da página, para não
 * competir com o mapa pela rede.
 */
export function registerServiceWorker(
  options: {
    readonly enabled?: boolean;
    readonly container?: ServiceWorkerContainer;
    readonly target?: Pick<Window, 'addEventListener'>;
    readonly url?: string;
  } = {},
): void {
  const enabled = options.enabled ?? import.meta.env.PROD;
  const container =
    options.container ?? (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker);
  if (!enabled || !container) return;
  (options.target ?? window).addEventListener('load', () => {
    container.register(options.url ?? '/sw.js').catch((error: unknown) => {
      console.warn('[app] Não foi possível ativar o modo sem rede:', error);
    });
  });
}
