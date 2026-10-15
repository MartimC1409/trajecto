/**
 * Respostas do Valhalla para testes, no formato documentado da API /route (versão 3.9).
 * As frases seguem o ficheiro de tradução pt-PT do próprio Valhalla.
 */
import type { LngLat } from '../geo';
import { encodePolyline } from '../polyline';

/** Percurso em Lisboa: norte ~556 m, este ~434 m, norte ~222 m. */
export const LISBON_POINTS: readonly LngLat[] = [
  { lng: -9.145, lat: 38.715 },
  { lng: -9.145, lat: 38.7175 },
  { lng: -9.145, lat: 38.72 },
  { lng: -9.1425, lat: 38.72 },
  { lng: -9.14, lat: 38.72 },
  { lng: -9.14, lat: 38.722 },
];

export function lisbonManeuvers(offset = 0) {
  return [
    {
      type: 1,
      instruction: 'Siga para norte na Avenida da Liberdade.',
      verbal_pre_transition_instruction: 'Siga para norte na Avenida da Liberdade.',
      verbal_post_transition_instruction: 'Continue durante 600 metros.',
      street_names: ['Avenida da Liberdade'],
      time: 60,
      length: 0.556,
      begin_shape_index: offset,
      end_shape_index: offset + 2,
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
      begin_shape_index: offset + 2,
      end_shape_index: offset + 4,
      toll: true,
      lanes: [{ directions: 2 }, { directions: 66, active: 64, valid: 64 }],
      sign: {
        exit_number_elements: [{ text: '3' }],
        exit_toward_elements: [{ text: 'Rato' }, { text: ' ' }],
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
      begin_shape_index: offset + 4,
      end_shape_index: offset + 5,
    },
    {
      type: 4,
      instruction: 'Chegou ao seu destino.',
      verbal_transition_alert_instruction: 'Chegará ao seu destino.',
      verbal_pre_transition_instruction: 'Chegou ao seu destino.',
      time: 0,
      length: 0,
      begin_shape_index: offset + 5,
      end_shape_index: offset + 5,
    },
  ];
}

const summary = (time: number, length: number) => ({
  time,
  length,
  has_toll: true,
  has_highway: false,
  has_ferry: false,
  min_lat: 38.715,
  min_lon: -9.145,
  max_lat: 38.722,
  max_lon: -9.14,
});

export function lisbonTrip(points: readonly LngLat[] = LISBON_POINTS) {
  return {
    locations: [
      { type: 'break', lat: 38.715, lon: -9.145, original_index: 0 },
      { type: 'break', lat: 38.722, lon: -9.14, original_index: 1 },
    ],
    legs: [
      {
        maneuvers: lisbonManeuvers(),
        summary: summary(140, 1.212),
        shape: encodePolyline(points),
      },
    ],
    summary: summary(140, 1.212),
    status_message: 'Found route between points',
    status: 0,
    units: 'kilometers',
    language: 'pt-PT',
  };
}

/** Viagem com uma paragem: duas etapas, a segunda começa onde a primeira acaba. */
export function twoLegTrip() {
  const first = LISBON_POINTS.slice(0, 3);
  const second = LISBON_POINTS.slice(2);
  const maneuvers = lisbonManeuvers();
  const firstLeg = [
    maneuvers[0],
    { ...maneuvers[3], instruction: 'Chegou à paragem.', begin_shape_index: 2, end_shape_index: 2 },
  ];
  const secondLeg = [
    {
      ...maneuvers[0],
      instruction: 'Siga para este na Rua Alexandre Herculano.',
      verbal_pre_transition_instruction: 'Siga para este na Rua Alexandre Herculano.',
      begin_shape_index: 0,
      end_shape_index: 2,
      time: 50,
      length: 0.434,
    },
    { ...maneuvers[2], begin_shape_index: 2, end_shape_index: 3 },
    { ...maneuvers[3], begin_shape_index: 3, end_shape_index: 3 },
  ];
  return {
    legs: [
      { maneuvers: firstLeg, summary: summary(60, 0.556), shape: encodePolyline(first) },
      { maneuvers: secondLeg, summary: summary(80, 0.656), shape: encodePolyline(second) },
    ],
    summary: summary(140, 1.212),
    units: 'kilometers',
  };
}

export function valhallaResponse(alternates = 0) {
  const alternate = lisbonTrip([
    { lng: -9.145, lat: 38.715 },
    { lng: -9.1475, lat: 38.7175 },
    { lng: -9.145, lat: 38.72 },
    { lng: -9.1425, lat: 38.72 },
    { lng: -9.14, lat: 38.72 },
    { lng: -9.14, lat: 38.722 },
  ]);
  return {
    trip: lisbonTrip(),
    ...(alternates > 0
      ? { alternates: Array.from({ length: alternates }, () => ({ trip: alternate })) }
      : {}),
  };
}
