// Tem de ser o primeiro import: desliga o `eval` do zod antes de criar esquemas (CSP).
import './csp';
import { z } from 'zod';
import type { LngLat } from './geo';
import { isValidLngLat, roundTo } from './geo';
import type { KeyValueStorage, PersistentStore } from './persistent-store';
import { createPersistentStore } from './persistent-store';

/** Tipos de reporte. A polícia pode ser desligada nas definições (ADR 0008). */
export const REPORT_TYPES = [
  'police',
  'accident',
  'hazard',
  'jam',
  'roadworks',
  'closure',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const MINUTE = 60_000;

/**
 * Tempo de vida de cada tipo, em minutos. Polícia: 60 min (ADR 0008). Cada confirmação
 * ("Ainda lá está") volta a contar o tempo a partir desse momento.
 */
export const REPORT_LIFETIME_MINUTES: Readonly<Record<ReportType, number>> = {
  police: 60,
  accident: 120,
  hazard: 120,
  jam: 60,
  roadworks: 7 * 24 * 60,
  closure: 24 * 60,
};

export const REPORTS_STORAGE_KEY = 'trajecto:v1:reports';
export const MAX_REPORTS = 200;

/**
 * Reporte guardado no dispositivo. Só tipo, posição, direção e horas: nunca fotografias,
 * matrículas nem descrições de pessoas (ADR 0008).
 */
export interface Report {
  readonly id: string;
  readonly type: ReportType;
  readonly lngLat: LngLat;
  /** Direção de quem reportou (graus), quando reportado em andamento. */
  readonly bearing?: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly confirmations: number;
}

export interface ReportsState {
  readonly version: 1;
  readonly reports: readonly Report[];
}

const reportSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(REPORT_TYPES),
  lngLat: z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }),
  bearing: z.number().min(0).max(360).optional(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  confirmations: z.number().int().nonnegative().max(1000),
});

const reportsStateSchema: z.ZodType<ReportsState> = z.object({
  version: z.literal(1),
  reports: z.array(reportSchema).max(MAX_REPORTS),
});

const EMPTY: ReportsState = { version: 1, reports: [] };

export function isActiveReport(report: Report, now: number): boolean {
  return report.expiresAt > now;
}

export function activeReports(
  reports: readonly Report[],
  now: number,
  options: { readonly police?: boolean } = {},
): Report[] {
  return reports.filter(
    (r) => isActiveReport(r, now) && (options.police !== false || r.type !== 'police'),
  );
}

export interface ReportsStore {
  getSnapshot(): ReportsState;
  isPersistent(): boolean;
  subscribe(listener: () => void): () => void;
  reload(): void;
  /** Cria um reporte; devolve `null` se as coordenadas forem inválidas. */
  add(type: ReportType, lngLat: LngLat, bearing?: number): Report | null;
  /** "Ainda lá está": volta a contar o tempo de vida a partir de agora. */
  confirm(id: string): void;
  /** "Já não está" ou apagar. */
  remove(id: string): void;
  /** Apaga os reportes expirados. */
  purgeExpired(): void;
  clear(): void;
}

export interface ReportsStoreOptions {
  readonly storage: KeyValueStorage;
  readonly now?: () => number;
  readonly createId?: () => string;
}

export function createReportsStore(options: ReportsStoreOptions): ReportsStore {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  const store: PersistentStore<ReportsState> = createPersistentStore({
    storage: options.storage,
    key: REPORTS_STORAGE_KEY,
    schema: reportsStateSchema,
    defaults: EMPTY,
  });

  return {
    getSnapshot: store.getSnapshot,
    isPersistent: store.isPersistent,
    subscribe: store.subscribe,
    reload: store.reload,

    add(type, lngLat, bearing) {
      if (!isValidLngLat(lngLat)) return null;
      const createdAt = now();
      const report: Report = {
        id: createId(),
        type,
        // ~1 m de precisão chega para um aviso e não guarda mais do que o necessário.
        lngLat: { lng: roundTo(lngLat.lng, 5), lat: roundTo(lngLat.lat, 5) },
        ...(bearing !== undefined && Number.isFinite(bearing)
          ? { bearing: Math.round(((bearing % 360) + 360) % 360) }
          : {}),
        createdAt,
        expiresAt: createdAt + REPORT_LIFETIME_MINUTES[type] * MINUTE,
        confirmations: 0,
      };
      store.update((s) => ({
        ...s,
        // Os mais recentes primeiro; os expirados e os mais antigos saem quando passa do limite.
        reports: [report, ...s.reports.filter((r) => isActiveReport(r, createdAt))].slice(
          0,
          MAX_REPORTS,
        ),
      }));
      return report;
    },

    confirm(id) {
      const time = now();
      store.update((s) =>
        s.reports.some((r) => r.id === id)
          ? {
              ...s,
              reports: s.reports.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      expiresAt: time + REPORT_LIFETIME_MINUTES[r.type] * MINUTE,
                      confirmations: r.confirmations + 1,
                    }
                  : r,
              ),
            }
          : s,
      );
    },

    remove(id) {
      store.update((s) =>
        s.reports.some((r) => r.id === id)
          ? { ...s, reports: s.reports.filter((r) => r.id !== id) }
          : s,
      );
    },

    purgeExpired() {
      const time = now();
      store.update((s) =>
        s.reports.every((r) => isActiveReport(r, time))
          ? s
          : { ...s, reports: s.reports.filter((r) => isActiveReport(r, time)) },
      );
    },

    clear() {
      store.reset();
    },
  };
}
