import { test, expect, type Page } from '@playwright/test';
import { hasMetaKey } from '../e2e/invite';
import { beginFilm, chapter, showCaption, pause, finishFilm } from './director';
import { replayCastle, sample } from './replay';

// REC 1:55–2:12 · the castle kit: five photos sorted, the plan read, sheets cut.
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

test('castle film', async ({ page }) => {
  beginFilm('castle');
  const replayed = process.env.FILM_REPLAY === '1' || !(process.env.FILM_LIVE === '1' || hasMetaKey());
  if (replayed) await replayCastle(page);

  await showCaption(page, 'Five photos of a castle kit');
  await chapter(page, '1:55', 'Views sorted: front, three-quarter, close-up, top, cut plan');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [1, 2, 3, 4, 5].map((i) => ({ name: `castle_${i}.webp`, mimeType: 'image/webp', buffer: sample(`3D/castle/castle_${i}.webp`) })));
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  await expect(page).toHaveURL(/\/make\/views$/, { timeout: 90_000 });
  await expect(main(page).locator('figure[data-picture] img')).toHaveCount(5, { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Eleven sheets, over two hundred pieces');
  await chapter(page, '2:02', '"Read 11 sheets from your cut plan"');
  await expect(step(page, 'Read 11 sheets from your cut plan')).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'The sheets, cut at 1×');
  // 2:07 in the script adds the SVG/DXF download — the buttons land with L3, so the film shows Cut as it is.
  await chapter(page, '2:07', 'The sheets in Cut; one sheet runs at 1×');
  await chat(page).getByRole('button', { name: 'Cut the parts' }).click();
  await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
  await expect.poll(async () => page.locator('[data-sheet-svg]').count(), { timeout: 90_000 }).toBeGreaterThanOrEqual(11);
  await pause(2000);
  await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
  await expect(step(page, /Added \d+ sheets? to the cut queue/)).toBeVisible({ timeout: 90_000 });
  await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
  await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
  const bed = main(page).getByRole('region', { name: 'On the bed' });
  const queue = main(page).getByRole('complementary', { name: 'Queue' });
  await pause(1500);
  await queue.getByRole('button', { name: 'Start' }).click();
  await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 300_000 });
  await pause(2000);
  // Assemble for a kit is its steps, not the stack animation: show them.
  await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
  await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
  await pause(3000);

  await finishFilm(page, 'castle', replayed);
});
