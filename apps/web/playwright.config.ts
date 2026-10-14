import type { LaunchOptions } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Opcional: usar um Chromium já instalado (por exemplo, num ambiente sem acesso à internet).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
// O mapa precisa de WebGL2. Sem placa gráfica (CI, modo headless) usamos o SwiftShader (por software).
const chromiumLaunch: LaunchOptions = {
  ...(executablePath ? { executablePath } : {}),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure',
  },
  // Testamos a versão de produção (com a política de segurança de conteúdo ativa).
  webServer: {
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch },
    },
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7'], launchOptions: chromiumLaunch },
    },
    // O Safari do iPhone (WebKit) corre no CI e em Windows/macOS: E2E_WEBKIT=1 pnpm test:e2e
    ...(process.env.E2E_WEBKIT === '1'
      ? [{ name: 'iphone-webkit', use: { ...devices['iPhone 15'] } }]
      : []),
  ],
});
