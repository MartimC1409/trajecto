// @vitest-environment node
import { describe, expect, it } from 'vitest';
import vercelConfig from '../../vercel.json';
import { buildSecurityHeaders, originOf } from '../../security-headers';

describe('cabeçalhos de segurança', () => {
  it('o vercel.json usa exatamente os mesmos cabeçalhos que o `pnpm preview`', () => {
    const expected = buildSecurityHeaders({
      connectOrigins: [
        originOf('https://tiles.openfreemap.org/planet'),
        originOf('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'),
        originOf('https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'),
      ],
    });
    const global = vercelConfig.headers.find((h) => h.source === '/(.*)');
    const actual = Object.fromEntries((global?.headers ?? []).map((h) => [h.key, h.value]));
    expect(actual).toEqual(expected);
  });

  it('a CSP não permite scripts nem estilos inline nem eval', () => {
    const csp = buildSecurityHeaders({ connectOrigins: ['https://tiles.example'] })[
      'Content-Security-Policy'
    ];
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self';");
    expect(csp).not.toMatch(/unsafe-(inline|eval)/u);
    expect(csp).toContain("connect-src 'self' https://tiles.example;");
  });

  it('extrai a origem de modelos de URL', () => {
    expect(originOf('https://a.example:8443/fonts/{fontstack}/{range}.pbf')).toBe(
      'https://a.example:8443',
    );
  });

  it('a função de pesquisa está ligada aos caminhos usados pelo cliente', () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/geocoder/:endpoint(api|reverse)',
      destination: '/api/geocoder?endpoint=:endpoint',
    });
  });
});
