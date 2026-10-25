import { expect, test } from '@playwright/test';
import {
  CAJERO,
  abrirCaja,
  apiToken,
  cobrar,
  elegirCliente,
  escanear,
  login,
  resetDemo,
} from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F2 · venta canónica $647.36: retención según receptor, carrito persistente, sello, PDF, JSON y ticket', async ({
  page,
  request,
}) => {
  await login(page, CAJERO);
  await abrirCaja(page);
  await page.getByRole('link', { name: 'Punto de venta' }).click();
  await escanear(page, 'BIC-URB-0260', 2);
  await escanear(page, 'CAS-URB-0114', 2);
  await escanear(page, '7421000550551', 2, 'LUZ-LED-0055'); // código de barras
  await expect(page.getByTestId('total-gravado')).toHaveText('$578.00');

  // Estado 7: el tipo de contribuyente decide la retención
  await expect(page.getByTestId('fila-retencion')).toHaveCount(0);
  await expect(page.getByTestId('tipo-documento')).toHaveText('FCFE · 01');
  await elegirCliente(page, 'rutas');
  await expect(page.getByTestId('total-retencion')).toHaveText('−$5.78');
  await expect(page.getByTestId('tipo-documento')).toHaveText('CCFE · 03');
  await expect(page.getByTestId('total')).toHaveText('$647.36');

  // Estado 1: el carrito sobrevive a abrir y cerrar modales (y a recargar)
  await page.keyboard.press('F4');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('carrito').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('total')).toHaveText('$647.36');

  // Regla 4: superar el stock alerta y no agrega
  await escanear(page, 'BIC-RUT-0700');
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: /Agregar una unidad de Bicicleta de ruta/ }).click();
  await expect(page.getByTestId('alerta-stock')).toBeVisible();
  await expect(page.getByTestId('linea-BIC-RUT-0700').getByTestId('cantidad')).toHaveText('4');
  await page.getByRole('button', { name: /Eliminar Bicicleta de ruta/ }).click();

  await cobrar(page);
  await expect(page.getByTestId('resultado-titulo')).toHaveText('Venta confirmada', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('resultado-total')).toHaveText('$647.36');
  await expect(page.getByTestId('banda-sello')).toContainText(/[0-9A-Z]{40}/);
  await expect(page.getByTestId('pipeline-ms')).toContainText('≤ 3 s');

  // Stock descontado (API)
  const token = await apiToken(request);
  const busca = await request.get('http://localhost:5173/api/productos/buscar?q=BIC-URB-0260', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect((await busca.json()).exact.stock).toBe(16);

  // Ticket, PDF y JSON
  await page.getByRole('button', { name: 'Imprimir ticket' }).click();
  await expect(page.getByTestId('ticket')).toContainText('$647.36');
  await page.keyboard.press('Escape');
  await expect(page.locator('iframe[title="Representación gráfica del DTE"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalle del DTE' }).click();
  await page.getByRole('tab', { name: 'JSON' }).click();
  await expect(page.getByTestId('json-dte')).toContainText('"totalPagar": 647.36');
});
