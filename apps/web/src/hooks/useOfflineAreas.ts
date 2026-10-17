import type { BBox, OfflineArea, OfflineAreaCheck } from '@trajecto/core';
import { OFFLINE_LIMITS, checkOfflineArea, tilesOnlyIn } from '@trajecto/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadProgress, DownloadStatus } from '../offline/download';
import { downloadArea } from '../offline/download';
import type { StorageInfo } from '../offline/tileStore';
import { requestPersistentStorage, storageInfo } from '../offline/tileStore';
import type { Services } from '../services';
import { useStore } from './useStore';

/** Gravar o progresso no armazenamento a cada N tiles (e não a cada tile). */
const SAVE_EVERY = 25;

export interface ActiveDownload {
  readonly areaId: string;
  readonly progress: DownloadProgress;
}

export type OfflineMessage =
  { readonly kind: DownloadStatus; readonly name: string } | { readonly kind: 'limit_reached' };

export interface OfflineAreasApi {
  readonly supported: boolean;
  readonly areas: readonly OfflineArea[];
  readonly active: ActiveDownload | null;
  readonly message: OfflineMessage | null;
  readonly storage: StorageInfo | null;
  check(bbox: BBox): OfflineAreaCheck;
  download(bbox: BBox, name: string): Promise<void>;
  resume(area: OfflineArea): Promise<void>;
  cancel(): void;
  remove(area: OfflineArea): Promise<void>;
}

type OfflineServices = Pick<Services, 'offlineAreas' | 'offlineTiles' | 'mapResources'>;

export function useOfflineAreas(
  services: OfflineServices,
  options: { fetch?: typeof fetch; storageManager?: StorageManager } = {},
): OfflineAreasApi {
  const { offlineAreas, offlineTiles, mapResources } = services;
  const state = useStore(offlineAreas);
  const [active, setActive] = useState<ActiveDownload | null>(null);
  const [message, setMessage] = useState<OfflineMessage | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const manager =
    options.storageManager ?? (typeof navigator === 'undefined' ? undefined : navigator.storage);

  const refreshStorage = useCallback(() => {
    void storageInfo(manager).then(setStorage);
  }, [manager]);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);

  // Ao sair (fechar a app), a transferência em curso é cancelada; o que já foi guardado fica.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(
    async (area: OfflineArea) => {
      if (!offlineTiles || controllerRef.current) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      setMessage(null);
      setActive({ areaId: area.id, progress: { done: 0, total: 0, bytes: 0 } });
      // O browser não apaga estes dados sozinho (se o permitir).
      void requestPersistentStorage(manager);
      let saved = 0;
      const result = await downloadArea({
        area,
        store: offlineTiles,
        signal: controller.signal,
        // Uma transferência (incluindo a continuação de uma parcial) nunca passa dos 50 MB.
        maxBytes: Math.max(0, OFFLINE_LIMITS.maxBytes - area.bytes),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        onProgress: (progress) => {
          setActive({ areaId: area.id, progress });
          if (progress.done - saved >= SAVE_EVERY) {
            saved = progress.done;
            offlineAreas.update(area.id, {
              tiles: progress.done,
              bytes: area.bytes + progress.bytes,
            });
          }
        },
      });
      offlineAreas.update(area.id, {
        tiles: result.done,
        bytes: area.bytes + result.bytes,
        complete: result.status === 'complete',
      });
      if (result.status === 'complete') await mapResources.prefetchGlyphs(controller.signal);
      controllerRef.current = null;
      setActive(null);
      setMessage({ kind: result.status, name: area.name });
      refreshStorage();
    },
    [offlineTiles, offlineAreas, mapResources, manager, options.fetch, refreshStorage],
  );

  const download = useCallback(
    async (bbox: BBox, name: string) => {
      const check = checkOfflineArea(bbox);
      if (!check.ok || controllerRef.current) return;
      const area = offlineAreas.add({ name, bbox: check.bbox, version: mapResources.version() });
      if (!area) {
        setMessage({ kind: 'limit_reached' });
        return;
      }
      await run(area);
    },
    [offlineAreas, mapResources, run],
  );

  const remove = useCallback(
    async (area: OfflineArea) => {
      if (active?.areaId === area.id) controllerRef.current?.abort();
      const others = offlineAreas.getSnapshot().areas.filter((a) => a.id !== area.id);
      // Primeiro sai da lista (o mapa deixa de procurar estes tiles), depois apagam-se os tiles
      // que nenhuma outra zona usa.
      offlineAreas.remove(area.id);
      await offlineTiles?.delete(tilesOnlyIn(area, others));
      setMessage(null);
      refreshStorage();
    },
    [active, offlineAreas, offlineTiles, refreshStorage],
  );

  return {
    supported: offlineTiles !== null,
    areas: state.areas,
    active,
    message,
    storage,
    check: checkOfflineArea,
    download,
    resume: run,
    cancel: () => controllerRef.current?.abort(),
    remove,
  };
}
