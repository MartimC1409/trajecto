import { describe, expect, it } from 'vitest';
import { describeMapError } from './mapErrors';

describe('describeMapError', () => {
  it('indica a fonte e o tile que falharam', () => {
    expect(
      describeMapError({
        error: { message: 'Load failed' },
        sourceId: 'openmaptiles',
        tile: { tileID: { canonical: { z: 14, x: 7776, y: 6280 } } },
      }),
    ).toBe('openmaptiles 14/7776/6280: Load failed');
  });

  it('sem tile, só a fonte; sem nada, só a mensagem', () => {
    expect(describeMapError({ error: { message: 'x' }, sourceId: 'relief' })).toBe('relief: x');
    expect(describeMapError({ error: { message: 'Failed to fetch' } })).toBe('Failed to fetch');
  });
});
