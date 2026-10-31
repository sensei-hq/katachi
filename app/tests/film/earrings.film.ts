import { test, expect, type Page } from '@playwright/test';
import { hasMetaKey } from '../e2e/invite';
import { beginFilm, chapter, showCaption, humanType, pause, finishFilm } from './director';
import { replayEarrings, sample } from './replay';

// REC 1:35–1:52 · laser-cut earrings: pairs kept together, tidied in plain words, cut.
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();
const composer = (page: Page) => chat(page).locator('[data-chat-composer]').getByRole('textbox');
const rows = (page: Page) => page.getByLabel('Items and layers').locator('[data-layer-row]');

test('earrings film', async ({ page }) => {
  beginFilm('earrings');
  const replayed = process.env.FILM_REPLAY === '1' || !(process.env.FILM_LIVE === '1' || hasMetaKey());
  if (replayed) await replayEarrings(page);

  await showCaption(page, 'A tray of earrings');
  await chapter(page, '1:35', 'Found 8 items, pairs grouped left + right');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  // live may count differently than the replay's 8 — and may need the background retry first
  await expect.poll(async () => {
    if (await steps(page).filter({ hasText: /Found \d+ items/ }).count()) return 'found';
    if (await chat(page).getByText('No items found yet').count()) return 'none';
    return 'waiting';
  }, { timeout: 90_000 }).not.toBe('waiting');
  if (await chat(page).getByText('No items found yet').count()) {
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the background' }).click();
  }
  await expect(step(page, /Found \d+ items/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Tidy up in plain words');
  await chapter(page, '1:41', '"remove the 0% layers", "merge the swirl drops", "undo"');
  const count = await rows(page).count();
  await humanType(page, composer(page), 'remove the 0% layers');
  await expect(steps(page).last()).toHaveAttribute('data-step-status', /done|failed/, { timeout: 90_000 });
  await pause(2000);
  // the scripted swirl pair on replay; whatever the first two rows are when live names differ
  const rowTexts = await rows(page).evaluateAll((els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''));
  const mergeSaid = rowTexts.some((t) => /swirl/i.test(t)) ? 'merge the swirl drop left and the swirl drop right'
    : `merge ${rowTexts[0].split('·')[0].trim()} and ${rowTexts[1].split('·')[0].trim()}`;
  await humanType(page, composer(page), mergeSaid);
  await expect.poll(async () => rows(page).count(), { timeout: 90_000 }).toBe(count - 1);
  await pause(2000);
  await humanType(page, composer(page), 'undo');
  await expect.poll(async () => rows(page).count(), { timeout: 90_000 }).toBe(count);
  await pause(2500);

  await showCaption(page, 'Cut at 1×');
  // 1:46 in the script is "Fit to board" — the layout choice hasn't landed (L3), so the film shows Cut as it is.
  await chapter(page, '1:46', 'Cut: the sheets, then one earring cut at 1×');
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
  await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 300_000 });
  await pause(2000);
  await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
  await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
  const together = main(page).getByRole('region', { name: 'Putting it together' });
  await together.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '2×' }).click();
  await together.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(together).toContainText('The finished piece', { timeout: 120_000 });
  await pause(2000);

  await finishFilm(page, 'earrings', replayed);
});
