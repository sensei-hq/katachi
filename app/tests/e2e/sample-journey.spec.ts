import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inviteCode, inviteCodes, hasMetaKey } from './invite';

// One real sample end to end (goal 2026-10-28): samples/layered/setting_sun_circle_scene.webp
// Capture -> Shape (Spark ImageBrief + SAM masks) -> Layers (Spark convert) -> Sheets -> Assemble -> Save,
// then the same invite code restores it and a second invite code (a different user_id) cannot see it.
const sample = readFileSync(new URL('../../../samples/layered/setting_sun_circle_scene.webp', import.meta.url));
const NAME = 'Setting sun circle scene';
const main = (page: Page) => page.getByRole('main');
const activity = (page: Page) => page.getByRole('list', { name: "Katachi's models on this step" });

test.describe('sample journey · live Muse wiring (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(300_000);

  test('one layered sample travels the whole craft journey and persists per invite code', async ({ page, browser }) => {
    const live = hasMetaKey();
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Layered picture/ }).click();
    await expect(page).toHaveURL(/\/capture$/);
    await page.setInputFiles('input[type="file"]', [{ name: 'setting_sun_circle_scene.webp', mimeType: 'image/webp', buffer: sample }]);
    await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();

    // Capture -> Import: Spark sees the real picture (ImageBrief)
    const sceneRes = page.waitForResponse((r) => r.url().includes('/api/scene') && r.request().method() === 'POST', { timeout: 120_000 });
    await main(page).getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/make\/import$/);
    const scene = await (await sceneRes).json();
    if (live) { expect(scene.source).toBe('live'); expect(scene.brief.class).toBe('layered'); expect(scene.brief.regions.length).toBeGreaterThanOrEqual(1); }
    await page.screenshot({ path: 'test-results/sample/01-import.png' });

    // Shape: SAM cutout, then SAM fan-out over the brief's regions
    const cutoutRes = page.waitForResponse((r) => r.url().includes('/api/segment'), { timeout: 120_000 });
    await main(page).getByRole('button', { name: 'Find the outline' }).click();
    await expect(page).toHaveURL(/\/make\/cutout$/);
    if (live) expect((await (await cutoutRes).json()).source).toBe('live');
    await expect(activity(page)).toContainText('SAM 3.1', { timeout: 120_000 });
    if (live) await expect(activity(page)).not.toContainText('placeholder');
    // the stage shows YOUR photo with the traced SAM outline on it, not the fixture illustration
    await expect(main(page).locator('[data-photo-stage]:visible').first()).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => page.locator('[data-photo-stage] path').count(), { timeout: 120_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('complementary', { name: 'Katachi chat' })).toContainText('Outline traced on your photo', { timeout: 120_000 });

    const segRes = page.waitForResponse((r) => r.url().includes('/api/segment'), { timeout: 180_000 });
    await main(page).getByRole('button', { name: 'Find the objects' }).click();
    await expect(page).toHaveURL(/\/make\/segment$/);
    const seg = await (await segRes).json();
    if (live) { expect(seg.source).toBe('live'); expect(seg.regions.length).toBeGreaterThan(2); expect(seg.regions.some((r: { box: unknown }) => r.box)).toBe(true); }
    await page.screenshot({ path: 'test-results/sample/02-segment.png' });

    // Layers: Spark convert plans the pieces; a chat note is kept with the craft
    const planRes = page.waitForResponse((r) => r.url().includes('/api/convert'), { timeout: 180_000 });
    await main(page).getByRole('button', { name: /Separate into layers/ }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    if (live) expect((await (await planRes).json()).source).toBe('live');
    await expect(main(page).locator('[data-photo-stage]:visible').first()).toBeVisible();
    await expect.poll(async () => page.locator('[data-photo-stage] path').count()).toBeGreaterThan(2);
    await expect(main(page)).toContainText('Stacked layers', { timeout: 120_000 });
    await expect(page.getByRole('complementary', { name: 'Katachi chat' })).toContainText('Planned', { timeout: 120_000 });
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    await chat.getByRole('textbox').fill('split the hills in two');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat).toContainText('Noted for Layer');
    await page.screenshot({ path: 'test-results/sample/03-layers.png' });

    // Sheets -> Assemble -> Save
    await main(page).getByRole('button', { name: /gaps/i }).first().click();
    await expect(page).toHaveURL(/\/make\/gaps$/);
    await main(page).getByRole('button', { name: /Stack & cut/ }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    // Sheets: the SAM masks were bit-decoded and traced to closed mm paths (domain/vector)
    if (live) await expect(activity(page)).toContainText('closed paths', { timeout: 120_000 });
    if (live) { await expect(page.locator('[data-sheet-svg]:visible').first()).toBeVisible({ timeout: 120_000 }); await expect.poll(async () => page.locator('[data-sheet-svg] path').count()).toBeGreaterThan(0); }
    await main(page).getByRole('link', { name: 'Assemble' }).click();
    await expect(page).toHaveURL(/\/make\/assemble$/);
    await main(page).getByRole('button', { name: 'Next' }).click();
    await main(page).getByRole('button', { name: 'Save craft' }).click();
    await expect(main(page).getByRole('status')).toContainText('Saved to your crafts');
    await page.screenshot({ path: 'test-results/sample/04-assemble.png' });

    // Saved under this invite code's namespace, and still there after a reload
    const code = inviteCode();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain(`katachi:v1:${code}:projects`);
    await page.goto('/crafts'); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('article', { name: NAME })).toContainText('Finished');
    await page.reload(); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('article', { name: NAME })).toContainText('Finished');

    // A second invite code is a different user: no sign of the first user's craft
    const other = inviteCodes().find((c) => c !== code);
    expect(other, 'set a second code in SNAP_INVITE_CODES for the two-user check').toBeTruthy();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } });
    const p2 = await ctx.newPage();
    await p2.goto('/'); await p2.waitForLoadState('networkidle');
    await p2.getByRole('textbox', { name: /Invite code/ }).fill(other!);
    await p2.getByRole('checkbox', { name: /I confirm I am 18/ }).check();
    await p2.getByRole('checkbox', { name: /never leave my laser unattended/ }).check();
    await p2.getByRole('checkbox', { name: /No personal photos/ }).check();
    await p2.getByRole('button', { name: /enter the workshop/i }).click();
    await expect(p2).toHaveURL(/\/workshop$/);
    await p2.goto('/crafts'); await p2.waitForLoadState('networkidle');
    await expect(p2.getByRole('article', { name: NAME })).toHaveCount(0);
    await ctx.close();
  });
});
