import { test, expect, type Page } from '@playwright/test';
import { hasMetaKey } from '../e2e/invite';
import { beginFilm, chapter, showCaption, pause, finishFilm } from './director';
import { replayBookmarks, sample } from './replay';

// REC 1:15–1:33 · five wooden bookmarks: found, straightened, hidden edges rebuilt, the laser run.
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

test('bookmarks film', async ({ page }) => {
  beginFilm('bookmarks');
  const replayed = process.env.FILM_REPLAY === '1' || !(process.env.FILM_LIVE === '1' || hasMetaKey());
  if (replayed) await replayBookmarks(page);

  await showCaption(page, 'Five overlapping bookmarks');
  await chapter(page, '1:15', 'Found 5 items: see-through holes told apart from engraving');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample('multiple/bookmarks.avif') }]);
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  await expect(step(page, /Found \d+ items/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Straightened, and the hidden edge rebuilt');
  await chapter(page, '1:22', 'Each bookmark on its own sheet, upright; the whale’s hidden edge filled in');
  await expect(step(page, /Each of the \d+ items is on its own sheet, upright/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2000);
  // live may find nothing hidden (the replay always hides the whale): wait briefly, film on either way
  const hidden = step(page, /Filled in the hidden edges of/);
  await hidden.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => console.log('FILM NOTE: no hidden-edges step (live found nothing hidden)'));
  if (await hidden.isVisible().catch(() => false)) await expect(hidden).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Engraving first, then the holes, then the outline');
  await chapter(page, '1:28', 'The laser bed at 1×: engraving, holes, outline, G-code scrolling');
  await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
  await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
  await expect(step(page, /Added \d+ sheets? to the cut queue/)).toBeVisible({ timeout: 90_000 });
  await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
  await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
  const bed = main(page).getByRole('region', { name: 'On the bed' });
  const queue = main(page).getByRole('complementary', { name: 'Queue' });
  await expect(bed.locator('[data-program]')).toBeVisible({ timeout: 30_000 });
  await pause(1500);
  await queue.getByRole('button', { name: 'Start' }).click();
  await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 300_000 });
  await pause(2000);
  await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
  await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
  const together = main(page).getByRole('region', { name: 'Putting it together' });
  await together.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '2×' }).click();
  await together.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(together).toContainText('The finished piece', { timeout: 120_000 });
  await pause(2000);

  await finishFilm(page, 'bookmarks', replayed);
});
