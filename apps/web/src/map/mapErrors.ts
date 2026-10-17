/** O que o MapLibre junta a um erro de um tile (a fonte e as coordenadas do tile). */
interface MapErrorEvent {
  readonly error: { readonly message: string };
  readonly sourceId?: string;
  readonly tile?: {
    readonly tileID?: { readonly canonical?: { z: number; x: number; y: number } };
  };
}

/**
 * Texto do aviso de um erro do mapa, com a fonte e o tile quando os há (por exemplo
 * "openmaptiles 14/7776/6280: Load failed"): no Safari a mensagem não diz que pedido falhou.
 */
export function describeMapError(event: MapErrorEvent): string {
  const tile = event.tile?.tileID?.canonical;
  const where = [
    event.sourceId,
    tile ? `${String(tile.z)}/${String(tile.x)}/${String(tile.y)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return where ? `${where}: ${event.error.message}` : event.error.message;
}
