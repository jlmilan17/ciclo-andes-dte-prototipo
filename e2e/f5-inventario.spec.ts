import { expect, test } from '@playwright/test';
import { ADMIN, login, resetDemo } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F5 · SKU duplicado rechazado y costo promedio 18@148 + 10@162 → $153.00', async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.getByRole('link', { name: 'Catálogo' }).click();

  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nuevo producto' });
  await dlg.getByLabel('SKU').fill('BIC-URB-0260');
  await dlg.getByLabel('Nombre', { exact: true }).fill('Duplicado');
  await dlg.getByLabel('Categoría').fill('Bicicletas');
  await dlg.getByLabel('Precio neto (sin IVA)').fill('10.00');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg.getByText('Ya existe un producto con ese SKU')).toBeVisible();
  await dlg.getByLabel('SKU').fill('ACC-TST-9001');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Producto creado.')).toBeVisible();

  await page.getByLabel('Buscar producto').fill('BIC-URB-0260');
  await page.getByTestId('producto-BIC-URB-0260').click();
  await page.getByRole('button', { name: 'Registrar ingreso', exact: true }).click();
  const lote = page.getByRole('dialog', { name: 'Registrar ingreso de lote' });
  await lote
    .getByLabel('Proveedor', { exact: true })
    .selectOption({ label: 'Importadora Ciclos del Istmo' });
  await lote.getByLabel('Cantidad', { exact: true }).fill('10');
  await lote.getByLabel('Costo unitario').fill('162.00');
  await lote.getByLabel('Factura del proveedor').fill('F-0099');
  const preview = page.getByTestId('preview-costo');
  await expect(preview).toContainText('$153.00');
  await expect(preview).toContainText('28');
  await page.getByRole('button', { name: 'Confirmar ingreso' }).click();
  await expect(page.getByTestId('comprobante-lote')).toContainText('$148.00 → $153.00');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('producto-BIC-URB-0260')).toContainText('$153.00');
});
