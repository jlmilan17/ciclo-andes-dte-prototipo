import { expect, test } from '@playwright/test';
import { CAJERO, abrirCaja, cobrar, escanear, login, resetDemo, toggleCaida } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F3 ⭐ · caída del MH: tres ventas encoladas, contador 3, restablecer, transmisión automática, contador 0', async ({
  page,
}) => {
  await login(page, CAJERO);
  await abrirCaja(page);
  await page.getByRole('link', { name: 'Punto de venta' }).click();

  await toggleCaida(page, true);
  // Estado 2: el interruptor afecta a todas las pantallas
  await page.getByRole('link', { name: 'Contingencia' }).click();
  await expect(page.getByTestId('chip-mh')).toContainText('MH SIN CONEXIÓN');
  await page.getByRole('link', { name: 'Punto de venta' }).click();

  for (const [i, sku] of ['CAM-MTB-0029', 'LUZ-LED-0055', 'CAS-URB-0114'].entries()) {
    await escanear(page, sku);
    await cobrar(page);
    await expect(page.getByTestId('resultado-titulo')).toHaveText('Venta en contingencia', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('banda-sello')).toContainText(
      'Pendiente · se asignará al transmitir el lote',
    );
    // Estado 3: el contador sube con cada venta en contingencia
    await expect(page.getByTestId('contador-cola')).toContainText(`${i + 1} pend.`);
    // La caja no se traba: nueva venta de inmediato
    await page.keyboard.press('F9');
    await expect(page.getByTestId('pos-buscar')).toBeVisible();
  }

  await page.getByRole('link', { name: 'Contingencia' }).click();
  await expect(page.getByTestId('bandeja-pendientes')).toHaveText('3');

  await toggleCaida(page, false);
  // El worker transmite solo al volver la conexión
  await expect(page.getByTestId('contador-cola')).toContainText('0 pend.', { timeout: 20_000 });
  await expect(page.getByTestId('bandeja-pendientes')).toHaveText('0');
  await expect(page.getByText('Automático')).toBeVisible();

  await page.getByRole('link', { name: 'Historial de DTE' }).click();
  for (const n of ['000000000000006', '000000000000007', '000000000000008']) {
    await expect(page.getByTestId(`fila-DTE-01-M001P001-${n}`)).toContainText('PROCESADO');
  }
});
