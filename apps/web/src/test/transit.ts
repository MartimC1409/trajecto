import type { LngLat, TransitItinerary, TransitLeg } from '@trajecto/core';

const ROSSIO: LngLat = { lng: -9.1395, lat: 38.7142 };
const ALVALADE: LngLat = { lng: -9.1442, lat: 38.7533 };
const AREEIRO: LngLat = { lng: -9.1335, lat: 38.7425 };
const MIN = 60_000;

function leg(overrides: Partial<TransitLeg> & Pick<TransitLeg, 'kind'>): TransitLeg {
  const start = overrides.start ?? Date.UTC(2026, 9, 16, 8, 0);
  const end = overrides.end ?? start + 2 * MIN;
  return {
    mode: overrides.kind.toUpperCase(),
    from: { name: 'Partida', lngLat: { lng: -9.1404, lat: 38.7139 } },
    to: { name: 'Rossio', lngLat: ROSSIO },
    start,
    end,
    scheduledStart: start,
    scheduledEnd: end,
    realTime: false,
    cancelled: false,
    duration: (end - start) / 1000,
    stops: 0,
    geometry: [
      overrides.from?.lngLat ?? { lng: -9.1404, lat: 38.7139 },
      overrides.to?.lngLat ?? ROSSIO,
    ],
    ...overrides,
  };
}

function itinerary(legs: TransitLeg[], transfers: number): TransitItinerary {
  const points = legs.flatMap((l) => l.geometry);
  return {
    start: legs[0]?.start ?? 0,
    end: legs.at(-1)?.end ?? 0,
    duration: ((legs.at(-1)?.end ?? 0) - (legs[0]?.start ?? 0)) / 1000,
    transfers,
    legs,
    walkDistance: legs.reduce((sum, l) => sum + (l.kind === 'walk' ? (l.distance ?? 0) : 0), 0),
    bbox: [
      Math.min(...points.map((p) => p.lng)),
      Math.min(...points.map((p) => p.lat)),
      Math.max(...points.map((p) => p.lng)),
      Math.max(...points.map((p) => p.lat)),
    ],
  };
}

const T0 = Date.UTC(2026, 9, 16, 8, 0);

/**
 * Três ligações de exemplo em Lisboa:
 * 1. metro com atraso em tempo real (Linha Verde, cores do operador);
 * 2. autocarro só com horário, com cores de pouco contraste (o texto passa a preto);
 * 3. metro com um transbordo, o segundo troço cancelado.
 */
export const TRANSIT_ITINERARIES: TransitItinerary[] = [
  itinerary(
    [
      leg({ kind: 'walk', start: T0, end: T0 + 3 * MIN, distance: 210 }),
      leg({
        kind: 'subway',
        mode: 'SUBWAY',
        from: { name: 'Rossio', lngLat: ROSSIO, track: '1' },
        to: { name: 'Alvalade', lngLat: ALVALADE },
        start: T0 + 6 * MIN,
        end: T0 + 22 * MIN,
        scheduledStart: T0 + 4 * MIN,
        scheduledEnd: T0 + 20 * MIN,
        realTime: true,
        line: 'Vd',
        lineName: 'Linha Verde',
        headsign: 'Telheiras',
        agency: 'Metropolitano de Lisboa',
        color: '#00a651',
        textColor: '#ffffff',
        stops: 6,
      }),
      leg({
        kind: 'walk',
        from: { name: 'Alvalade', lngLat: ALVALADE },
        to: { name: 'END', lngLat: { lng: -9.145, lat: 38.754 } },
        start: T0 + 22 * MIN,
        end: T0 + 25 * MIN,
        distance: 150,
      }),
    ],
    0,
  ),
  itinerary(
    [
      leg({ kind: 'walk', start: T0, end: T0 + 30_000, distance: 40 }),
      leg({
        kind: 'bus',
        mode: 'BUS',
        from: { name: 'Rossio', lngLat: ROSSIO },
        to: { name: 'Av. Roma', lngLat: ALVALADE },
        start: T0 + 5 * MIN,
        end: T0 + 30 * MIN,
        line: '783',
        headsign: 'Portela',
        agency: 'Carris',
        color: '#ffcc00',
        textColor: '#ffffff',
        stops: 12,
      }),
    ],
    0,
  ),
  itinerary(
    [
      leg({
        kind: 'subway',
        from: { name: 'Rossio', lngLat: ROSSIO },
        to: { name: 'Areeiro', lngLat: AREEIRO },
        start: T0 + 2 * MIN,
        end: T0 + 12 * MIN,
        line: 'Az',
        realTime: true,
      }),
      leg({
        kind: 'subway',
        from: { name: 'Areeiro', lngLat: AREEIRO },
        to: { name: 'Alvalade', lngLat: ALVALADE },
        start: T0 + 15 * MIN,
        end: T0 + 20 * MIN,
        line: 'Vd',
        realTime: true,
        cancelled: true,
      }),
    ],
    1,
  ),
];
