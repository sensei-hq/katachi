import { expect, type Page } from '@playwright/test';

// Starting a craft from Home (design/11): the Upload tile picks pictures and opens Capture with them; the Camera
// tile opens Capture on the camera. The first visit after a dev-server restart can still be hydrating: retry.
export async function uploadFromHome(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await expect(async () => {
    await page.setInputFiles('input[aria-label="Upload pictures"]', files);
    await expect(page).toHaveURL(/\/capture$/, { timeout: 5000 });
  }).toPass({ timeout: 30_000 });
}
export async function cameraFromHome(page: Page) {
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await expect(async () => { await page.locator('[data-start="camera"]').click(); await expect(page).toHaveURL(/\/capture$/, { timeout: 3000 }); }).toPass({ timeout: 30_000 });
}
