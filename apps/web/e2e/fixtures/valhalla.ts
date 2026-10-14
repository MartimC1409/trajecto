/**
 * Resposta do Valhalla (/route) para os testes ponta a ponta, no formato documentado da API 3.9.
 * Gerada a partir de packages/core/src/testing/valhalla-fixtures.ts (percurso de ~1,2 km em Lisboa).
 */
export const ROUTE_RESPONSE = {
  trip: {
    locations: [
      {
        type: 'break',
        lat: 38.715,
        lon: -9.145,
        original_index: 0,
      },
      {
        type: 'break',
        lat: 38.722,
        lon: -9.14,
        original_index: 1,
      },
    ],
    legs: [
      {
        maneuvers: [
          {
            type: 1,
            instruction: 'Siga para norte na Avenida da Liberdade.',
            verbal_pre_transition_instruction: 'Siga para norte na Avenida da Liberdade.',
            verbal_post_transition_instruction: 'Continue durante 600 metros.',
            street_names: ['Avenida da Liberdade'],
            time: 60,
            length: 0.556,
            begin_shape_index: 0,
            end_shape_index: 2,
            cost: 70,
            travel_mode: 'drive',
            travel_type: 'car',
          },
          {
            type: 10,
            instruction: 'Vire à direita na Rua Alexandre Herculano.',
            verbal_transition_alert_instruction: 'Vire à direita na Rua Alexandre Herculano.',
            verbal_pre_transition_instruction: 'Vire à direita na Rua Alexandre Herculano.',
            verbal_post_transition_instruction: 'Continue durante 400 metros.',
            street_names: ['Rua Alexandre Herculano'],
            bearing_before: 0,
            bearing_after: 90,
            time: 50,
            length: 0.434,
            begin_shape_index: 2,
            end_shape_index: 4,
            toll: true,
            lanes: [
              {
                directions: 2,
              },
              {
                directions: 66,
                active: 64,
                valid: 64,
              },
            ],
            sign: {
              exit_number_elements: [
                {
                  text: '3',
                },
              ],
              exit_toward_elements: [
                {
                  text: 'Rato',
                },
                {
                  text: ' ',
                },
              ],
            },
          },
          {
            type: 15,
            instruction: 'Vire à esquerda na Rua Castilho.',
            verbal_transition_alert_instruction: 'Vire à esquerda na Rua Castilho.',
            verbal_pre_transition_instruction: 'Vire à esquerda na Rua Castilho.',
            verbal_post_transition_instruction: 'Continue durante 200 metros.',
            street_names: ['Rua Castilho'],
            time: 30,
            length: 0.222,
            begin_shape_index: 4,
            end_shape_index: 5,
          },
          {
            type: 4,
            instruction: 'Chegou ao seu destino.',
            verbal_transition_alert_instruction: 'Chegará ao seu destino.',
            verbal_pre_transition_instruction: 'Chegou ao seu destino.',
            time: 0,
            length: 0,
            begin_shape_index: 5,
            end_shape_index: 5,
          },
        ],
        summary: {
          time: 140,
          length: 1.212,
          has_toll: true,
          has_highway: false,
          has_ferry: false,
          min_lat: 38.715,
          min_lon: -9.145,
          max_lat: 38.722,
          max_lon: -9.14,
        },
        shape: 'of~yhAnidmPg{C?g{C??g{C?g{C_|B?',
      },
    ],
    summary: {
      time: 140,
      length: 1.212,
      has_toll: true,
      has_highway: false,
      has_ferry: false,
      min_lat: 38.715,
      min_lon: -9.145,
      max_lat: 38.722,
      max_lon: -9.14,
    },
    status_message: 'Found route between points',
    status: 0,
    units: 'kilometers',
    language: 'pt-PT',
  },
  alternates: [
    {
      trip: {
        locations: [
          {
            type: 'break',
            lat: 38.715,
            lon: -9.145,
            original_index: 0,
          },
          {
            type: 'break',
            lat: 38.722,
            lon: -9.14,
            original_index: 1,
          },
        ],
        legs: [
          {
            maneuvers: [
              {
                type: 1,
                instruction: 'Siga para norte na Avenida da Liberdade.',
                verbal_pre_transition_instruction: 'Siga para norte na Avenida da Liberdade.',
                verbal_post_transition_instruction: 'Continue durante 600 metros.',
                street_names: ['Avenida da Liberdade'],
                time: 60,
                length: 0.556,
                begin_shape_index: 0,
                end_shape_index: 2,
                cost: 70,
                travel_mode: 'drive',
                travel_type: 'car',
              },
              {
                type: 10,
                instruction: 'Vire à direita na Rua Alexandre Herculano.',
                verbal_transition_alert_instruction: 'Vire à direita na Rua Alexandre Herculano.',
                verbal_pre_transition_instruction: 'Vire à direita na Rua Alexandre Herculano.',
                verbal_post_transition_instruction: 'Continue durante 400 metros.',
                street_names: ['Rua Alexandre Herculano'],
                bearing_before: 0,
                bearing_after: 90,
                time: 50,
                length: 0.434,
                begin_shape_index: 2,
                end_shape_index: 4,
                toll: true,
                lanes: [
                  {
                    directions: 2,
                  },
                  {
                    directions: 66,
                    active: 64,
                    valid: 64,
                  },
                ],
                sign: {
                  exit_number_elements: [
                    {
                      text: '3',
                    },
                  ],
                  exit_toward_elements: [
                    {
                      text: 'Rato',
                    },
                    {
                      text: ' ',
                    },
                  ],
                },
              },
              {
                type: 15,
                instruction: 'Vire à esquerda na Rua Castilho.',
                verbal_transition_alert_instruction: 'Vire à esquerda na Rua Castilho.',
                verbal_pre_transition_instruction: 'Vire à esquerda na Rua Castilho.',
                verbal_post_transition_instruction: 'Continue durante 200 metros.',
                street_names: ['Rua Castilho'],
                time: 30,
                length: 0.222,
                begin_shape_index: 4,
                end_shape_index: 5,
              },
              {
                type: 4,
                instruction: 'Chegou ao seu destino.',
                verbal_transition_alert_instruction: 'Chegará ao seu destino.',
                verbal_pre_transition_instruction: 'Chegou ao seu destino.',
                time: 0,
                length: 0,
                begin_shape_index: 5,
                end_shape_index: 5,
              },
            ],
            summary: {
              time: 140,
              length: 1.212,
              has_toll: true,
              has_highway: false,
              has_ferry: false,
              min_lat: 38.715,
              min_lon: -9.145,
              max_lat: 38.722,
              max_lon: -9.14,
            },
            shape: 'of~yhAnidmPg{Cf{Cg{Cg{C?g{C?g{C_|B?',
          },
        ],
        summary: {
          time: 140,
          length: 1.212,
          has_toll: true,
          has_highway: false,
          has_ferry: false,
          min_lat: 38.715,
          min_lon: -9.145,
          max_lat: 38.722,
          max_lon: -9.14,
        },
        status_message: 'Found route between points',
        status: 0,
        units: 'kilometers',
        language: 'pt-PT',
      },
    },
  ],
};
