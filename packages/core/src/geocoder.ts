import type { LngLat } from './geo';
import type { Place } from './place';

/** Ponto de foco para ordenar resultados perto do que o utilizador está a ver. */
export interface SearchBias {
  readonly lngLat: LngLat;
  readonly zoom: number;
}

export interface SearchOptions {
  readonly signal?: AbortSignal;
  readonly bias?: SearchBias;
  readonly limit?: number;
}

export interface ReverseOptions {
  readonly signal?: AbortSignal;
}

/** Contrato comum a qualquer serviço de geocodificação (Photon público, Photon próprio…). */
export interface Geocoder {
  search(query: string, options?: SearchOptions): Promise<Place[]>;
  reverse(lngLat: LngLat, options?: ReverseOptions): Promise<Place | null>;
}

export type GeocoderErrorCode = 'rate_limited' | 'unavailable' | 'bad_response' | 'network';

export class GeocoderError extends Error {
  readonly code: GeocoderErrorCode;
  readonly status: number | undefined;

  constructor(code: GeocoderErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GeocoderError';
    this.code = code;
    this.status = status;
  }
}

/** Verdadeiro quando o erro resulta de um pedido cancelado (não deve ser mostrado). */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
