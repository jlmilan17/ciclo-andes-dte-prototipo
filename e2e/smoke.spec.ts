import { expect, test } from '@playwright/test';

test('la aplicación carga', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ciclo Andes')).toBeVisible();
});
