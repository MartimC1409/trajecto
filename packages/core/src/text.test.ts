import { describe, expect, it } from 'vitest';
import { MAX_QUERY_LENGTH, comparisonKey, normalizeQuery } from './text';

describe('normalizeQuery', () => {
  it('remove espaços extra', () => {
    expect(normalizeQuery('  Rua   Augusta \n 10 ')).toBe('Rua Augusta 10');
  });

  it('normaliza Unicode para NFC', () => {
    const decomposed = 'Évora';
    expect(normalizeQuery(decomposed)).toBe('Évora');
  });

  it('limita o comprimento', () => {
    expect(normalizeQuery('a'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('comparisonKey', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(comparisonKey('Évora')).toBe(comparisonKey('evora'));
    expect(comparisonKey(' São João ')).toBe('sao joao');
  });
});
