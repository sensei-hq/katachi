import { test, expect, type Page } from '@playwright/test';
import { seedProject } from './seed';

async function next(page: Page, name: RegExp | string, url: RegExp) {
  await page.getByRole('main').getByRole('button', { name }).click();
  await expect(page).toHaveURL(url);
}

// mockups/desktop D1–D6: nav rail · top bar with six step tabs · left controls · work area · Katachi column
test.describe('image → layers · studio (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(({ page }) => seedProject(page));

  test('five journey tabs; cutout and reference light Shape, gaps lights Layers', async ({ page }) => {
    await page.goto('/make/cutout'); await page.waitForLoadState('networkidle');
    const tabs = page.getByRole('navigation', { name: 'Craft steps' });
    await expect(tabs.getByRole('link')).toHaveText([/Capture/, /Shape/, /Layers/, /Sheets/, /Assemble/]);
    await expect(tabs.getByRole('link', { name: /Shape/ })).toHaveAttribute('aria-current', 'step');
    await tabs.getByRole('link', { name: /Layers/ }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    await page.goto('/make/gaps'); await page.waitForLoadState('networkidle');
    await expect(tabs.getByRole('link', { name: /Layers/ })).toHaveAttribute('aria-current', 'step');
    await page.goto('/make/reference'); await page.waitForLoadState('networkidle');
    await expect(tabs.getByRole('link', { name: /Shape/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('navigation', { name: 'Studio sections' })).toBeVisible();
  });

  test('controls sit in the left panel; Katachi talks in the right column with no tabs', async ({ page }) => {
    await page.goto('/make/segment'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    const controls = page.getByRole('complementary', { name: 'Step controls' });
    await expect(assistant.getByRole('tab')).toHaveCount(0);
    await expect(assistant).toContainText('I found 5 regions');
    await expect(assistant.getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Drop the Sky' })).toBeVisible();
    const regions = controls.getByRole('region', { name: 'Regions', exact: true });
    await expect(regions).toContainText('4 of 5 kept');
    await regions.getByRole('switch', { name: 'Sun' }).click();
    await expect(regions).toContainText('3 of 5 kept');
    await page.getByRole('main').getByRole('radio', { name: 'Original' }).click();
    await expect(page.getByRole('main').getByRole('img', { name: /Layered mountain sunset/ })).toBeVisible();
  });

  test('layers: pick a layer on the left, its inspector sits above the chat', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    const inspector = assistant.getByRole('region', { name: 'Layer', exact: true });
    await expect(inspector.getByRole('heading')).toHaveText('Snow ridge');
    await page.getByRole('complementary', { name: 'Step controls' }).getByRole('button', { name: /Hills/ }).click();
    await expect(inspector.getByRole('heading')).toHaveText('Hills');
    await expect(inspector).toContainText('5 of 6');
  });

  test('layers: no row numbers, stack under the list, no paper/wood switch; duplicate, merge down, split', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const controls = page.getByRole('complementary', { name: 'Step controls' });
    const list = controls.getByRole('navigation', { name: 'Layer stack, back to front' });
    await expect(list.getByRole('button').first()).not.toContainText(/^\s*\d/);
    await expect(controls.getByRole('img', { name: 'Exploded stack, back to front' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Paper layers|Laser wood/ })).toHaveCount(0);
    await list.getByRole('button', { name: /Hills/ }).click();
    await expect(controls.getByRole('button', { name: 'Split' })).toBeDisabled();
    await controls.getByRole('button', { name: 'Duplicate' }).click();
    await expect(list).toContainText('Hills copy');
    await list.getByRole('button', { name: /^Sky/ }).click();
    await controls.getByRole('button', { name: 'Merge down' }).click();
    await expect(list).toContainText('Sky + Sun');
    await controls.getByRole('button', { name: 'Split' }).click();
    await expect(list).not.toContainText('Sky + Sun');
    await expect(list.getByRole('button', { name: /^Sun/ })).toBeVisible();
  });

  test('layers: the solid and hidden toggles change what the selected layer shows', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const work = page.getByRole('main');
    await expect(work.getByRole('img', { name: /Snow ridge: visible area solid, hidden area hatched/ })).toBeVisible();
    await work.getByRole('checkbox', { name: 'Hidden behind layers above' }).uncheck();
    await expect(work.getByRole('img', { name: /Snow ridge: visible area solid$/ })).toBeVisible();
    await work.getByRole('checkbox', { name: 'Shows as solid' }).uncheck();
    await expect(work.getByRole('img', { name: /Snow ridge: outline only/ })).toBeVisible();
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

  test('import: describe what you want; Katachi proposes variations in the chat; the pick becomes the plan', async ({ page }) => {
    await page.route('**/api/convert', (r) => r.fulfill({ json: { objective: 'A layered sunset panel', variations: [{ title: 'Night sky', change: 'moon for sun' }, { title: 'Autumn', change: 'warm trees' }] } }));
    await page.goto('/make/import'); await page.waitForLoadState('networkidle');
    const controls = page.getByRole('complementary', { name: 'Step controls' });
    await controls.getByRole('textbox', { name: /What do you want to make of it/ }).fill('a piece for the hallway');
    await controls.getByRole('button', { name: 'Ask Katachi' }).click();
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await expect(assistant).toContainText('A layered sunset panel');
    await assistant.getByRole('button', { name: 'Autumn' }).click();
    await expect(controls).toContainText('Plan: Autumn — warm trees');
  });

  test('walks import → output', async ({ page }) => {
    await page.goto('/make/import'); await page.waitForLoadState('networkidle');
    const controls = page.getByRole('complementary', { name: 'Step controls' });
    await expect(controls.getByRole('radio', { name: /Flat · layered art/ })).toBeChecked();
    await expect(page.getByRole('main').getByRole('link', { name: 'Retake' })).toBeVisible();
    await next(page, 'Find the outline', /\/make\/cutout$/);
    await next(page, 'Find the objects', /\/make\/segment$/);
    await next(page, /Separate into layers/, /\/make\/layers$/);
    await next(page, /Review all gaps/, /\/make\/gaps$/);
    await expect(page.getByRole('main').getByRole('heading', { name: 'Fill what the photo can’t see' })).toBeVisible();
    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('radio', { name: /Leave all open/ }).check();
    await expect(page.getByRole('main').getByRole('button', { name: /L1 Sky: open/ })).toBeVisible();
    await next(page, /Stack & cut/, /\/make\/output$/);
    await expect(page.getByRole('main').getByRole('heading', { name: /6 sheets/ })).toBeVisible();
    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('radio', { name: /xTool S1 laser/ }).check();
    await expect(page.getByRole('main').getByRole('button', { name: 'Cut sheet 1' })).toBeVisible();
  });

  test('3D object: six view cards, missing views wait for a photo, parts list beside the chat', async ({ page }) => {
    await page.goto('/make/views'); await page.waitForLoadState('networkidle');
    const views = page.getByRole('region', { name: 'Views', exact: true });
    await expect(views.getByText('Waiting for a photo')).toHaveCount(3);
    await expect(page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('region', { name: 'Parts' })).toContainText('Front · back');
    await expect(page.getByRole('main').getByRole('button', { name: /Build with 3 views/ })).toBeVisible();
  });

  test('six captured sides unfold into the six-view step', async ({ page }) => {
    await page.goto('/capture'); await page.waitForLoadState('networkidle');
    await page.getByRole('radio', { name: '6 sides' }).click();
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByText('All 6 sides captured')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Unfold into parts' }).click();
    await expect(page).toHaveURL(/\/make\/views$/);
    await expect(page.getByRole('region', { name: 'Views', exact: true })).toContainText('Left');
  });
});

// mockups/mobile 01–09: app bar with back · seven-step strip · one column · actions · icon nav at the bottom
test.describe('image → layers · phone (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(({ page }) => seedProject(page));

  test('step strip, back, inline controls and Katachi note; the icon nav opens the chat', async ({ page }) => {
    await page.goto('/make/import'); await page.waitForLoadState('networkidle');
    const strip = page.getByRole('navigation', { name: 'Craft steps' });
    await expect(strip).toContainText('02 / 05 · Shape · what it is');
    await expect(strip).toContainText('next · layers');
    await expect(page.getByRole('main').getByRole('radio', { name: /Flat · layered art/ })).toBeVisible();
    await next(page, 'Find the outline', /\/make\/cutout$/);
    await next(page, 'Find the objects', /\/make\/segment$/);
    await expect(strip).toContainText('02 / 05 · Shape · parts');
    const main = page.getByRole('main');
    await expect(main.getByRole('note', { name: 'Katachi' })).toContainText('I found 5 regions');
    await main.getByRole('region', { name: 'Regions', exact: true }).getByRole('switch', { name: 'Sky' }).click();
    await expect(main.getByRole('region', { name: 'Regions', exact: true })).toContainText('3 of 5 kept');
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/make\/cutout$/);
    const nav = page.getByRole('navigation', { name: 'Snap sections' });
    await expect(nav.getByRole('link', { name: 'Current craft' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Open Katachi chat' }).click();
    await expect(page.getByRole('dialog', { name: 'Katachi chat' })).toContainText('Background removed');
  });

  test('layers: list with share bars; gaps: radio list and apply-to-all', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: /Hills/ }).click();
    await expect(main.getByRole('img', { name: /Layer 5, Hills/ })).toBeVisible();
    await next(page, 'Fill the gaps', /\/make\/gaps$/);
    await main.getByRole('radio', { name: /Leave it open/ }).check();
    await expect(main.getByRole('checkbox', { name: /Use this for all 6 layers/ })).toBeChecked();
    await main.getByRole('button', { name: 'Next layer' }).click();
    await expect(main.getByRole('img', { name: /L6 · Front pines/ })).toBeVisible();
  });
});
