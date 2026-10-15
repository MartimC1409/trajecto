// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { AlertSource } from './route-alerts';

/** Radar fixo, tal como vem no ficheiro gerado a partir do OpenStreetMap. */
export interface SpeedCamera {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  /** Limite de velocidade fiscalizado (km/h), quando está no mapa. */
  readonly maxspeed?: number;
  /** Direção fiscalizada (graus), quando está no mapa. */
  readonly direction?: number;
  /** Radar de velocidade média (troço). */
  readonly average?: boolean;
}

const cameraSchema = z.object({
  id: z.string().min(1).max(40),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  maxspeed: z.number().int().min(1).max(200).optional().catch(undefined),
  direction: z.number().min(0).max(360).optional().catch(undefined),
  average: z.boolean().optional().catch(undefined),
});

const datasetSchema = z.object({
  license: z.literal('ODbL-1.0'),
  generatedAt: z.string().max(40),
  cameras: z.array(z.unknown()).max(20_000),
});

/** Lê o ficheiro de radares; ignora entradas inválidas. Devolve `[]` se o ficheiro for inválido. */
export function parseSpeedCameras(body: unknown): SpeedCamera[] {
  const parsed = datasetSchema.safeParse(body);
  if (!parsed.success) return [];
  const cameras: SpeedCamera[] = [];
  for (const raw of parsed.data.cameras) {
    const camera = cameraSchema.safeParse(raw);
    if (camera.success) {
      const { maxspeed, direction, average, ...rest } = camera.data;
      cameras.push({
        ...rest,
        ...(maxspeed !== undefined ? { maxspeed } : {}),
        ...(direction !== undefined ? { direction } : {}),
        ...(average ? { average } : {}),
      });
    }
  }
  return cameras;
}

/** Radares como avisos de rota (tipo "speed_camera", com o limite como detalhe). */
export function speedCameraAlerts(cameras: readonly SpeedCamera[]): AlertSource[] {
  return cameras.map((camera) => ({
    id: `camera:${camera.id}`,
    kind: camera.average ? 'average_speed_camera' : 'speed_camera',
    lngLat: { lng: camera.lon, lat: camera.lat },
    ...(camera.direction !== undefined ? { bearing: camera.direction } : {}),
    ...(camera.maxspeed !== undefined ? { detail: camera.maxspeed } : {}),
  }));
}
