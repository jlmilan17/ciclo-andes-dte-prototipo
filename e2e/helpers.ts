import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'Demo2026!';
export const CAJERO = 'jose.hernandez@cicloandes.test';
export const ADMIN = 'daniela.reina@cicloandes.test';
export const CAJERO_PRUEBA = 'marta.lopez@cicloandes.test';

const API = 'http://localhost:5173/api';

export async function apiToken(request: APIRequestContext, correo = ADMIN): Promise<string> {
  const r = await request.post(`${API}/auth/login`, { data: { correo, password: PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).token;
}

/** Restablece los datos de demostración (POST /sim/reset) y deja el MH en línea. */
export async function resetDemo(request: APIRequestContext) {
  const r = await request.post(`${API}/auth/demo-role`, { data: { rol: 'ADMIN' } });
  const { token } = await r.json();
  const reset = await request.post(`${API}/sim/reset`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(reset.ok()).toBeTruthy();
}

export async function login(page: Page, correo: string, password = PASSWORD) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

export async function abrirCaja(page: Page) {
  await expect(page.getByRole('heading', { name: 'Apertura de caja' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByTestId('chip-caja')).toContainText('ABIERTA');
}

/** Agrega un producto escribiendo su SKU y Enter (como un lector de código de barras). */
export async function escanear(page: Page, codigo: string, veces = 1, sku = codigo) {
  for (let i = 0; i < veces; i++) {
    await page.getByTestId('pos-buscar').fill(codigo);
    await page.getByTestId('pos-buscar').press('Enter');
    await expect(page.getByTestId(`linea-${sku}`).getByTestId('cantidad')).toHaveText(
      String(i + 1),
    );
  }
}

export async function elegirCliente(page: Page, texto: string) {
  await page.keyboard.press('F4');
  const dlg = page.getByRole('dialog', { name: 'Buscar cliente' });
  await dlg.getByLabel('Buscar cliente').fill(texto);
  await expect(dlg.getByRole('option').first()).toContainText(new RegExp(texto, 'i'));
  await dlg.getByLabel('Buscar cliente').press('Enter');
  await expect(dlg).toBeHidden();
}

export async function cobrar(page: Page) {
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog', { name: 'Cobro' })).toBeVisible();
  await page.getByTestId('confirmar-emitir').click();
}

export async function toggleCaida(page: Page, caido: boolean) {
  const sw = page.getByTestId('toggle-caida');
  if ((await sw.getAttribute('aria-checked')) !== String(caido)) await sw.click();
  await expect(page.getByTestId('chip-mh')).toContainText(
    caido ? 'MH SIN CONEXIÓN' : 'MH EN LÍNEA',
    { timeout: 10_000 },
  );
}
