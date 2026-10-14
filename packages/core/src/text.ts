/** Comprimento máximo aceite numa pesquisa (proteção contra abuso e erros). */
export const MAX_QUERY_LENGTH = 200;

/** Normaliza o texto pesquisado: Unicode NFC, espaços colapsados, limite de tamanho. */
export function normalizeQuery(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

/** Chave de comparação insensível a maiúsculas e acentos ("Évora" === "evora"). */
export function comparisonKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-PT')
    .trim();
}
