import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
const STORAGE_PATH = path.join(__dirname, '.auth/user.json');

/**
 * Hace login UNA vez y persiste localStorage + cookies en disco.
 * Los demás specs lo reusan con `storageState: STORAGE_PATH` así no
 * tienen que loguearse de nuevo (es lento + frágil).
 */
setup('autenticar usuario E2E', async ({ page }) => {
  const user = process.env.E2E_USER;
  const pass = process.env.E2E_PASS;

  console.log('[auth.setup] E2E_USER set:', !!user, 'E2E_PASS set:', !!pass);

  if (!user || !pass) {
    setup.skip(true, 'Sin E2E_USER/E2E_PASS — los tests autenticados se saltan');
  }

  await page.goto('/login');

  // Llenar form
  await page.locator('input').first().fill(user!);
  await page.locator('input').nth(1).fill(pass!);
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

  // Esperar que redirija fuera de /login (dashboard o /pos según roles)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 20_000,
  });
  await expect(page).not.toHaveURL(/\/login/);

  // Guardar el estado para que los specs lo reutilicen
  await page.context().storageState({ path: STORAGE_PATH });
});
