/** Definições para estimar o custo de combustível de uma viagem. */
export interface FuelCostSettings {
  /** Consumo médio em litros por 100 km. */
  readonly litresPer100Km: number;
  /** Preço por litro, em euros. */
  readonly pricePerLitre: number;
}

/**
 * Custo estimado do combustível, em euros. É uma estimativa simples (distância × consumo ×
 * preço): não inclui portagens, estacionamento, trânsito nem diferenças de consumo em subida.
 */
export function estimateFuelCost(distanceMeters: number, settings: FuelCostSettings): number {
  const { litresPer100Km, pricePerLitre } = settings;
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(litresPer100Km) ||
    !Number.isFinite(pricePerLitre) ||
    distanceMeters <= 0 ||
    litresPer100Km <= 0 ||
    pricePerLitre <= 0
  ) {
    return 0;
  }
  return (distanceMeters / 100_000) * litresPer100Km * pricePerLitre;
}

/**
 * Arredonda uma distância para ser dita em voz alta ou mostrada num aviso:
 * até 100 m de 10 em 10 m, até 1 km de 50 em 50 m, depois de 100 em 100 m.
 */
export function roundSpokenDistance(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  if (meters < 100) return Math.max(10, Math.round(meters / 10) * 10);
  if (meters < 1000) return Math.round(meters / 50) * 50;
  return Math.round(meters / 100) * 100;
}
