import { test, expect } from '@playwright/test';

/**
 * Tests del flujo multi-empresa (TenantSwitcher).
 *
 * El owner del grupo tiene acceso a >1 sucursal. Acá verificamos:
 *   - El switcher aparece y lista las sucursales
 *   - El panel "Mis Sucursales" del dashboard muestra stats del grupo
 *   - Click en "Entrar" en una card del panel cambia de tenant
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('aside', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
});

test('TenantSwitcher abre el dropdown con la lista de sucursales', async ({ page }) => {
  // El TenantSwitcher es el primer botón con icono Building2 + ChevronDown
  // en el header. Lo buscamos por el icono y un truncate <span> con max-w-32.
  const switcher = page.locator('button:has(svg.lucide-building-2), button:has(.lucide-building2)').first();

  if (!(await switcher.isVisible().catch(() => false))) {
    test.skip(true, 'TenantSwitcher no visible — user sin múltiples tenants');
  }

  await switcher.click();
  await page.waitForTimeout(400);

  // Dropdown abierto: header "Mis negocios"
  await expect(page.getByText(/mis negocios/i)).toBeVisible({ timeout: 5_000 });

  await page.keyboard.press('Escape');
});

test('panel Mis Sucursales del dashboard muestra cards y stats del grupo', async ({ page }) => {
  // El panel solo aparece si el user es owner de >=1 tenant
  const panel = page.locator('div').filter({ hasText: /mis sucursales/i }).first();

  if (!(await panel.isVisible().catch(() => false))) {
    test.skip(true, 'Panel "Mis Sucursales" no visible — user no es owner de grupo');
  }

  await expect(panel).toBeVisible();

  // Debe mostrar al menos una card con: Usuarios, Facturas, Bodegas
  const body = await panel.innerText();
  expect(body).toMatch(/usuarios/i);
  expect(body).toMatch(/facturas/i);
  expect(body).toMatch(/bodegas/i);
});

test('cambiar de tenant via panel Mis Sucursales preserva el login', async ({ page }) => {
  const panel = page.locator('div').filter({ hasText: /mis sucursales/i }).first();
  if (!(await panel.isVisible().catch(() => false))) test.skip();

  // Buscar el primer botón "Entrar →" (sucursal distinta a la actual)
  const enterBtn = panel.getByRole('button', { name: /entrar/i }).first();
  if (!(await enterBtn.isVisible().catch(() => false))) {
    test.skip(true, 'Sin sucursales adicionales');
  }

  await enterBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Sigue autenticado (no redirige a /login)
  await expect(page).not.toHaveURL(/\/login/);
});
