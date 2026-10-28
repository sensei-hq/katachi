import { test, expect, type Page } from '@playwright/test';

// The craft journey end to end (docs/design/07 §1), studio and phone. Screenshots of every step land in
// test-results/journey/ so the design review compares the running app, not a mock.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/journey/${test.info().project.name || 'chromium'}-${page.viewportSize()!.width}-${name}.png` });
const main = (page: Page) => page.getByRole('main');

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const studio = viewport.width >= 1024;
  test.describe(`craft journey · ${viewport.width}px`, () => {
    test.use({ viewport });

    test('Home → Capture → Shape → Layers → Sheets → Assemble → saved in Crafts', async ({ page }) => {
      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Start a craft' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Recent crafts' })).toContainText('Nothing here yet');
      await shot(page, '00-home');

      await page.getByRole('button', { name: /Layered picture/ }).click();
      await expect(page).toHaveURL(/\/capture$/);
      if (studio) await expect(page.getByRole('navigation', { name: 'Craft steps' }).getByRole('link', { name: /Capture/ })).toHaveAttribute('aria-current', 'step');
      else await expect(page.getByRole('navigation', { name: 'Craft steps' })).toContainText('01 / 05 · Capture');
      await page.setInputFiles('input[type="file"]', [{ name: 'lake-at-dusk.png', mimeType: 'image/png', buffer: png }]);
      await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();
      await shot(page, '01-capture');
      await main(page).getByRole('button', { name: 'Continue' }).click();

      await expect(page).toHaveURL(/\/make\/import$/);
      await expect(page.getByRole('list', { name: 'Katachi\'s models on this step' })).toHaveCount(0);
      await main(page).getByRole('button', { name: 'Find the outline' }).click();
      await expect(page.getByRole('list', { name: 'Katachi\'s models on this step' })).toContainText('SAM 3.1');
      await expect(page.getByRole('list', { name: 'Katachi\'s models on this step' })).toContainText('placeholder');
      if (studio) {
        const call = page.getByRole('complementary', { name: 'Katachi chat' }).locator('[data-model-call]').filter({ hasText: 'SAM 3.1' }).first();
        await expect(call).toContainText('est. $0.0025');
        await expect(call).toContainText('placeholder');
      }
      await shot(page, '02-shape');
      await main(page).getByRole('button', { name: 'Find the objects' }).click();
      await main(page).getByRole('button', { name: /Separate into layers/ }).click();
      await expect(page).toHaveURL(/\/make\/layers$/);
      await expect(page.getByRole('navigation', { name: 'Layer stack, back to front' }).getByRole('button').first()).toBeVisible({ timeout: 120_000 });
      await expect(main(page)).toContainText('Stacked layers');

      // a chat note on a layer is kept with the craft
      if (studio) {
        const chat = page.getByRole('complementary', { name: 'Katachi chat' });
        await chat.getByRole('textbox').fill('split the hills in two');
        await chat.getByRole('button', { name: 'Send' }).click();
        await expect(chat).toContainText('Noted for Layer');
      }
      await shot(page, '03-layers');
      await main(page).getByRole('button', { name: /gaps/i }).first().click();
      await expect(page).toHaveURL(/\/make\/gaps$/);
      await main(page).getByRole('button', { name: /Stack & cut/ }).click();
      await expect(page).toHaveURL(/\/make\/output$/);
      await shot(page, '04-sheets');
      await main(page).getByRole('link', { name: 'Assemble' }).click();

      await expect(page).toHaveURL(/\/make\/assemble$/);
      await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText('Lay out the sheets back to front');
      await main(page).getByRole('button', { name: 'Next' }).click();
      await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText(/Sheet 01 · .+ is the back/);
      if (studio) await expect(page.getByRole('complementary', { name: 'Assembly steps' })).toContainText('split the hills in two');
      await shot(page, '05-assemble');
      await main(page).getByRole('button', { name: 'Save craft' }).click();
      await expect(main(page).getByRole('status')).toContainText('Saved to your crafts');

      await page.goto('/crafts'); await page.waitForLoadState('networkidle');
      const card = page.getByRole('article', { name: 'Lake at dusk' });
      await expect(card).toContainText('Finished');
      await shot(page, '06-crafts');
      await page.getByRole('radio', { name: 'In progress' }).click();
      await expect(page.getByRole('article', { name: 'Lake at dusk' })).toHaveCount(0);
    });

    test('3D object: six sides open Layers on parts & joins; Sketch it: draw, use, continue', async ({ page }) => {
      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /3D object/ }).click();
      for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Take photo' }).click();
      await main(page).getByRole('button', { name: 'Unfold into parts' }).click();
      await expect(page).toHaveURL(/\/make\/views$/);
      if (studio) await expect(page.getByRole('navigation', { name: 'Craft steps' }).getByRole('link', { name: /Layers/ })).toHaveAttribute('aria-current', 'step');
      else await expect(page.getByRole('navigation', { name: 'Craft steps' })).toContainText('03 / 05 · Layers · parts & joins');

      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /Sketch it/ }).click();
      const pad = page.getByLabel(/Sketch pad/);
      const box = (await pad.boundingBox())!;
      const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
      await page.mouse.move(cx - 60, cy - 40); await page.mouse.down();
      await page.mouse.move(cx + 60, cy + 30, { steps: 8 }); await page.mouse.up();
      await main(page).getByRole('button', { name: 'Use this sketch' }).click();
      await main(page).getByRole('button', { name: 'Continue' }).click();
      await expect(page).toHaveURL(/\/make\/import$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Sketch · /);
    });
  });
}

test('landing: what it makes, how the Muse models do it, and the gate', async ({ browser }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/'); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('img', { name: /split into its cut layers/ })).toBeVisible();
    const how = page.getByRole('region', { name: 'How it works' });
    await expect(how.getByRole('listitem')).toHaveCount(5);
    await expect(how).toContainText('SAM 3.1');
    await expect(page.getByRole('button', { name: 'Enter the workshop' })).toBeVisible();
    await page.screenshot({ path: `test-results/journey/landing-${viewport.width}.png`, fullPage: true });
    await ctx.close();
  }
});
