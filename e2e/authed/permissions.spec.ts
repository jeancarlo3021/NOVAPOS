import { test, expect } from '@playwright/test';

/**
 * Tests del sistema de permisos por rol.
 *
 * Verifica desde la perspectiva del OWNER:
 *   - El tab "Roles" está visible en /users
 *   - Se pueden abrir las cards de cada rol
 *   - El modal de configuración carga la matriz de módulos
 *
 * El test "el cajero solo ve POS" requiere crear un usuario cajero,
 * loguearse como él, y volver atrás — eso lo dejamos para un test más
 * pesado dedicado (necesita cleanup de auth state).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/users');
  await page.waitForSelector('aside', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
});

test('el tab Roles está visible para el owner', async ({ page }) => {
  const rolesTab = page.getByRole('button', { name: /^roles$/i }).first();
  await expect(rolesTab).toBeVisible();
});

test('abrir el editor de permisos del rol Gerente', async ({ page }) => {
  // Cambiar al tab Roles
  await page.getByRole('button', { name: /^roles$/i }).first().click();
  await page.waitForTimeout(500);

  // La card de Gerente tiene un h3 con "Gerente" — buscamos el botón
  // "Configurar permisos" que está dentro del MISMO ancestro (la card).
  const gerenteHeading = page.getByRole('heading', { name: /^gerente$/i });
  await expect(gerenteHeading).toBeVisible({ timeout: 10_000 });

  // Subir hasta la card (rounded-2xl) y bajar al botón
  const gerenteCard = gerenteHeading.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await gerenteCard.getByRole('button', { name: /configurar permisos/i }).click();

  // El modal de edición debe estar visible con la matriz de módulos
  const modal = page.locator('div.fixed').filter({ hasText: /permisos del rol/i }).first();
  await expect(modal).toBeVisible();

  // Debe mostrar al menos POS (siempre está en el plan)
  await expect(modal.getByText(/punto de venta/i)).toBeVisible();

  // Cerrar
  await modal.getByRole('button', { name: /cancelar/i }).click();
});

test('el rol Owner aparece como "Acceso total (no editable)"', async ({ page }) => {
  await page.getByRole('button', { name: /^roles$/i }).first().click();
  await page.waitForTimeout(500);

  await expect(page.getByText(/acceso total.*no editable/i)).toBeVisible({ timeout: 10_000 });
});
