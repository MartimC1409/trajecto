import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

const VERSION_TOKEN = 'self.__TRAJECTO_VERSION__';
const PRECACHE_TOKEN = 'self.__TRAJECTO_PRECACHE__';

/** Escreve no service worker a versão e a lista de ficheiros a guardar (`sw/service-worker.js`). */
export function buildServiceWorker(template: string, urls: readonly string[], version: string) {
  for (const token of [VERSION_TOKEN, PRECACHE_TOKEN]) {
    if (template.split(token).length !== 2) {
      throw new Error(`service-worker.js: "${token}" tem de aparecer uma vez.`);
    }
  }
  return template
    .replace(VERSION_TOKEN, JSON.stringify(version))
    .replace(PRECACHE_TOKEN, JSON.stringify(urls));
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

/**
 * Gera `sw.js` na build: os ficheiros da app (código, estilos, página) e os de `public/` (ícones,
 * manifesto, radares), sem os mapas de código (.map). A versão é um resumo do conteúdo de todos
 * eles: muda a cada publicação com alterações, e o browser instala o service worker novo.
 */
export function serviceWorkerPlugin(options: { template?: string } = {}): Plugin {
  let root = '';
  let publicDir = '';
  return {
    name: 'trajecto-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    async generateBundle(_outputOptions, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map'));
      const publicFiles = publicDir ? await listFiles(publicDir).catch(() => []) : [];
      const files = [...new Set(['index.html', ...built, ...publicFiles])].sort();
      const hash = createHash('sha256');
      for (const file of built) {
        const item = bundle[file];
        hash.update(file);
        if (item?.type === 'chunk') hash.update(item.code);
        else if (item) hash.update(item.source);
      }
      for (const file of publicFiles) {
        hash.update(file);
        hash.update(await readFile(join(publicDir, file)));
      }
      const template =
        options.template ?? (await readFile(join(root, 'sw', 'service-worker.js'), 'utf8'));
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildServiceWorker(
          template,
          files.map((file) => `/${file}`),
          hash.digest('hex').slice(0, 16),
        ),
      });
    },
  };
}
