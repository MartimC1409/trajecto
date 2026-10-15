import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { categoryLabel } from './placeText';

describe('categoryLabel', () => {
  beforeAll(async () => {
    await initI18n('pt-PT');
  });

  it('traduz categorias do mapa e da pesquisa', () => {
    const t = i18next.t.bind(i18next);
    expect(categoryLabel('poi:pharmacy', t)).toBe('Farmácia');
    expect(categoryLabel('amenity:pharmacy', t)).toBe('Farmácia');
    expect(categoryLabel('poi:subway', t)).toBe('Estação de metro');
  });

  it('sem tradução ou com valores estranhos não mostra nada', () => {
    const t = i18next.t.bind(i18next);
    expect(categoryLabel(undefined, t)).toBeNull();
    expect(categoryLabel('shop:something_else', t)).toBeNull();
    expect(categoryLabel('poi:../../x', t)).toBeNull();
    expect(categoryLabel('poi:Farmácia', t)).toBeNull();
  });
});
