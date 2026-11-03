import { test, expect } from '@playwright/test';
import { seedProject } from './seed';

test.describe('three parts: nav · work area · assistant (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('the Katachi mark appears once, in the nav; the bot speaks only in the assistant', async ({ page }) => {
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-brand-mark]:visible')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Studio sections' }).locator('[data-brand-mark]')).toBeVisible();
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await expect(assistant).toContainText('what are we making today');
    await expect(page.getByRole('main')).not.toContainText('what are we making today');
  });
  test('the composer sends with its arrow button (Rokkit ChatComposer toolbar); the voice button sits beside it', async ({ page }) => {
    await seedProject(page);
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await assistant.locator('[data-chat-composer]').getByRole('textbox').fill('merge sun and sky');
    await assistant.getByRole('button', { name: 'Send' }).click();
    await expect(assistant.getByRole('log')).toContainText('merge sun and sky');
    await expect(assistant.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  });
  test('the assistant is Rokkit ChatShell with a timeline: Katachi and you each have an icon, suggestions sit inline after the last entry', async ({ page }) => {
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await expect(assistant.locator('[data-chat-shell]')).toHaveCount(1);
    await expect(assistant.locator('[data-timeline-entry="katachi"]').first()).toContainText('what are we making today');
    await expect(assistant.getByRole('log').getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'A layered mountain picture' })).toBeVisible();
    await expect(assistant.locator('[data-chat-composer]').getByRole('button', { name: 'Send' })).toBeVisible();
  });
  test('on Home, what you type starts a craft: Katachi replies in the assistant and Capture opens set up for it', async ({ page }) => {
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    const assistant = page.getByRole('complementary', { name: 'Katachi chat' });
    await assistant.locator('[data-chat-composer]').getByRole('textbox').fill('a birdhouse like the one in the garden');
    await assistant.getByRole('button', { name: 'Send' }).click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(assistant).toContainText('a birdhouse like the one in the garden');
    await expect(assistant).toContainText('any number, in any order');
    await expect(page.getByRole('radio', { name: 'Several views' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('phone (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the mark sits in the nav bar once; the assistant opens as a sheet', async ({ page }) => {
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-brand-mark]:visible')).toHaveCount(1);
    await expect(page.getByRole('main')).not.toContainText('what are we making today');
    await page.getByRole('button', { name: 'Open Katachi chat' }).click();
    await expect(page.getByRole('dialog', { name: 'Katachi chat' })).toContainText('what are we making today');
  });
});
