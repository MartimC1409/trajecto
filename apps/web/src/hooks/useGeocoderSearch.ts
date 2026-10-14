import type { Geocoder, GeocoderErrorCode, Place, SearchBias } from '@trajecto/core';
import { GeocoderError, MIN_QUERY_LENGTH, isAbortError, normalizeQuery } from '@trajecto/core';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

/** Espera depois de a pessoa parar de escrever, para não sobrecarregar o servidor público. */
export const SEARCH_DEBOUNCE_MS = 300;

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'too_short' }
  | { readonly status: 'loading'; readonly results: readonly Place[] }
  | { readonly status: 'success'; readonly results: readonly Place[] }
  | { readonly status: 'error'; readonly code: GeocoderErrorCode };

type Resolved =
  | { readonly query: string; readonly results: readonly Place[] }
  | { readonly query: string; readonly code: GeocoderErrorCode };

/**
 * Pesquisa com atraso (debounce) e cancelamento dos pedidos antigos.
 * Cada resposta fica associada ao texto que a pediu: uma resposta atrasada de um texto
 * antigo nunca substitui os resultados do texto atual.
 */
export function useGeocoderSearch(
  geocoder: Geocoder,
  query: string,
  getBias: () => SearchBias | undefined,
): SearchState {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // Lido só no momento do pedido: mexer no mapa não dispara novas pesquisas.
  const readBias = useEffectEvent(getBias);
  const normalized = normalizeQuery(query);

  useEffect(() => {
    if (normalized.length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const bias = readBias();
      geocoder
        .search(normalized, { signal: controller.signal, ...(bias ? { bias } : {}) })
        .then((results) => {
          if (!controller.signal.aborted) setResolved({ query: normalized, results });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          const code = error instanceof GeocoderError ? error.code : 'unavailable';
          setResolved({ query: normalized, code });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [geocoder, normalized]);

  return useMemo<SearchState>(() => {
    if (normalized.length === 0) return { status: 'idle' };
    if (normalized.length < MIN_QUERY_LENGTH) return { status: 'too_short' };
    if (resolved?.query === normalized) {
      return 'results' in resolved
        ? { status: 'success', results: resolved.results }
        : { status: 'error', code: resolved.code };
    }
    // Enquanto espera, mantém os resultados anteriores visíveis (evita a lista piscar).
    return {
      status: 'loading',
      results: resolved && 'results' in resolved ? resolved.results : [],
    };
  }, [normalized, resolved]);
}
