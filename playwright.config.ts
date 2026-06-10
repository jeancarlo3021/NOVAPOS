import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.local prioritario, fallback .env
dotenv.config({ path: path.join(__dirname, '.env.local'), quiet: true });
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const STORAGE_PATH = path.join(__dirname, 'e2e/.auth/user.json');

/**
 * Configuración E2E del FRONTEND (Vite + React).
 *
 * Corre el dev server automáticamente y lanza Chromium. Los tests viven en
 * `e2e/` y verifican páginas, navegación y comportamiento de UI sin tocar
 * Supabase real (los flujos auth se mockean cuando hace falta).
 *
 * Comandos:
 *   npm run test:e2e          → headless
 *   npm run test:e2e:ui       → modo interactivo (recomendado para desarrollo)
 *   npm run test:e2e:head     → headed (ves el navegador)
 *   npm run test:e2e:install  → instala el browser (solo 1 vez)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    // Tests no autenticados (login, seo, smoke)
    {
      name: 'public',
      testIgnore: ['**/authed/**', '**/*.setup.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Setup: loguea con E2E_USER/E2E_PASS y guarda storageState
    {
      name: 'auth-setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests autenticados — reusan el storageState del setup
    {
      name: 'authed',
      testMatch: /authed\/.*\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_PATH },
    },
  ],

  // Levanta el dev server antes de los tests (si no está corriendo ya).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
