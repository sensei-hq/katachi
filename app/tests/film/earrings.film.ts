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
  await chapter(page, '1:20', 'Found N items, pairs grouped left + right');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  // live may count differently than the replay's 8 — and small subjects sometimes need the background
  // retry (the app itself offers it again after each miss, so the film takes it up to twice)
  let found = false;
  for (let attempt = 1; attempt <= 3 && !found; attempt++) {
    await expect.poll(async () => {
      if (await steps(page).filter({ hasText: /Found \d+ items/ }).count()) return 'found';
      if (await chat(page).getByText('No items found yet').count()) return 'none';
      return 'waiting';
    }, { timeout: 90_000 }).not.toBe('waiting');
    found = (await steps(page).filter({ hasText: /Found \d+ items/ }).count()) > 0;
    if (!found && attempt < 3) {
      console.log(`FILM NOTE: live found no items (attempt ${attempt}) — taking the background retry`);
      await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the background' }).click();
    }
  }
  console.log(found ? 'FILM NOTE: found items (no retry needed)' : 'FILM NOTE: no items after 3 attempts');
  await expect(step(page, /Found \d+ items/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  await pause(2500);

  await showCaption(page, 'Tidy up in plain words');
  await chapter(page, '1:38', '"remove the 0% layers", "merge the swirl drops", "undo", "smooth every layer"');
  const count = await rows(page).count();
  await humanType(page, composer(page), 'remove the 0% layers');
  await expect(steps(page).last()).toHaveAttribute('data-step-status', /done|failed/, { timeout: 90_000 });
  await pause(2000);
  // the scripted swirl pair on replay; whatever the first two rows are when live names differ
  const rowTexts = await rows(page).evaluateAll((els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''));
  const clean = (t: string) => t.split('·')[0].trim();
  const names = rowTexts.map(clean);
  const swirlLeft = names.find((n) => /swirl/i.test(n) && /\bleft\b/i.test(n));
  const swirlRight = names.find((n) => /swirl/i.test(n) && /\bright\b/i.test(n));
  const mergeSaid = swirlLeft && swirlRight ? `merge ${swirlLeft} and ${swirlRight}`
    : `merge ${names[0]} and ${names.find((n) => n !== names[0]) ?? ''}`;
  console.log(`FILM NOTE: merge phrase: "${mergeSaid}" (${rowTexts.length} rows)`);
  await humanType(page, composer(page), mergeSaid);
  await expect.poll(async () => rows(page).count(), { timeout: 90_000 }).toBe(count - 1);
  await pause(2000);
  await humanType(page, composer(page), 'undo');
  await expect.poll(async () => rows(page).count(), { timeout: 90_000 }).toBe(count);
  await pause(2000);
  await page.screenshot({ path: 'test-results/film/earrings-pre-smooth.png' });
  // smooth is one-layer-per-call, so the pass goes row by row (default strength: the honest default)
  const layers = await rows(page).count();
  for (let i = 1; i <= layers; i++) {
    const seen = await steps(page).count();
    await humanType(page, composer(page), `smooth layer ${i}`);
    await expect.poll(async () => steps(page).count(), { timeout: 90_000 }).toBe(seen + 1);
    await expect(steps(page).last()).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  }
  await page.screenshot({ path: 'test-results/film/earrings-post-smooth.png' });
  await pause(2500);

  await showCaption(page, 'Pairs share a sheet — or pack tight');
  await chapter(page, '1:44', 'Cut: pairs together, then fit to board packs them tight');
  await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
  await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
  const layouts = page.getByRole('radiogroup', { name: 'How the parts go on sheets' });
  const planCount = page.locator('[data-cut-plan]');
  await expect(layouts.getByRole('radio', { name: 'Pairs together' })).toBeVisible({ timeout: 30_000 });
  await layouts.getByRole('radio', { name: 'Pairs together' }).click();
  await pause(2000);
  const pairsSheets = Number(await planCount.getAttribute('data-sheets'));
  await layouts.getByRole('radio', { name: 'Fit to board' }).click();
  await pause(2000);
  const fitSheets = Number(await planCount.getAttribute('data-sheets'));
  console.log(`FILM NOTE: layout sheets: pairs=${pairsSheets} fit=${fitSheets}`);
  expect(fitSheets).toBeLessThanOrEqual(pairsSheets);
  await page.screenshot({ path: 'test-results/film/earrings-chips.png' });
  await chapter(page, '1:46', 'Cut run at 1× (extra footage)');
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
