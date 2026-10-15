import { describe, expect, it } from 'vitest';
import { estimateFuelCost, roundSpokenDistance } from './cost';

describe('estimateFuelCost', () => {
  it('multiplica distância, consumo e preço', () => {
    // 300 km × 6 L/100 km × 1,80 €/L = 32,40 €
    expect(estimateFuelCost(300_000, { litresPer100Km: 6, pricePerLitre: 1.8 })).toBeCloseTo(32.4);
  });

  it('devolve 0 para valores inválidos', () => {
    expect(estimateFuelCost(-1, { litresPer100Km: 6, pricePerLitre: 1.8 })).toBe(0);
    expect(estimateFuelCost(1000, { litresPer100Km: Number.NaN, pricePerLitre: 1.8 })).toBe(0);
    expect(estimateFuelCost(1000, { litresPer100Km: 6, pricePerLitre: 0 })).toBe(0);
    expect(estimateFuelCost(Infinity, { litresPer100Km: 6, pricePerLitre: 1 })).toBe(0);
  });
});

describe('roundSpokenDistance', () => {
  it('arredonda para valores fáceis de dizer', () => {
    expect(roundSpokenDistance(0)).toBe(0);
    expect(roundSpokenDistance(Number.NaN)).toBe(0);
    expect(roundSpokenDistance(3)).toBe(10);
    expect(roundSpokenDistance(84)).toBe(80);
    expect(roundSpokenDistance(356)).toBe(350);
    expect(roundSpokenDistance(980)).toBe(1000);
    expect(roundSpokenDistance(1234)).toBe(1200);
  });
});
