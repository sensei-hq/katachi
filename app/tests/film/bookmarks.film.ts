import { test, expect, type Page } from '@playwright/test';
import { hasMetaKey } from '../e2e/invite';
import { beginFilm, chapter, showCaption, pause, finishFilm } from './director';
import { replayBookmarks, sample } from './replay';

// REC 1:55–2:35 · five wooden bookmarks: found, perspective, upright, hidden edges, same size, laser run.
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

test('bookmarks film', async ({ page }) => {
  beginFilm('bookmarks');
  const replayed = process.env.FILM_REPLAY === '1' || !(process.env.FILM_LIVE === '1' || hasMetaKey());
  if (replayed) await replayBookmarks(page);

  await showCaption(page, 'Five overlapping bookmarks');
  await chapter(page, '1:55', 'Found 5 items: see-through holes told apart from engraving');
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await pause(2000);
  await page.setInputFiles('input[aria-label="Upload pictures"]', [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample('multiple/bookmarks.avif') }]);
  await expect(page).toHaveURL(/\/capture$/, { timeout: 30_000 });
  await pause(1500);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  // live sometimes needs the background retry first (as the earrings film does): take it up to twice
  let foundItems = false;
  for (let attempt = 1; attempt <= 3 && !foundItems; attempt++) {
    await expect.poll(async () => {
      if (await steps(page).filter({ hasText: /Found \d+ items|items · \d+ layers/ }).count()) return 'found';
      if (await chat(page).getByText('No items found yet').count()) return 'none';
      return 'waiting';
    }, { timeout: 90_000 }).not.toBe('waiting');
    foundItems = (await steps(page).filter({ hasText: /Found \d+ items|items · \d+ layers/ }).count()) > 0;
    if (!foundItems && attempt < 3) {
      console.log(`FILM NOTE: live found no items (attempt ${attempt}) — taking the background retry`);
      await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the background' }).click();
    }
  }
  // live narrates per-item ("5 items · 6 layers"), replay per-pass ("Found 5 items"): accept either
  const found = step(page, /Found \d+ items|items · \d+ layers/);
  await expect(found).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  console.log(`FILM NOTE: found step: "${(await found.innerText()).replace(/\s+/g, ' ').slice(0, 80)}"`);
  await pause(2500);

  await showCaption(page, 'Straightened, and the hidden edge rebuilt');
  await chapter(page, '2:01', 'Perspective corrected, upright, hidden edges filled in');
  const perspective = step(page, /perspective/i);
  await perspective.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => console.log('FILM NOTE: no perspective step'));
  if (await perspective.isVisible().catch(() => false)) {
    await expect(perspective).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
    console.log(`FILM NOTE: perspective step: "${(await perspective.innerText()).replace(/\s+/g, ' ').slice(0, 100)}"`);
  }
  await pause(2000);
  const upright = step(page, /upright/i);
  await expect(upright).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
  console.log(`FILM NOTE: upright step: "${(await upright.innerText()).replace(/\s+/g, ' ').slice(0, 100)}"`);
  await pause(2000);
  // live may find nothing hidden (the replay always hides the whale): wait briefly, film on either way
  const hidden = step(page, /hidden/i);
  await hidden.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => console.log('FILM NOTE: no hidden-edges step (live found nothing hidden)'));
  if (await hidden.isVisible().catch(() => false)) {
    await expect(hidden).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
    console.log(`FILM NOTE: hidden step: "${(await hidden.innerText()).replace(/\s+/g, ' ').slice(0, 100)}"`);
  }
  await pause(2500);

  await showCaption(page, 'All five, one size');
  await chapter(page, '2:12', '"Made 4 items the same size as their set"');
  const samesize = step(page, /same size/i);
  await samesize.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => console.log('FILM NOTE: no same-size step (live found no set)'));
  if (await samesize.isVisible().catch(() => false)) {
    await expect(samesize).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
    console.log(`FILM NOTE: same-size step: "${(await samesize.innerText()).replace(/\s+/g, ' ').slice(0, 100)}"`);
  }
  await pause(2500);

  await showCaption(page, 'Engraving first, then the holes, then the outline');
  await chapter(page, '2:24', 'The laser bed at 1×: engraving, holes, outline, G-code scrolling');
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
