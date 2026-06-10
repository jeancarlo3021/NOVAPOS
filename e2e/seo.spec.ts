import { test, expect } from '@playwright/test';

/**
 * Tests SEO + PWA — verifican que los archivos críticos para Google y la
 * instalación como PWA están bien servidos. Estos son los típicos que un
 * deploy roto rompe en silencio.
 */

test.describe('SEO files', () => {
  test('sitemap.xml lista la URL canonical', async ({ request }) => {
    const r = await request.get('/sitemap.xml');
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    expect(body).toContain('<urlset');
    expect(body).toContain('https://colonclick.com/');
  });

  test('robots.txt apunta al sitemap', async ({ request }) => {
    const r = await request.get('/robots.txt');
    expect(r.ok()).toBeTruthy();
    const body = await r.text();
    expect(body).toMatch(/Sitemap:\s+https:\/\/colonclick\.com\/sitemap\.xml/);
  });

  test('robots.txt bloquea rutas autenticadas', async ({ request }) => {
    const r = await request.get('/robots.txt');
    const body = await r.text();
    // Rutas privadas que NO queremos indexadas
    expect(body).toMatch(/Disallow:\s+\/pos/);
    expect(body).toMatch(/Disallow:\s+\/inventory/);
    expect(body).toMatch(/Disallow:\s+\/api/);
  });
});

test.describe('PWA manifest', () => {
  test('manifest.json tiene iconos y shortcuts', async ({ request }) => {
    const r = await request.get('/manifest.json');
    expect(r.ok()).toBeTruthy();
    const m = await r.json();
    expect(m.name).toMatch(/Col[oó]nClick/i);
    expect(m.short_name).toMatch(/Col[oó]nClick/i);
    expect(Array.isArray(m.icons)).toBeTruthy();
    expect(m.icons.length).toBeGreaterThan(0);
    expect(Array.isArray(m.shortcuts)).toBeTruthy();
    expect(m.theme_color).toBe('#10b981');
  });

  test('favicon.svg responde 200', async ({ request }) => {
    const r = await request.get('/favicon.svg');
    expect(r.ok()).toBeTruthy();
    const ct = r.headers()['content-type'] ?? '';
    expect(ct).toMatch(/svg/i);
  });
});

test.describe('HTML meta tags', () => {
  test('index.html tiene canonical y og tags', async ({ page }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe('https://colonclick.com/');

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toMatch(/Col[oó]nClick/i);

    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).toContain('colonclick.com');
  });

  test('apple-mobile-web-app-title configurado para iOS', async ({ page }) => {
    await page.goto('/');
    const apple = await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content');
    expect(apple).toMatch(/Col[oó]nClick/i);
  });
});
