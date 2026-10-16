import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICON_PATHS } from '../components/Icon';
import {
  POI_CLASS_ICON,
  POI_GLYPHS,
  createMapImage,
  installMapImages,
  onewayImage,
  parseIconShapes,
  parseMapImageId,
  shieldImage,
} from './mapImages';

describe('mapImages', () => {
  it.each(Object.entries({ ...ICON_PATHS, ...POI_GLYPHS }))(
    'o desenho "%s" lê-se em formas válidas',
    (_name, fragment) => {
      const shapes = parseIconShapes(fragment);
      // Cada elemento do fragmento vira uma forma (nada é ignorado em silêncio).
      expect(shapes).toHaveLength(fragment.match(/<(path|circle|rect)\b/gu)?.length ?? 0);
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        if (shape.kind === 'path') expect(shape.d).toMatch(/^[Mm]/u);
        else {
          for (const value of Object.values(shape)) {
            if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
          }
        }
      }
    },
  );

  it('cada classe de local tem um desenho', () => {
    for (const icon of Object.values(POI_CLASS_ICON)) expect(POI_GLYPHS[icon]).toBeTruthy();
  });

  it('reconhece só os nomes de imagem do Trajecto', () => {
    expect(parseMapImageId('trajecto-poi-light-pharmacy')).toEqual({
      kind: 'poi',
      theme: 'light',
      icon: 'pharmacy',
    });
    expect(parseMapImageId(onewayImage('dark'))).toEqual({ kind: 'oneway', theme: 'dark' });
    expect(parseMapImageId(shieldImage('light', 'motorway'))).toEqual({
      kind: 'shield',
      theme: 'light',
      shield: 'motorway',
    });
    expect(parseMapImageId('trajecto-poi-light-constructor')).toBeNull();
    expect(parseMapImageId('trajecto-poi-sepia-cafe')).toBeNull();
    expect(parseMapImageId('trajecto-shield-light-bus')).toBeNull();
    expect(parseMapImageId('outra-imagem')).toBeNull();
  });

  it('sem canvas (como aqui, no jsdom) não desenha nem falha', () => {
    expect(createMapImage('trajecto-poi-light-cafe', 2)).toBeNull();
    expect(createMapImage('desconhecido', 2)).toBeNull();
  });

  describe('com canvas (simulado)', () => {
    /** Contexto 2D falso que regista as chamadas e devolve píxeis do tamanho pedido. */
    function fakeCanvas() {
      const calls: string[] = [];
      const record =
        (name: string) =>
        (...args: unknown[]) => {
          calls.push(
            `${name}(${args.map((a) => (typeof a === 'number' ? a : typeof a)).join(',')})`,
          );
        };
      class FakePath2D {
        addPath = record('path.addPath');
        moveTo = record('path.moveTo');
        arc = record('path.arc');
        arcTo = record('path.arcTo');
        closePath = record('path.closePath');
      }
      vi.stubGlobal('Path2D', FakePath2D);
      const context = {
        scale: record('scale'),
        translate: record('translate'),
        beginPath: record('beginPath'),
        arc: record('arc'),
        fill: record('fill'),
        stroke: record('stroke'),
        set fillStyle(value: string) {
          calls.push(`fillStyle=${value}`);
        },
        set strokeStyle(value: string) {
          calls.push(`strokeStyle=${value}`);
        },
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        getImageData: (_x: number, _y: number, width: number, height: number) => ({
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        }),
      };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D,
      );
      return calls;
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('desenha o ícone de um local com a cor da categoria e o tamanho certo para o ecrã', () => {
      const calls = fakeCanvas();
      const created = createMapImage('trajecto-poi-light-pharmacy', 2);
      expect(created?.options).toEqual({ pixelRatio: 2 });
      expect(created?.image.width).toBe(40);
      // Farmácia com o círculo verde (como a cruz das farmácias portuguesas) e desenho branco.
      expect(calls).toContain('fillStyle=#2e7d32');
      expect(calls).toContain('strokeStyle=#ffffff');
      // Desenhos com círculos e retângulos de cantos redondos (sem roundRect, para o Safari 15).
      expect(createMapImage('trajecto-poi-dark-bank', 1)?.image.width).toBe(20);
      expect(calls.filter((c) => c.startsWith('path.arcTo'))).toHaveLength(4);
      expect(calls.some((c) => c.startsWith('path.arc('))).toBe(true);
    });

    it('desenha a seta de sentido único e o escudo que estica à volta do número', () => {
      fakeCanvas();
      expect(createMapImage(onewayImage('dark'), 1)?.image.width).toBe(14);
      const shield = createMapImage(shieldImage('light', 'motorway'), 2);
      expect(shield?.image.width).toBe(40);
      expect(shield?.options).toEqual({
        pixelRatio: 2,
        stretchX: [[12, 28]],
        stretchY: [[12, 28]],
        content: [8, 8, 32, 32],
      });
    });

    it('o MapLibre pede as imagens quando precisa delas (uma vez cada)', () => {
      fakeCanvas();
      let resolver: ((id: string) => void) | null = null;
      const images = new Set<string>();
      const map = {
        setMissingStyleImageResolver: (fn: (id: string) => void) => {
          resolver = fn;
        },
        hasImage: (id: string) => images.has(id),
        getPixelRatio: () => 3,
        addImage: vi.fn((id: string) => images.add(id)),
      };
      installMapImages(map as never);
      const resolve = resolver as unknown as (id: string) => void;
      resolve('trajecto-poi-dark-cafe');
      resolve('trajecto-poi-dark-cafe');
      resolve('desconhecido');
      expect(map.addImage).toHaveBeenCalledTimes(1);
      expect(map.addImage).toHaveBeenCalledWith(
        'trajecto-poi-dark-cafe',
        expect.objectContaining({ width: 60 }),
        { pixelRatio: 3 },
      );
    });
  });
});
