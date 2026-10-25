import { expect, test } from '@playwright/test';
import { CAJERO, apiToken, login, resetDemo } from './helpers';

test.beforeEach(async ({ request }) => resetDemo(request));

test('F8 · el Cajero ve "Acceso denegado" por URL y el API responde 403', async ({
  page,
  request,
}) => {
  await login(page, CAJERO);
  await expect(page.getByTestId('rail').getByRole('link')).toHaveCount(4);
  for (const ruta of ['/catalogo', '/resumen', '/usuarios']) {
    await page.goto(ruta);
    await expect(page.getByTestId('acceso-denegado')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/caja\/apertura$/);

  const token = await apiToken(request, CAJERO);
  for (const path of ['/productos', '/resumen', '/usuarios']) {
    const r = await request.get(`http://localhost:5173/api${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.status()).toBe(403);
  }
});
