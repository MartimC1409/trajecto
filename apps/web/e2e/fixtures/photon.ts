/** Respostas de exemplo no formato do Photon, para os testes não dependerem da internet. */
export const SEARCH_RESPONSE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-9.1376, 38.7105] },
      properties: {
        osm_type: 'W',
        osm_id: 4252170,
        osm_key: 'highway',
        osm_value: 'pedestrian',
        type: 'street',
        name: 'Rua Augusta',
        postcode: '1100-053',
        city: 'Lisboa',
        county: 'Lisboa',
        state: 'Lisboa',
        country: 'Portugal',
        countrycode: 'PT',
        extent: [-9.1385, 38.7125, -9.1365, 38.7085],
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-9.1335, 38.7099] },
      properties: {
        osm_type: 'W',
        osm_id: 30310128,
        osm_key: 'amenity',
        osm_value: 'place_of_worship',
        type: 'house',
        name: 'Sé de Lisboa',
        street: 'Largo da Sé',
        city: 'Lisboa',
        country: 'Portugal',
        countrycode: 'PT',
      },
    },
  ],
};

export const REVERSE_RESPONSE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-9.1335, 38.7099] },
      properties: {
        osm_type: 'N',
        osm_id: 123,
        type: 'house',
        name: 'Café da Sé',
        street: 'Largo da Sé',
        housenumber: '2',
        postcode: '1100-585',
        city: 'Lisboa',
        country: 'Portugal',
        countrycode: 'PT',
      },
    },
  ],
};
