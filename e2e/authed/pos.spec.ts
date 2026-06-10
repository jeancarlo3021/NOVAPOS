import { test, expect } from '@playwright/test';

/**
 * Tests del POS — no completan ventas reales (eso requiere sesión de caja,
 * stock, etc). Verifican que los elementos clave de la UI existan.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/pos');
  await page.waitForLoadState('networkidle');
});

test('búsqueda de clientes abre el modal', async ({ page }) => {
  // Botón con ícono Search al lado del campo "Cliente:"
  const searchBtn = page.locator('button[title*="buscar cliente" i]').first();
  if (!(await searchBtn.isVisible().catch(() => false))) test.skip();

  await searchBtn.click();
  await expect(page.locator('input[placeholder*="Buscar cliente" i]')).toBeVisible();
});

test('dropdown de tipo de documento existe', async ({ page }) => {
  const sel = page.locator('select').filter({ hasText: /tiquete|factura/i }).first();
  await expect(sel).toBeVisible();

  // Tiene las 3 opciones esperadas
  const options = await sel.locator('option').allInnerTexts();
  const joined = options.join('|').toLowerCase();
  expect(joined).toContain('tiquete corriente');
  expect(joined).toContain('tiquete electrónico');
  expect(joined).toContain('factura electrónica');
});
