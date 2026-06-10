import { test, expect } from '@playwright/test';

/**
 * Test CRUD del módulo Clientes — crea, edita y elimina un cliente real.
 * Usa nombres únicos por timestamp así no choca entre runs.
 */

const stamp = () => Date.now().toString().slice(-8);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.beforeEach(async ({ page }) => {
  await page.goto('/customers');
  await page.waitForSelector('aside', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
});

test('crear, editar y eliminar un cliente', async ({ page }) => {
  const id   = stamp();
  const name = `E2E Cliente ${id}`;
  const edit = `E2E Cliente ${id} (editado)`;

  // ── Crear ───────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /nuevo cliente|crear el primero/i }).first().click();

  // Modal abierto
  const modal = page.locator('div.fixed').filter({ hasText: /nuevo cliente/i }).first();
  await expect(modal).toBeVisible();

  // Llenar nombre (primer input del modal)
  await modal.locator('input').first().fill(name);
  // Email — está en el modal con type="email"
  const emailInput = modal.locator('input[type="email"]').first();
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(`e2e+${id}@nexoerp.local`);
  }

  await modal.getByRole('button', { name: /guardar/i }).click();

  // El cliente aparece en la lista
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

  // ── Editar ──────────────────────────────────────────────────────────────
  // Identificamos la card por el h3 con el nombre exacto y subimos al
  // contenedor (rounded-xl) — más estable que un filter con regex.
  const heading = page.getByRole('heading', { name: new RegExp(`^${esc(name)}$`) });
  const card = heading.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  await card.getByRole('button', { name: /editar/i }).click();

  const editModal = page.locator('div.fixed').filter({ hasText: /editar cliente/i }).first();
  await expect(editModal).toBeVisible();

  await editModal.locator('input').first().fill(edit);
  await editModal.getByRole('button', { name: /guardar/i }).click();

  await expect(page.getByText(edit).first()).toBeVisible({ timeout: 10_000 });

  // ── Eliminar (soft delete) ──────────────────────────────────────────────
  page.once('dialog', d => d.accept());

  const updatedHeading = page.getByRole('heading', { name: new RegExp(`^${esc(edit)}$`) });
  const updatedCard = updatedHeading.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  // Botón de delete: el último button de la card (después de Editar)
  await updatedCard.locator('button').last().click();

  // Después del soft delete aparece el badge INACTIVO en la misma card
  await expect(updatedCard.getByText(/INACTIVO/)).toBeVisible({ timeout: 10_000 });
});

test('búsqueda de clientes filtra resultados', async ({ page }) => {
  const input = page.locator('input[placeholder*="Buscar" i]').first();
  await input.fill('zzzzz-no-existe-xyz');
  // El componente debounce 300ms; esperamos un poco más
  await page.waitForTimeout(700);

  // Debe aparecer el empty-state
  await expect(page.getByText(/sin clientes a[uú]n|sin resultados/i).first())
    .toBeVisible({ timeout: 5_000 });
});
