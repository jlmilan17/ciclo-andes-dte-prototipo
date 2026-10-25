import { expect, test } from '@playwright/test';
import { ADMIN, CAJERO, abrirCaja, apiToken, login, resetDemo } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F6 · invalidación con motivo, sello del evento, estado en el historial y bloqueo fuera de plazo', async ({
  page,
  request,
}) => {
  await login(page, ADMIN);
  await page.getByRole('link', { name: 'Historial de DTE' }).click();

  // Fuera de plazo: botón deshabilitado con explicación
  await page.getByTestId('fila-DTE-03-M001P001-000000000000006').click();
  await expect(page.getByTestId('btn-invalidar')).toBeDisabled();
  await expect(page.getByTestId('motivo-no-invalidable')).toContainText('Fuera del plazo');

  // DTE de hoy
  await page.getByRole('link', { name: 'Historial de DTE' }).click();
  await page.getByTestId('fila-DTE-01-M001P001-000000000000005').click();
  const id = page.url().split('/').pop()!;
  await page.getByTestId('btn-invalidar').click();
  await page
    .getByLabel('Motivo de invalidación')
    .selectOption({ label: 'Rescindir la operación realizada' });
  await page.getByTestId('confirmar-invalidar').click();
  await expect(page.getByTestId('estado-detalle')).toContainText('INVALIDADO');
  await page.getByRole('tab', { name: 'Eventos' }).click();
  await expect(page.getByTestId('evento-invalidacion')).toContainText(
    'Rescindir la operación realizada',
  );
  await page.getByRole('tab', { name: 'Bitácora' }).click();
  await expect(page.getByTestId('bitacora')).toContainText('Invalidado');

  // Estado 6: INVALIDADO también en el historial
  await page.getByRole('link', { name: 'Historial de DTE' }).click();
  await expect(page.getByTestId('fila-DTE-01-M001P001-000000000000005')).toContainText(
    'INVALIDADO',
  );

  // El Cajero no ve la acción y el API le responde 403
  await login(page, CAJERO);
  await abrirCaja(page);
  await page.goto(`/dte/${id}`);
  await expect(page.getByTestId('estado-detalle')).toBeVisible();
  await expect(page.getByTestId('btn-invalidar')).toHaveCount(0);
  const token = await apiToken(request, CAJERO);
  const r = await request.post(`http://localhost:5173/api/dte/${id}/invalidar`, {
    headers: { authorization: `Bearer ${token}` },
    data: { motivo_id: 1 },
  });
  expect(r.status()).toBe(403);
});
