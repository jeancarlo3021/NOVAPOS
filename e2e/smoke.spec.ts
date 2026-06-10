import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verifican que la app arranca y los assets críticos cargan.
 * Estos son la primera línea de defensa contra deploys rotos.
 */

test.describe('App boot', () => {
  test('la página raíz devuelve HTML válido', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);

    // Verificá que es HTML, no que el SPA fallback devolvió otra cosa.
    const ct = response?.headers()['content-type'] ?? '';
    expect(ct).toContain('text/html');
  });

  test('manifest.json se sirve como JSON válido', async ({ request }) => {
    const r = await request.get('/manifest.json');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toMatch(/(json|manifest)/i);
    const body = await r.json();
    expect(body.name).toMatch(/Col[oó]nClick/i);
    expect(Array.isArray(body.icons)).toBeTruthy();
  });

  test('sitemap.xml es XML válido (no SPA fallback)', async ({ request }) => {
    const r = await request.get('/sitemap.xml');
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    // Cuando el fallback SPA captura, devolvería HTML con <!doctype html>.
    expect(body.toLowerCase()).not.toContain('<!doctype html>');
    expect(body).toContain('<urlset');
  });

  test('robots.txt se sirve como text/plain', async ({ request }) => {
    const r = await request.get('/robots.txt');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toMatch(/text\/plain/i);
    const body = await r.text();
    expect(body).toMatch(/User-agent/i);
    expect(body).toMatch(/Sitemap:/i);
  });
});

test.describe('Login page', () => {
  test('redirige al login cuando no hay sesión', async ({ page }) => {
    await page.goto('/');
    // La app rederiza a /login si no hay sesión activa.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('el form de login muestra los inputs esenciales', async ({ page }) => {
    await page.goto('/login');
    // Esperá a que React monte
    await page.waitForLoadState('networkidle');

    // Inputs comunes: usuario y contraseña
    const userInput = page.locator('input').first();
    await expect(userInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Botón de submit
    const submit = page.getByRole('button', { name: /entrar|iniciar|login/i });
    await expect(submit).toBeVisible();
  });

  test('credenciales vacías no inician sesión', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const submit = page.getByRole('button', { name: /entrar|iniciar|login/i });
    await submit.click();

    // No debería navegar fuera del login.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Branding', () => {
  test('título de la página y meta tags son ColónClick', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.toLowerCase()).toContain('col');

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
  });
});
