import { describe, expect, it } from 'vitest';
import type { Place } from './place';
import { coordinatePlace, formatPlace, placeSchema } from './place';

const base: Omit<Place, 'address'> = {
  id: 'osm:N1',
  kind: 'other',
  lngLat: { lng: -9.1, lat: 38.7 },
};

describe('formatPlace', () => {
  it('ponto de interesse com morada completa', () => {
    const place: Place = {
      ...base,
      name: 'Museu Nacional',
      address: {
        street: 'Rua Augusta',
        housenumber: '24',
        postcode: '1100-053',
        locality: 'Lisboa',
        county: 'Lisboa',
        state: 'Lisboa',
        country: 'Portugal',
        countryCode: 'PT',
      },
    };
    expect(formatPlace(place)).toEqual({
      title: 'Museu Nacional',
      subtitle: 'Rua Augusta, 24, 1100-053 Lisboa',
    });
  });

  it('morada sem nome usa a rua como título', () => {
    const place: Place = {
      ...base,
      kind: 'house',
      address: {
        street: 'Avenida da Boavista',
        housenumber: '100',
        postcode: '4100-111',
        locality: 'Porto',
      },
    };
    expect(formatPlace(place)).toEqual({
      title: 'Avenida da Boavista, 100',
      subtitle: '4100-111 Porto',
    });
  });

  it('cidade não repete o nome na morada e mostra a região', () => {
    const place: Place = {
      ...base,
      kind: 'city',
      name: 'Porto',
      address: { county: 'Porto', state: 'Norte', country: 'Portugal', countryCode: 'pt' },
    };
    expect(formatPlace(place)).toEqual({ title: 'Porto', subtitle: 'Norte' });
  });

  it('mostra o país quando não é Portugal', () => {
    const place: Place = {
      ...base,
      kind: 'city',
      name: 'Badajoz',
      address: { state: 'Extremadura', country: 'Espanha', countryCode: 'ES' },
    };
    expect(formatPlace(place).subtitle).toBe('Extremadura, Espanha');
  });

  it('localidade sem código postal e sem repetir o título', () => {
    const place: Place = {
      ...base,
      kind: 'street',
      name: 'Rua Direita',
      address: { street: 'Rua Direita', locality: 'Viseu', county: 'Viseu' },
    };
    expect(formatPlace(place)).toEqual({ title: 'Rua Direita', subtitle: 'Viseu' });
  });

  it('usa o distrito quando não há localidade', () => {
    const place: Place = {
      ...base,
      name: 'Café',
      address: { postcode: '1000-001', district: 'Arroios' },
    };
    expect(formatPlace(place).subtitle).toBe('1000-001 Arroios');
  });

  it('só número de porta', () => {
    const place: Place = { ...base, kind: 'house', address: { housenumber: '7' } };
    expect(formatPlace(place)).toEqual({ title: '7', subtitle: '' });
  });

  it('sem dados devolve título nulo', () => {
    expect(formatPlace(coordinatePlace({ lng: -9.1, lat: 38.7 }))).toEqual({
      title: null,
      subtitle: '',
    });
  });

  it('não repete a localidade quando é igual ao título', () => {
    const place: Place = {
      ...base,
      kind: 'city',
      name: 'Lisboa',
      address: { locality: 'Lisboa', state: 'Lisboa' },
    };
    expect(formatPlace(place)).toEqual({ title: 'Lisboa', subtitle: '' });
  });
});

describe('coordinatePlace', () => {
  it('arredonda a ~1 m e cria um id estável', () => {
    const place = coordinatePlace({ lng: -9.139312345, lat: 38.722345678 });
    expect(place).toEqual({
      id: 'coord:38.72235,-9.13931',
      kind: 'coordinate',
      lngLat: { lng: -9.13931, lat: 38.72235 },
      address: {},
    });
    expect(placeSchema.safeParse(place).success).toBe(true);
  });
});

describe('placeSchema', () => {
  it('rejeita coordenadas inválidas', () => {
    const result = placeSchema.safeParse({
      id: 'x',
      kind: 'other',
      lngLat: { lng: 200, lat: 0 },
      address: {},
    });
    expect(result.success).toBe(false);
  });
});
