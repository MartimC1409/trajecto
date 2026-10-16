import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { formatClock, formatBytes, formatDistance, formatDuration, formatEuros } from './format';

const t = ((key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ''}`) as unknown as TFunction;

describe('format', () => {
  it('formata distâncias curtas e longas', () => {
    expect(formatDistance(0, 'pt-PT')).toBe('0 m');
    expect(formatDistance(Number.NaN, 'pt-PT')).toBe('0 m');
    expect(formatDistance(84, 'pt-PT')).toBe('80 m');
    expect(formatDistance(356, 'pt-PT')).toBe('350 m');
    expect(formatDistance(990, 'pt-PT')).toBe('1 km');
    expect(formatDistance(1234, 'pt-PT')).toBe('1,2 km');
    expect(formatDistance(12_345, 'pt-PT')).toBe('12 km');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(350, 'pt-PT', true)).toBe('350 metros');
    expect(formatDistance(1500, 'pt-PT', true)).toBe('1,5 quilómetros');
  });

  it('formata durações', () => {
    expect(formatDuration(10, t)).toBe('format.lessThanMinute');
    expect(formatDuration(Number.NaN, t)).toBe('format.lessThanMinute');
    expect(formatDuration(600, t)).toBe('format.minutes{"m":10}');
    expect(formatDuration(3900, t)).toBe('format.hoursMinutes{"h":1,"m":"05"}');
  });

  it('formata horas e euros', () => {
    expect(formatClock(new Date(2026, 9, 14, 9, 5), 'pt-PT')).toBe('09:05');
    expect(formatEuros(3.2, 'pt-PT').replace(/\s/gu, ' ')).toBe('3,20 €');
  });
});

describe('formatBytes', () => {
  it('mostra kB, MB e GB com uma casa decimal abaixo de 10', () => {
    expect(formatBytes(0, 'pt-PT')).toBe('0 kB');
    expect(formatBytes(850_000, 'pt-PT')).toBe('850 kB');
    expect(formatBytes(1_234_567, 'pt-PT')).toBe('1,2 MB');
    expect(formatBytes(50_000_000, 'pt-PT')).toBe('50 MB');
    expect(formatBytes(2_000_000_000, 'en')).toBe('2 GB');
    expect(formatBytes(Number.NaN, 'pt-PT')).toBe('0 kB');
  });
});
