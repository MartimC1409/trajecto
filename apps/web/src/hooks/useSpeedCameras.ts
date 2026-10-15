import type { SpeedCamera } from '@trajecto/core';
import { parseSpeedCameras } from '@trajecto/core';
import { useEffect, useState } from 'react';

/**
 * Radares fixos (ficheiro estático da própria app, gerado a partir do OpenStreetMap).
 * Só é descarregado quando os avisos estão ligados; se falhar, não há avisos de radares.
 */
export function useSpeedCameras(url: string, enabled: boolean): readonly SpeedCamera[] {
  const [cameras, setCameras] = useState<readonly SpeedCamera[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!controller.signal.aborted) setCameras(parseSpeedCameras(body));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [url, enabled]);
  return enabled ? cameras : [];
}
