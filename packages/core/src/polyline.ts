import type { LngLat } from './geo';

/**
 * Descodifica uma "encoded polyline" (algoritmo da Google) com a precisão indicada.
 * O Valhalla usa 6 casas decimais e a ordem latitude, longitude.
 */
export function decodePolyline(encoded: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  function next(): number | null {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (shift > 35) return null; // proteção contra dados malformados
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) {
      throw new Error('Geometria da rota inválida.');
    }
    lat += dLat;
    lng += dLng;
    points.push({ lng: lng / factor, lat: lat / factor });
  }
  return points;
}

/** Codifica pontos numa "encoded polyline" (útil para testes e simulação). */
export function encodePolyline(points: readonly LngLat[], precision = 6): string {
  const factor = 10 ** precision;
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  function encodeValue(value: number): void {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    output += String.fromCharCode(v + 63);
  }

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    encodeValue(lat - prevLat);
    encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}
