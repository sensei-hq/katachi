import { test, expect, type Page } from '@playwright/test';
import { hasMetaKey } from '../e2e/invite';
import { beginFilm, chapter, showCaption, humanType, pause, finishFilm } from './director';
import { replayCat, sample } from './replay';

// REC 0:55–1:13 · the layered cat: upload, Analyze, exploded view, finer whiskers, the queue run, Assemble.
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();
const composer = (page: Page) => chat(page).locator('[data-chat-composer]').getByRole('textbox');

test('cat film', async ({ page }) => {
  beginFilm('cat');
  const replayed = process.env.FILM_REPLAY === '1' || !(process.env.FILM_LIVE === '1' || hasMetaKey());
  if (replayed) await replayCat(page);
  const photo = sample('layered/layered_floral_black_cat_wall_art.jpg.avif');

  await showCaption(page, 'A layered paper cat');
  await chapter(page, '0:55', 'Upload the cat photo, Analyze: the wall goes, then the colour layers');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [{ name: 'cat.avif', mimeType: 'image/avif', buffer: photo }]);
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  await expect(step(page, 'Background removed')).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await expect(step(page, /Split into \d layers by colour/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Ask for finer whiskers');
  await chapter(page, '1:03', 'The exploded view lifts the layers; "make the whiskers finer" re-measures one');
  await main(page).getByRole('toolbar', { name: 'Layer tools' }).getByRole('radio', { name: 'Exploded' }).click();
  await expect(main(page).locator('[data-exploded-photo] [data-exploded-layer]').first()).toBeVisible({ timeout: 30_000 });
  await pause(2000);
  await humanType(page, composer(page), 'make the whiskers finer');
  await expect(step(page, /kept the fine detail/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Each sheet is cut, then they stack');
  await chapter(page, '1:08', 'The cut queue runs a sheet at 1×; Assemble stacks the layers');
  await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
  await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
  await expect(step(page, /Added \d+ sheets? to the cut queue/)).toBeVisible({ timeout: 90_000 });
  await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
  await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
  const bed = main(page).getByRole('region', { name: 'On the bed' });
  const queue = main(page).getByRole('complementary', { name: 'Queue' });
  await pause(1500);
  await queue.getByRole('button', { name: 'Start' }).click();
  // the run is at 1× for the film, so this is a long wait — it is a machine phase, not a chat step
  await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 300_000 });
  await pause(2000);
  await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
  await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
  const together = main(page).getByRole('region', { name: 'Putting it together' });
  await together.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '2×' }).click();
  await together.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(together).toContainText('The finished piece', { timeout: 120_000 });
  await pause(2000);

  await finishFilm(page, 'cat', replayed);
});
