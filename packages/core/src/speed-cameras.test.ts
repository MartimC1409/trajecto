import { describe, expect, it } from 'vitest';
import { parseSpeedCameras, speedCameraAlerts } from './speed-cameras';

const DATASET = {
  license: 'ODbL-1.0',
  generatedAt: '2026-10-15T00:00:00.000Z',
  cameras: [
    { id: 'n1', lat: 38.7, lon: -9.1, maxspeed: 50, direction: 90 },
    { id: 'r2', lat: 39.1, lon: -8.6, maxspeed: 'x', average: true },
    { id: 'bad', lat: 999, lon: 0 },
    'texto',
  ],
};

describe('speed cameras', () => {
  it('lê o ficheiro e ignora entradas inválidas', () => {
    expect(parseSpeedCameras(DATASET)).toEqual([
      { id: 'n1', lat: 38.7, lon: -9.1, maxspeed: 50, direction: 90 },
      { id: 'r2', lat: 39.1, lon: -8.6, average: true },
    ]);
    expect(parseSpeedCameras({ ...DATASET, license: 'CC0' })).toEqual([]);
    expect(parseSpeedCameras(null)).toEqual([]);
  });

  it('converte em avisos de rota com direção e limite', () => {
    expect(speedCameraAlerts(parseSpeedCameras(DATASET))).toEqual([
      {
        id: 'camera:n1',
        kind: 'speed_camera',
        lngLat: { lng: -9.1, lat: 38.7 },
        bearing: 90,
        detail: 50,
      },
      { id: 'camera:r2', kind: 'average_speed_camera', lngLat: { lng: -8.6, lat: 39.1 } },
    ]);
  });
});
