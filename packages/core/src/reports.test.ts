import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './persistent-store';
import {
  MAX_REPORTS,
  REPORTS_STORAGE_KEY,
  REPORT_LIFETIME_MINUTES,
  activeReports,
  createReportsStore,
} from './reports';

const MINUTE = 60_000;
const LISBOA = { lng: -9.1393123, lat: 38.7223456 };

function setup(start = 1_000_000) {
  let time = start;
  let n = 0;
  const storage = createMemoryStorage();
  const store = createReportsStore({ storage, now: () => time, createId: () => `r${++n}` });
  return { store, storage, advance: (ms: number) => (time += ms), now: () => time };
}

describe('createReportsStore', () => {
  it('cria reportes com expiração por tipo e coordenadas arredondadas', () => {
    const { store, storage } = setup();
    const police = store.add('police', LISBOA, 370.4);
    expect(police).toEqual({
      id: 'r1',
      type: 'police',
      lngLat: { lng: -9.13931, lat: 38.72235 },
      bearing: 10,
      createdAt: 1_000_000,
      expiresAt: 1_000_000 + 60 * MINUTE,
      confirmations: 0,
    });
    const works = store.add('roadworks', LISBOA);
    expect(works).not.toHaveProperty('bearing');
    expect(works?.expiresAt).toBe(1_000_000 + REPORT_LIFETIME_MINUTES.roadworks * MINUTE);
    expect(store.getSnapshot().reports.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(store.add('hazard', { lng: 500, lat: 0 })).toBeNull();
    // Fica guardado e é lido de novo.
    expect(JSON.parse(storage.getItem(REPORTS_STORAGE_KEY) ?? '{}').reports).toHaveLength(2);
    expect(createReportsStore({ storage }).getSnapshot().reports).toHaveLength(2);
  });

  it('confirma, remove e apaga os expirados', () => {
    const { store, advance, now } = setup();
    store.add('police', LISBOA);
    store.add('accident', LISBOA);
    advance(50 * MINUTE);
    store.confirm('r1');
    store.confirm('nao-existe');
    expect(store.getSnapshot().reports.find((r) => r.id === 'r1')).toMatchObject({
      confirmations: 1,
      expiresAt: now() + 60 * MINUTE,
    });
    advance(100 * MINUTE);
    expect(activeReports(store.getSnapshot().reports, now()).map((r) => r.id)).toEqual([]);
    store.purgeExpired();
    expect(store.getSnapshot().reports).toEqual([]);
    store.purgeExpired();
    store.add('jam', LISBOA);
    store.remove('r3');
    store.remove('r3');
    expect(store.getSnapshot().reports).toEqual([]);
    store.add('jam', LISBOA);
    store.clear();
    expect(store.getSnapshot().reports).toEqual([]);
  });

  it('esconde a polícia quando está desligada e limita o número de reportes', () => {
    const { store, now } = setup();
    store.add('police', LISBOA);
    store.add('hazard', LISBOA);
    expect(
      activeReports(store.getSnapshot().reports, now(), { police: false }).map((r) => r.type),
    ).toEqual(['hazard']);
    for (let i = 0; i < MAX_REPORTS + 5; i++) store.add('hazard', LISBOA);
    expect(store.getSnapshot().reports).toHaveLength(MAX_REPORTS);
  });

  it('ignora dados guardados inválidos', () => {
    const storage = createMemoryStorage({
      [REPORTS_STORAGE_KEY]: JSON.stringify({ version: 1, reports: [{ id: 'x', type: 'ufo' }] }),
    });
    expect(createReportsStore({ storage }).getSnapshot().reports).toEqual([]);
  });
});
