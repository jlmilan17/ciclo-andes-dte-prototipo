import { expect, test } from '@playwright/test';
import { ADMIN, CAJERO, CAJERO_PRUEBA, login, resetDemo } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F1 · bloqueo tras 3 intentos, desbloqueo, rail por rol, cambio de rol y expiración de sesión', async ({
  page,
}) => {
  // Bloqueo
  for (let i = 0; i < 3; i++) await login(page, CAJERO_PRUEBA, 'incorrecta');
  await expect(page.getByRole('alert')).toContainText('bloqueada');
  await login(page, CAJERO_PRUEBA);
  await expect(page.getByRole('alert')).toContainText('bloqueada');

  // El Administrador entra al Resumen y desbloquea
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/resumen$/);
  await expect(page.getByTestId('rail').getByRole('link')).toHaveCount(7);
  await page.getByRole('link', { name: 'Usuarios y roles' }).click();
  const fila = page.getByTestId(`usuario-${CAJERO_PRUEBA}`);
  await expect(fila).toContainText('Bloqueada');
  await fila.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(fila).toContainText('Activa');
  await login(page, CAJERO_PRUEBA);
  await expect(page).toHaveURL(/\/caja\/apertura$/);

  // Cajero: Apertura de caja y rail reducido
  await login(page, CAJERO);
  await expect(page).toHaveURL(/\/caja\/apertura$/);
  const rail = page.getByTestId('rail');
  await expect(rail.getByRole('link')).toHaveCount(4);
  await expect(rail).not.toContainText('Catálogo');
  await expect(rail).not.toContainText('Resumen');
  await expect(rail).not.toContainText('Usuarios');

  // Estado 5: cambiar de rol cambia el rail y las acciones de las pantallas compartidas
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: /Cambiar de rol/ }).click();
  await expect(page.getByText('Herramienta de demostración')).toBeVisible();
  await page.getByRole('button', { name: 'Entrar como Administrador' }).click();
  await expect(page.getByTestId('rail').getByRole('link')).toHaveCount(7);
  await page.goto('/dte');
  await page.getByTestId('fila-DTE-01-M001P001-000000000000005').click();
  await expect(page.getByTestId('btn-invalidar')).toBeVisible();

  // Expiración de sesión
  await page.getByTestId('abrir-panel-sim').click();
  await page.getByRole('button', { name: 'Expirar sesión ahora' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Sesión expirada' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar sesión de nuevo' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
