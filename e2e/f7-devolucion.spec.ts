import { expect, test } from '@playwright/test';
import { ADMIN, login, resetDemo, toggleCaida } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

async function abrirNce(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Historial de DTE' }).click();
  await page.getByTestId('fila-DTE-03-M001P001-000000000000005').click();
  await page.getByRole('button', { name: 'Emitir NCE' }).click();
  await expect(page.getByRole('heading', { name: 'Nota de crédito electrónica' })).toBeVisible();
}

test('F7 · NCE parcial con tope respetado, sellada; con MH caído se encola', async ({ page }) => {
  await login(page, ADMIN);
  await abrirNce(page);
  // Tope: ya se devolvió 1 de 2 cascos
  await page.getByLabel(/Cantidad a devolver de Casco/).fill('2');
  await expect(page.getByRole('alert')).toContainText('supera lo disponible');
  await expect(page.getByTestId('emitir-nce')).toBeDisabled();
  await page.getByLabel(/Cantidad a devolver de Casco/).fill('1');
  await page.getByLabel(/Cantidad a devolver de Bicicleta/).fill('1');
  await expect(page.getByTestId('nce-total')).toHaveText('$507.36');
  await page.getByTestId('emitir-nce').click();
  await expect(page.getByTestId('resultado-titulo')).toHaveText('Nota de crédito emitida', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('banda-sello')).toContainText(/[0-9A-Z]{40}/);

  await toggleCaida(page, true);
  await abrirNce(page);
  await page.getByLabel(/Cantidad a devolver de Juego de luces/).fill('1');
  await page.getByTestId('emitir-nce').click();
  await expect(page.getByTestId('resultado-titulo')).toHaveText('Nota de crédito en contingencia', {
    timeout: 10_000,
  });
  await toggleCaida(page, false);
});
