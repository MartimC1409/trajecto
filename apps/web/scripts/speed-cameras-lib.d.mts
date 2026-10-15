/** Tipos de speed-cameras-lib.mjs (o script corre em Node sem compilação). */
export interface ExtractedCamera {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly maxspeed?: number;
  readonly direction?: number;
  readonly average?: boolean;
}

export const OVERPASS_URL: string;
export const OVERPASS_QUERY: string;
export function parseMaxspeed(value: unknown): number | undefined;
export function parseDirection(value: unknown): number | undefined;
export function camerasFromOverpass(body: unknown): ExtractedCamera[];
export function buildDataset(
  cameras: readonly ExtractedCamera[],
  generatedAt: string,
): {
  readonly source: string;
  readonly attribution: string;
  readonly license: 'ODbL-1.0';
  readonly licenseUrl: string;
  readonly copyrightUrl: string;
  readonly generatedAt: string;
  readonly cameras: readonly ExtractedCamera[];
};
