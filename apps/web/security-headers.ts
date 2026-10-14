/**
 * Cabeçalhos de segurança da versão de produção.
 * Fonte única para o `pnpm preview` (vite.config.ts) e para o Vercel (vercel.json);
 * um teste (src/server/security-headers.test.ts) garante que os dois coincidem.
 */
export interface SecurityHeaderOptions {
  /** Origens extra permitidas em `connect-src` (tiles e fontes do mapa). */
  readonly connectOrigins: readonly string[];
}

export function buildContentSecurityPolicy({ connectOrigins }: SecurityHeaderOptions): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${[...new Set(connectOrigins)].join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  };
}

/** Origem extraída de um URL ou de um modelo com "{...}" (por exemplo, o URL das fontes). */
export function originOf(urlOrTemplate: string): string {
  return new URL(urlOrTemplate.replace(/\{[^}]+\}/gu, 'x')).origin;
}
