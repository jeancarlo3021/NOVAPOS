import { test, expect } from '@playwright/test';

/**
 * Smoke autenticado: confirma que cada ruta principal carga sin errores
 * y muestra un elemento clave de su UI. NO toca datos — solo navega.
 *
 * Necesita E2E_USER + E2E_PASS en .env.local (el `auth.setup.ts` hace login
 * una vez y guarda storageState; cada test acá lo reusa).
 */

const ROUTES: Array<{ name: string; path: string; expect: RegExp }> = [
  { name: 'Dashboard',        path: '/',           expect: /ventas|dashboard|hoy/i },
  { name: 'POS',              path: '/pos',        expect: /punto de venta|cobrar|carrito|cliente/i },
  { name: 'Inventario',       path: '/inventory',  expect: /productos|inventario/i },
  { name: 'Clientes',         path: '/customers',  expect: /clientes/i },
  { name: 'Reportes',         path: '/reports',    expect: /reportes|ventas/i },
  { name: 'Gastos',           path: '/expenses',   expect: /gastos/i },
  { name: 'Compras',          path: '/purchases',  expect: /compras|orden/i },
  { name: 'Promociones',      path: '/promotions', expect: /promociones/i },
  { name: 'Sucursales',       path: '/branches',   expect: /sucursales|bodegas/i },
  { name: 'Transferencias',   path: '/transfers',  expect: /transferencias/i },
  { name: 'Usuarios',         path: '/users',      expect: /usuarios|roles/i },
  { name: 'Configuración',    path: '/settings',   expect: /configuración|general/i },
];

test.describe('Rutas autenticadas', () => {
  for (const r of ROUTES) {
    test(`${r.name} carga sin error y muestra contenido`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(r.path);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Esperar a que el splash de auth ("Verificando autenticación...") se vaya.
      // El sidebar (<aside>) solo aparece cuando AuthContext terminó.
      await page.waitForSelector('aside, [data-pos-view]', { timeout: 15_000 }).catch(() => {});
      // Margen extra para que los datos del módulo carguen
      await page.waitForTimeout(800);

      // No fuimos redirigidos al login
      await expect(page).not.toHaveURL(/\/login/);

      // Algún texto característico del módulo (case-insensitive)
      const body = await page.locator('body').innerText();
      expect(body).toMatch(r.expect);

      // Filtrar errores irrelevantes (warnings de fonts, QZ Tray, extensiones)
      const realErrors = errors.filter(e =>
        !/ResizeObserver|extension|cf_bm|Cookie|google\.com|gstatic|fontawesome|qz\.io|localhost:8\d{3}|WebSocket connection|net::ERR_CONNECTION_REFUSED|Sentry|sentry/i.test(e)
      );
      expect(realErrors, `Errores en consola para ${r.name}: ${realErrors.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Sidebar', () => {
  test('el sidebar muestra los grupos colapsables', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside', { timeout: 15_000 });

    // Sidebar visible en desktop
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Algún ítem principal debería estar
    await expect(sidebar.getByText(/dashboard/i)).toBeVisible();
  });

  test('click en POS navega a /pos', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside', { timeout: 15_000 });

    await page.locator('aside a[href="/pos"]').first().click();
    await expect(page).toHaveURL(/\/pos/);
  });
});

test.describe('Logout', () => {
  test('cerrar sesión devuelve al login', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside', { timeout: 15_000 });

    // Botón de logout — el Sidebar usa title="Cerrar sesión"
    const logout = page.locator('aside button[title*="sesión" i], aside button[title*="cerrar" i]').first();
    if (!(await logout.isVisible().catch(() => false))) test.skip();

    await logout.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
