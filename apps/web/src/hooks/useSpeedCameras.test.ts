import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeedCameras } from './useSpeedCameras';

const DATASET = {
  license: 'ODbL-1.0',
  generatedAt: '2026-10-15T00:00:00.000Z',
  cameras: [{ id: 'n1', lat: 38.7, lon: -9.1, maxspeed: 50 }],
};

describe('useSpeedCameras', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('descarrega os radares só quando os avisos estão ligados', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DATASET)));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ on }) => useSpeedCameras('/c', on), {
      initialProps: { on: false },
    });
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current).toHaveLength(1));
    rerender({ on: false });
    expect(result.current).toEqual([]);
  });

  it('fica sem radares se o ficheiro falhar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 404 }))
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const first = renderHook(() => useSpeedCameras('/c', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(first.result.current).toEqual([]);
    const second = renderHook(() => useSpeedCameras('/c', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(second.result.current).toEqual([]);
  });
});
