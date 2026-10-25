import { expect, test } from '@playwright/test';
import { CAJERO, abrirCaja, apiToken, cobrar, escanear, login, resetDemo } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F4 · Corte Z con totales reales y terminal bloqueada en UI y API', async ({
  page,
  request,
}) => {
  await login(page, CAJERO);
  await abrirCaja(page);
  await page.getByRole('link', { name: 'Punto de venta' }).click();
  await escanear(page, 'CAM-MTB-0029', 2);
  await cobrar(page);
  await expect(page.getByTestId('resultado-titulo')).toHaveText('Venta confirmada', {
    timeout: 10_000,
  });

  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Cerrar turno' }).click();
  await expect(page.getByTestId('corte-termico')).toContainText('TOTAL VENTAS (1)');
  await page.getByLabel('Efectivo contado').fill('110.00');
  await expect(page.getByTestId('diferencia')).not.toHaveText('—');
  await page.getByTestId('confirmar-corte').click();
  await page.getByTestId('confirmar-corte-modal').click();

  // Estado 4: el POS no vuelve a operar hasta una nueva apertura
  await expect(page.getByTestId('caja-cerrada')).toBeVisible();
  await expect(page.getByTestId('corte-termico')).toContainText(/CORTE Z #\d{4}/);
  await page.goto('/pos');
  await expect(page.getByTestId('caja-cerrada')).toBeVisible();
  const token = await apiToken(request, CAJERO);
  const r = await request.post('http://localhost:5173/api/ventas', {
    headers: { authorization: `Bearer ${token}` },
    data: { cliente_id: null, lineas: [], metodo_pago: 'EFECTIVO' },
  });
  expect([409, 422]).toContain(r.status());

  await page.getByRole('button', { name: 'Abrir nuevo turno' }).click();
  await abrirCaja(page);
});
