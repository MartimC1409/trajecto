/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_GEOCODER_UPSTREAM = 'https://photon.komoot.io';
const DEFAULT_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const DEFAULT_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const geocoderUpstream = env.GEOCODER_UPSTREAM || DEFAULT_GEOCODER_UPSTREAM;
  const tilesOrigin = new URL(env.VITE_MAP_TILEJSON_URL || DEFAULT_TILEJSON_URL).origin;
  // O modelo de URL das fontes tem "{fontstack}", por isso extraímos só a origem.
  const glyphsOrigin = new URL(
    (env.VITE_MAP_GLYPHS_URL || DEFAULT_GLYPHS_URL).replace(/\{[^}]+\}/gu, 'x'),
  ).origin;
  const connectOrigins = [...new Set([tilesOrigin, glyphsOrigin])].join(' ');

  // O browser fala só com o nosso servidor local (/geocoder), que reencaminha para o Photon.
  // Assim evitamos problemas de CORS e podemos identificar a aplicação com um User-Agent.
  const proxy: Record<string, ProxyOptions> = {
    '/geocoder': {
      target: geocoderUpstream,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/geocoder/u, ''),
      headers: { 'User-Agent': 'Trajecto/0.1.0 (projeto pessoal)' },
      // Privacidade: não enviar ao serviço externo os cookies nem a página de origem do localhost.
      configure: (proxyServer) => {
        proxyServer.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('cookie');
          proxyReq.removeHeader('referer');
          proxyReq.removeHeader('origin');
        });
      },
      bypass: (req, res) => {
        // Só pedidos de leitura; qualquer outro método é recusado.
        if (req.method !== 'GET' && res) {
          res.statusCode = 405;
          res.end();
          return false;
        }
        return undefined;
      },
    },
  };

  // Política de segurança de conteúdo (CSP) aplicada à versão de produção (`pnpm preview`).
  // Em desenvolvimento não é usada porque o recarregamento automático do Vite precisa de scripts inline.
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${connectOrigins}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    plugins: [react()],
    worker: { format: 'es' },
    server: { port: 5173, strictPort: true, proxy },
    preview: {
      port: 4173,
      strictPort: true,
      proxy,
      headers: {
        'Content-Security-Policy': contentSecurityPolicy,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      // Só o MapLibre tem ~1 MB; a divisão do código em partes fica para a Fase 7 (otimização).
      chunkSizeWarningLimit: 1600,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // O mapa (WebGL) e o arranque são cobertos pelos testes ponta a ponta (Playwright).
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/main.tsx',
          'src/map/MapView.tsx',
          'src/map/worker.ts',
          'src/vite-env.d.ts',
        ],
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  };
});
