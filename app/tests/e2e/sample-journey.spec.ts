import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inviteCode, inviteCodes, hasMetaKey } from './invite';
import { uploadFromHome } from './start';

// One real sample end to end (goal 2026-10-28): samples/layered/setting_sun_circle_scene.webp
// Capture -> Analyze (Spark ImageBrief, SAM outline, colour layers, Spark convert) on Layers -> Sheets -> Assemble -> Save,
// then the same invite code restores it and a second invite code (a different user_id) cannot see it.
const sample = readFileSync(new URL('../../../samples/layered/setting_sun_circle_scene.webp', import.meta.url));
const NAME = 'Setting sun circle scene';
const main = (page: Page) => page.getByRole('main');
// what the models did: each call is shown in the chat timeline, on its step or as its own row
const activity = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('log');

test.describe('sample journey · live Muse wiring (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(300_000);

  test('one layered sample travels the whole craft journey and persists per invite code', async ({ page, browser }) => {
    const live = hasMetaKey();
    await uploadFromHome(page, [{ name: 'setting_sun_circle_scene.webp', mimeType: 'image/webp', buffer: sample }]);
    await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();

    // Capture -> Analyze -> Layers: Spark sees the real picture, the background goes, the colour layers are measured, Spark names them
    const sceneRes = page.waitForResponse((r) => r.url().includes('/api/scene') && r.request().method() === 'POST', { timeout: 120_000 });
    const cutoutRes = page.waitForResponse((r) => r.url().includes('/api/segment'), { timeout: 120_000 });
    const planRes = page.waitForResponse((r) => r.url().includes('/api/convert'), { timeout: 240_000 });
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    const scene = await (await sceneRes).json();
    if (live) { expect(scene.source).toBe('live'); expect(scene.brief.class).toBe('layered'); expect(scene.brief.regions.length).toBeGreaterThanOrEqual(1); }
    if (live) expect((await (await cutoutRes).json()).source).toBe('live');
    const steps = page.getByRole('complementary', { name: 'Katachi chat' }).locator('[data-timeline-entry="step"]');
    await expect(steps.filter({ hasText: 'Background removed' }).locator('[data-model-call]').filter({ hasText: 'SAM 3.1' }).first()).toBeVisible({ timeout: 120_000 });
    if (live) await expect(activity(page)).not.toContainText('placeholder');
    // the stage shows YOUR photo, then its layers on it, not the fixture illustration
    await expect(main(page).locator('[data-photo-stage]:visible').first()).toBeVisible({ timeout: 120_000 });
    await page.screenshot({ path: 'test-results/sample/01-analyze.png' });
    // one stacked piece: its layers are colour groups measured in code inside the outline (no SAM call per phrase)
    await expect(steps.filter({ hasText: /Split into \d+ layers by colour/ })).toHaveAttribute('data-step-status', 'done', { timeout: 180_000 });
    if (live) expect((await (await planRes).json()).source).toBe('live');
    await expect.poll(async () => main(page).locator('[data-work-area] [data-photo-stage] path').count()).toBeGreaterThan(2);
    await expect(page.getByLabel('Layer stack, back to front').locator('[data-layer-row]').first()).toBeVisible({ timeout: 120_000 });
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    await chat.locator('[data-chat-composer]').getByRole('textbox').fill('split the hills in two');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat).toContainText('Noted for ');
    await page.screenshot({ path: 'test-results/sample/03-layers.png' });

    // Sheets -> Assemble -> Save
    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    // Sheets: the SAM masks were bit-decoded and traced to closed mm paths (domain/vector)
    if (live) await expect(activity(page)).toContainText('closed paths', { timeout: 120_000 });
    if (live) { await expect(page.locator('[data-sheet-svg]:visible').first()).toBeVisible({ timeout: 120_000 }); await expect.poll(async () => page.locator('[data-sheet-svg] path').count()).toBeGreaterThan(0); }
    await page.getByRole('link', { name: 'Assemble', exact: true }).locator('visible=true').first().click();
    await expect(page).toHaveURL(/\/make\/assemble$/);
    await main(page).getByRole('button', { name: 'Next' }).click();
    await main(page).getByRole('button', { name: 'Save craft' }).click();
    await expect(main(page).getByRole('status')).toContainText('Saved to your crafts');
    await page.screenshot({ path: 'test-results/sample/04-assemble.png' });

    // Saved under this invite code's namespace, and still there after a reload
    const code = inviteCode();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain(`katachi:v1:${code}:projects`);
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
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
    await p2.goto('/workshop'); await p2.waitForLoadState('networkidle');
    await expect(p2.getByRole('article', { name: NAME })).toHaveCount(0);
    await ctx.close();
  });
});
