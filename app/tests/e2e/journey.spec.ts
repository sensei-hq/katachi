import { test, expect, type Page } from '@playwright/test';
import { cameraFromHome, uploadFromHome } from './start';

// The craft journey end to end (docs/design/07 §1), studio and phone. Screenshots of every step land in
// test-results/journey/ so the design review compares the running app, not a mock.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/journey/${test.info().project.name || 'chromium'}-${page.viewportSize()!.width}-${name}.png` });
const main = (page: Page) => page.getByRole('main');

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const studio = viewport.width >= 1024;
  test.describe(`craft journey · ${viewport.width}px`, () => {
    test.use({ viewport });

    test('Home (Upload) → Capture → Analyze → Layers → Cut → Assemble → saved, back on Home', async ({ page }) => {
      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Start a craft' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your crafts' })).toContainText('Nothing here yet');
      // no craft open: the rail has no craft steps yet
      await expect(page.getByRole('link', { name: 'Cut', exact: true })).toHaveCount(0);
      await shot(page, '00-home');

      await uploadFromHome(page, [{ name: 'lake-at-dusk.png', mimeType: 'image/png', buffer: png }]);
      if (!studio) await expect(page.getByRole('navigation', { name: 'Craft steps' })).toContainText('01 / 04 · Capture');
      await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();
      await shot(page, '01-capture');
      await main(page).getByRole('button', { name: 'Analyze' }).click();

      // one press: Layers opens and works it out live — each stage a step in the chat with its model
      await expect(page).toHaveURL(/\/make\/layers$/);
      if (studio) {
        const chat = page.getByRole('complementary', { name: 'Katachi chat' });
        // (a 1-pixel photo has no outline to find: the step says so, with the SAM call it made)
        await expect(chat.locator('[data-timeline-entry="step"]').filter({ hasText: /Background removed|Outline not found/ }).locator('[data-model-call]').filter({ hasText: 'SAM 3.1' }).first()).toBeVisible({ timeout: 60_000 });
        await shot(page, '02-analyze');
      }
      await expect(page.getByLabel('Layer stack, back to front').locator('[data-layer-row]').first()).toBeVisible({ timeout: 120_000 });
      await expect(main(page).getByRole('toolbar', { name: 'Layer tools' })).toBeVisible();

      // a chat note on a layer is kept with the craft
      if (studio) {
        const chat = page.getByRole('complementary', { name: 'Katachi chat' });
        await chat.locator('[data-chat-composer]').getByRole('textbox').fill('split the hills in two');
        await chat.getByRole('button', { name: 'Send' }).click();
        await expect(chat).toContainText('Noted for ');
      }
      await shot(page, '03-layers');
      // next steps are suggestions in the chat (the work area has no step buttons)
      if (!studio) await page.getByRole('button', { name: 'Open Katachi chat' }).click();
      await page.getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
      await expect(page).toHaveURL(/\/make\/output$/);
      await shot(page, '04-sheets');
      await page.getByRole('link', { name: 'Assemble', exact: true }).locator('visible=true').first().click();

      await expect(page).toHaveURL(/\/make\/assemble$/);
      await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText('Lay out the sheets back to front');
      await main(page).getByRole('button', { name: 'Next' }).click();
      // the first layer lifts off its card and lands on the stage; its card lights up
      await expect(main(page).getByRole('heading', { level: 2 }).first()).toHaveText(/^1 · /);
      await expect(main(page).getByRole('region', { name: 'Layers to stack' }).getByRole('article').first()).toHaveAttribute('aria-current', 'step');
      await shot(page, '05-assemble');
      await main(page).getByRole('button', { name: 'Save craft' }).click();
      await expect(main(page).getByRole('status')).toContainText('Saved to your crafts');

      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      const card = page.getByRole('article', { name: 'Lake at dusk' });
      await expect(card).toContainText('Finished');
      await shot(page, '06-crafts');
      await page.getByRole('radio', { name: 'In progress' }).click();
      await expect(page.getByRole('article', { name: 'Lake at dusk' })).toHaveCount(0);
    });

    test('Camera: several views (not six) open Layers on parts & joins; sketch it: draw, use, analyze', async ({ page }) => {
      await cameraFromHome(page);
      await page.getByRole('radio', { name: 'Several views' }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Take photo' }).click();
      await main(page).getByRole('button', { name: 'Analyze 3 views' }).click();
      await expect(page).toHaveURL(/\/make\/views$/);
      // the craft's steps are in the rail now, Layers current
      await expect(page.getByRole('link', { name: 'Layers', exact: true }).locator('visible=true').first()).toHaveAttribute('aria-current', 'page');
      if (!studio) await expect(page.getByRole('navigation', { name: 'Craft steps' })).toContainText('02 / 04 · Layers · parts & joins');

      await page.goto('/workshop'); await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'sketch it' }).click();
      const pad = page.getByLabel(/Sketch pad/);
      const box = (await pad.boundingBox())!;
      const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
      await page.mouse.move(cx - 60, cy - 40); await page.mouse.down();
      await page.mouse.move(cx + 60, cy + 30, { steps: 8 }); await page.mouse.up();
      await main(page).getByRole('button', { name: 'Use this sketch' }).click();
      await main(page).getByRole('button', { name: 'Analyze' }).click();
      await expect(page).toHaveURL(/\/make\/layers$/);
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
    // phones tell the whole story too: your picture → the models → the layers → the models → cut & assembled
    for (const stepName of ['picture', 'see', 'make', 'finished']) await expect(page.locator(`[data-hero-step="${stepName}"]`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter the workshop' })).toBeVisible();
    await page.screenshot({ path: `test-results/journey/landing-${viewport.width}.png`, fullPage: true });
    await ctx.close();
  }
});
