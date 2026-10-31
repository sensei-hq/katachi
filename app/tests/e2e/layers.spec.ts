import { test, expect, type Page } from '@playwright/test';
import { seedProject } from './seed';

/** Layers' next step is a suggestion in the chat (studio column or the phone's chat sheet): Cut the sheets */
async function cutTheSheets(page: Page) {
  if (await page.getByRole('button', { name: 'Open Katachi chat' }).isVisible()) await page.getByRole('button', { name: 'Open Katachi chat' }).click();
  await page.getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
  await expect(page).toHaveURL(/\/make\/output$/);
}

// mockups/desktop D1–D6: nav rail · top bar with six step tabs · left controls · work area · Katachi column
test.describe('image → layers · studio (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(({ page }) => seedProject(page));

  test('the open craft’s steps are rail icons (Layers · Cut · Assemble); old Shape routes open Layers; gaps and reference light Layers', async ({ page }) => {
    await page.goto('/make/cutout'); await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/make\/layers$/);
    const rail = page.getByRole('navigation', { name: 'Studio sections' });
    const craft = rail.getByRole('region', { name: 'Current craft' });
    await expect(craft.getByRole('link', { name: 'Layers' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Craft steps' })).toHaveCount(0);
    await craft.getByRole('link', { name: 'Cut', exact: true }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    await expect(craft.getByRole('link', { name: 'Cut', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goto('/make/gaps'); await page.waitForLoadState('networkidle');
    await expect(craft.getByRole('link', { name: 'Layers' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/make/reference'); await page.waitForLoadState('networkidle');
    await expect(craft.getByRole('link', { name: 'Layers' })).toHaveAttribute('aria-current', 'page');
  });

  test('the work area is the editor; the chat column holds only the conversation and its inline suggestions', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await expect(assistant.getByRole('tab')).toHaveCount(0);
    await expect(assistant.getByRole('region', { name: 'Layer', exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('toolbar', { name: 'Layer tools' })).toBeVisible();
    await expect(assistant.getByRole('log').getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the wall and shadows' })).toBeVisible();
    await expect(assistant.getByRole('log').getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Edit in work area' })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button', { name: /Review gaps/ })).toHaveCount(0);
    // the layer's actions float by its row only (no second set on the work area)
    await expect(page.getByRole('main').getByRole('toolbar', { name: 'Layer actions' })).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('toolbar', { name: 'Layer tools' }).getByRole('button', { name: /Hide|Quote/ })).toHaveCount(0);
  });

  test('layers: pick a layer in the list, its actions float by it; show only this layer; the views', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const list = page.getByLabel('Layer stack, back to front');
    await expect(list.locator('[data-layer-row="4"]').getByRole('toolbar', { name: 'Layer actions' })).toBeVisible();
    await list.getByRole('button', { name: /Hills/ }).first().click();
    await expect(list.locator('[data-layer-row="5"]').getByRole('toolbar', { name: 'Layer actions' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('img', { name: /Layer 5, Hills/ })).toBeVisible();
    await list.getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Show only this layer' }).click();
    await expect(page.getByRole('complementary', { name: 'Katachi chat' })).toContainText('Showing only Hills');
    const view = page.getByRole('main').getByRole('toolbar', { name: 'Layer tools' }).getByRole('radiogroup', { name: 'View' }).or(page.getByRole('main').getByRole('toolbar', { name: 'Layer tools' }).getByRole('group', { name: 'View' }));
    await expect(view.getByRole('radio', { name: 'This layer' })).toHaveAttribute('aria-checked', 'true');
    await view.getByRole('radio', { name: 'All layers' }).click();
    await expect(view.getByRole('radio', { name: 'All layers' })).toHaveAttribute('aria-checked', 'true');
  });

  test('layers: duplicate, merge down and split from the toolbar — each said in the chat, then done there', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const list = page.getByLabel('Layer stack, back to front');
    const toolbar = list.getByRole('toolbar', { name: 'Layer actions' });
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    await list.getByRole('button', { name: /Hills/ }).first().click();
    await expect(toolbar.getByRole('button', { name: 'Split' })).toBeDisabled();
    await toolbar.getByRole('button', { name: 'Duplicate this layer' }).click();
    await expect(list).toContainText('Hills copy');
    await expect(chat.locator('[data-timeline-entry="user"]').last()).toContainText('Duplicate this layer');
    await expect(chat.locator('[data-timeline-entry="user"]').last().locator('[data-quote-card]')).toContainText('Hills');
    await expect(chat).toContainText('Duplicated Hills');
    // merge any two: Merge with… lists the other layers
    await list.getByRole('button', { name: /Sky/ }).first().click();
    await toolbar.getByRole('button', { name: 'Merge with…' }).click();
    await list.getByRole('menu', { name: 'Merge with' }).getByRole('menuitem', { name: /Sun/ }).click();
    await expect(list).toContainText('Sky + Sun');
    await expect(chat).toContainText('Merged Sky with Sun');
    await toolbar.getByRole('button', { name: 'Split' }).click();
    await expect(list).not.toContainText('Sky + Sun');
    await expect(list.getByRole('button', { name: /Sun/ }).first()).toBeVisible();
  });

  test('layers: quote a layer — a card with it sits above the composer, rides with the message, and can be removed', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    const list = page.getByLabel('Layer stack, back to front');
    await list.getByRole('button', { name: /Hills/ }).first().click();
    await list.getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Quote this layer in the chat' }).click();
    const composer = chat.locator('[data-chat-composer]');
    await expect(composer.locator('[data-quote-card]')).toContainText('Hills');
    await composer.getByRole('button', { name: 'Remove the quote' }).click();
    await expect(composer.locator('[data-quote-card]')).toHaveCount(0);
    await list.getByRole('button', { name: /Sky/ }).first().click();
    await list.getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Quote this layer in the chat' }).click();
    await composer.getByRole('textbox').fill('split it in two');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.locator('[data-timeline-entry="user"]').last().locator('[data-quote-card]')).toContainText('Sky');
    // a plain action said in the chat runs (or says why it can't): never just "noted"
    await expect(chat).toContainText('One piece — nothing to split');
    await expect(composer.locator('[data-quote-card]')).toHaveCount(0);
  });

  test('output: cut one sheet at a time — feed, send, verify, next', async ({ page }) => {
    await page.goto('/make/output'); await page.waitForLoadState('networkidle');
    const job = page.getByRole('main').getByRole('region', { name: 'Cutting' });
    await expect(job).toContainText('Sheet 1 of 6');
    await expect(job).toContainText('Feed Apricot cardstock');
    await job.getByRole('button', { name: 'Send sheet 1' }).click();
    await expect(job.getByRole('progressbar')).toBeVisible();
    await expect(job).toContainText('Did it cut cleanly?', { timeout: 10000 });
    await job.getByRole('button', { name: /Looks good/ }).click();
    await expect(job).toContainText('Sheet 2 of 6');
    await expect(job).toContainText('Feed Butter cardstock');
    await expect(page.getByRole('main').getByRole('region', { name: 'Sheets' })).toContainText(/01 · Sky\s*cut/);
    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('radio', { name: /Just the files/ }).check();
    await expect(page.getByRole('main').getByRole('region', { name: 'Cutting' })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button', { name: /Download/ })).toBeVisible();
  });

  test('walks layers → cut: the hidden-parts rule and the device sit beside the sheets', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    await cutTheSheets(page);
    await expect(page.getByRole('main').getByRole('heading', { name: /6 sheets/ })).toBeVisible();
    const side = page.getByRole('complementary', { name: 'Katachi chat' });
    await side.getByRole('radio', { name: /Leave all open/ }).check();
    await expect(side.getByRole('radio', { name: /Leave all open/ })).toBeChecked();
    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('radio', { name: /xTool S1 laser/ }).check();
    await expect(page.getByRole('main').getByRole('button', { name: 'Cut sheet 1' })).toBeVisible();
  });

  test('3D object: six view cards, missing views wait for a photo, parts list beside the chat', async ({ page }) => {
    await page.goto('/make/views'); await page.waitForLoadState('networkidle');
    const views = page.getByRole('region', { name: 'Views', exact: true });
    await expect(views.getByText('Waiting for a photo')).toHaveCount(3);
    await expect(page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('region', { name: 'Parts' })).toContainText('Front');
    await expect(page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('region', { name: 'Parts' })).toContainText('×');
    await expect(page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the parts' })).toBeVisible();
  });

  test('six captured sides unfold into the six-view step', async ({ page }) => {
    await page.goto('/capture'); await page.waitForLoadState('networkidle');
    await page.getByRole('radio', { name: 'Several views' }).click();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByText('All 6 sides captured')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Analyze 6 views' }).click();
    await expect(page).toHaveURL(/\/make\/views$/);
    await expect(page.getByRole('region', { name: 'Views', exact: true })).toContainText('left');
  });
});

// mockups/mobile 01–09: app bar with back · seven-step strip · one column · actions · icon nav at the bottom
test.describe('image → layers · phone (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(({ page }) => seedProject(page));

  test('step strip, back, the layers editor; the icon nav opens the chat', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const strip = page.getByRole('navigation', { name: 'Craft steps' });
    await expect(strip).toContainText('02 / 04 · Layers · items & layers');
    await expect(strip).toContainText('next · cut');
    await expect(page.getByRole('main').getByRole('toolbar', { name: 'Layer tools' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Snap sections' });
    await expect(nav.getByRole('link', { name: 'Layers' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Cut', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Open Katachi chat' }).click();
    await expect(page.getByRole('dialog', { name: 'Katachi chat' }).getByRole('group', { name: 'Suggestions' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Katachi chat' }).getByRole('button', { name: 'Close chat' }).click();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/capture$/);
  });

  test('layers: list with share bars; gaps: radio list and apply-to-all', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: /Hills/ }).first().click();
    await expect(main.getByRole('img', { name: /Layer 5, Hills/ })).toBeVisible();
    await page.goto('/make/gaps'); await page.waitForLoadState('networkidle');
    await main.getByRole('radio', { name: /Leave it open/ }).check();
    await expect(main.getByRole('checkbox', { name: /Use this for all 6 layers/ })).toBeChecked();
    await main.getByRole('button', { name: 'Next layer' }).click();
    await expect(main.getByRole('img', { name: /L6 · Front pines/ })).toBeVisible();
  });
});
