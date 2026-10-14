// Gera os ícones PNG da PWA a partir de public/icons/icon.svg (usa o Chromium do Playwright).
// Uso: pnpm --filter @trajecto/web icons
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = await readFile(join(iconsDir, 'icon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  // Ícone "maskable": fundo cheio e desenho dentro da zona segura (80 %).
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const { file, size, maskable } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = maskable ? Math.round(size * 0.8) : size;
    await page.setContent(
      `<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? '#1f6feb' : 'transparent'}">` +
        `<img src="${dataUrl}" width="${inner}" height="${inner}"></body></html>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await writeFile(join(iconsDir, file), await page.screenshot({ omitBackground: !maskable }));
    await page.close();
    console.log(`✓ ${file}`);
  }
} finally {
  await browser.close();
}
