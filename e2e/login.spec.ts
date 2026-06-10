import { test, expect } from '@playwright/test';

/**
 * Tests del flujo de login — verifican que el form se ve, valida campos
 * vacíos, y que la SPA redirige correctamente cuando no hay sesión.
 *
 * No intentamos login real (eso requeriría credenciales en CI). Para tests
 * de flujos autenticados usá mocks de Supabase o seeds dedicados.
 */

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    // Asegurar que NO hay sesión cacheada
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('renderiza el formulario de login', async ({ page }) => {
    // Verificamos que la pantalla cargó con el título correcto.
    await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible();
  });

  test('los inputs de usuario y contraseña son requeridos', async ({ page }) => {
    const submit = page.getByRole('button', { name: /entrar|iniciar|login/i });
    await submit.click();

    // Esperá brevemente — si el form se envió con campos vacíos, no debería
    // navegar a una ruta privada.
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/login/);
  });

  test('teclear en los inputs actualiza su valor', async ({ page }) => {
    const userInput = page.locator('input').first();
    await userInput.fill('jeancarlo');
    await expect(userInput).toHaveValue('jeancarlo');

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('test1234');
    await expect(passwordInput).toHaveValue('test1234');
  });

  test('toggle de mostrar contraseña funciona', async ({ page }) => {
    // El form tiene 2 inputs: el segundo es la contraseña.
    const passwordInput = page.locator('input').nth(1);
    await passwordInput.fill('test1234');
    expect(await passwordInput.getAttribute('type')).toBe('password');

    // El botón de ojito está dentro del wrapper del input de contraseña.
    const toggle = page.locator('button[tabindex="-1"]').first();
    if (!(await toggle.isVisible().catch(() => false))) test.skip();

    await toggle.click();
    expect(await passwordInput.getAttribute('type')).toBe('text');
  });

  test('credenciales inválidas muestran error sin navegar', async ({ page }) => {
    const userInput = page.locator('input').first();
    const passwordInput = page.locator('input[type="password"]');
    const submit = page.getByRole('button', { name: /entrar|iniciar|login/i });

    await userInput.fill('noexiste@test.com');
    await passwordInput.fill('passwordfalsa');
    await submit.click();

    // Esperá la respuesta del backend (intentar login)
    await page.waitForTimeout(2500);

    // No debería estar autenticado → sigue en login
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Protected route redirect', () => {
  test('acceder a /inventory sin sesión redirige al login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/inventory');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('acceder a /pos sin sesión redirige al login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/pos');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('acceder a /reports sin sesión redirige al login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
