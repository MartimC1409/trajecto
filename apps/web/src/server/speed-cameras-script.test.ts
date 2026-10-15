// @vitest-environment node
import { parseSpeedCameras } from '@trajecto/core';
import { describe, expect, it } from 'vitest';
import {
  OVERPASS_QUERY,
  buildDataset,
  camerasFromOverpass,
  parseDirection,
  parseMaxspeed,
} from '../../scripts/speed-cameras-lib.mjs';

describe('extração de radares do OpenStreetMap', () => {
  it('usa uma só consulta para Portugal com nós e relações de fiscalização', () => {
    expect(OVERPASS_QUERY).toContain('area["ISO3166-1"="PT"][admin_level=2]');
    expect(OVERPASS_QUERY).toContain('node["highway"="speed_camera"](area.pt)');
    expect(OVERPASS_QUERY).toContain('"enforcement"~"^(maxspeed|average_speed)$"');
  });

  it('lê limites e direções', () => {
    expect(parseMaxspeed('50')).toBe(50);
    expect(parseMaxspeed(' 120 ')).toBe(120);
    expect(parseMaxspeed('50 mph')).toBeUndefined();
    expect(parseMaxspeed('0')).toBeUndefined();
    expect(parseMaxspeed(undefined)).toBeUndefined();
    expect(parseDirection('90')).toBe(90);
    expect(parseDirection('360')).toBe(0);
    expect(parseDirection('ne')).toBe(45);
    expect(parseDirection('SSW')).toBe(202.5);
    expect(parseDirection('forward')).toBeUndefined();
    expect(parseDirection('400')).toBeUndefined();
    expect(parseDirection(7)).toBeUndefined();
  });

  it('converte nós e relações sem repetir radares', () => {
    const cameras = camerasFromOverpass({
      elements: [
        {
          type: 'node',
          id: 2,
          lat: 38.7123456789,
          lon: -9.1,
          tags: { highway: 'speed_camera', maxspeed: '50', direction: 'N' },
        },
        { type: 'node', id: 3, lat: 39, lon: -8 },
        { type: 'node', id: 4, lat: 40, lon: -8.5, tags: { highway: 'speed_camera' } },
        {
          type: 'relation',
          id: 10,
          tags: { type: 'enforcement', enforcement: 'average_speed', maxspeed: '90' },
          members: [{ type: 'node', ref: 3, role: 'device' }],
        },
        {
          type: 'relation',
          id: 11,
          tags: { type: 'enforcement', enforcement: 'maxspeed' },
          members: [{ type: 'node', ref: 4, role: 'device' }],
        },
        {
          type: 'relation',
          id: 12,
          tags: { type: 'enforcement' },
          members: [{ type: 'node', ref: 99, role: 'device' }],
        },
        { type: 'node', id: 5, tags: { highway: 'speed_camera' } },
      ],
    });
    expect(cameras).toEqual([
      { id: 'n2', lat: 38.712346, lon: -9.1, maxspeed: 50, direction: 0 },
      { id: 'n4', lat: 40, lon: -8.5 },
      { id: 'r10', lat: 39, lon: -8, maxspeed: 90, average: true },
    ]);
    expect(camerasFromOverpass(null)).toEqual([]);
  });

  it('gera um ficheiro com a licença ODbL que a app sabe ler', () => {
    const dataset = buildDataset([{ id: 'n2', lat: 38.7, lon: -9.1 }], '2026-10-15T00:00:00.000Z');
    expect(dataset).toMatchObject({
      attribution: '© OpenStreetMap contributors',
      license: 'ODbL-1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    });
    expect(parseSpeedCameras(dataset)).toEqual([{ id: 'n2', lat: 38.7, lon: -9.1 }]);
  });
});
