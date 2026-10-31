import type { Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// The film's shared helpers (docs/tasks/T8-film-capture.md): chapters, captions, human typing, one honest
// sleep, the usage ledger, and finishing (costs + the .webm).
const ctx = { sample: '', t0: 0 };

/** start a film: names its chapter/cost/video files and zeroes its clock */
export function beginFilm(sample: string): void {
  ctx.sample = sample; ctx.t0 = Date.now();
  mkdirSync('test-results/film', { recursive: true });
  writeFileSync(`test-results/film/${sample}.chapters.json`, '[]');
}

/** a script shot lands: record its id, caption and ms since the recording started */
export async function chapter(page: Page, id: string, caption: string): Promise<void> {
  void page;
  const file = `test-results/film/${ctx.sample}.chapters.json`;
  const arr = JSON.parse(readFileSync(file, 'utf8')) as { id: string; caption: string; t: number }[];
  arr.push({ id, caption, t: Date.now() - ctx.t0 });
  writeFileSync(file, JSON.stringify(arr, null, 2));
}

/** an on-page caption bar for the dry run (final captions are burned in later) */
export async function showCaption(page: Page, text: string): Promise<void> {
  if (process.env.FILM_CAPTIONS !== '1') return;
  await page.evaluate((t) => {
    let bar = document.getElementById('film-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'film-caption';
      bar.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;font-size:28px;line-height:1.3;color:#fff;background:rgba(0,0,0,.7);padding:10px 22px;border-radius:8px;max-width:80%;text-align:center;pointer-events:none;';
      document.body.appendChild(bar);
    }
    bar.textContent = t;
  }, text);
}

/** type the way a person does, about 12 characters a second */
export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  void page;
  await locator.click();
  await locator.pressSequentially(text, { delay: 83 });
  await locator.press('Enter');
}

/** a deliberate hold so a viewer can read a step — the only sleep the films use */
export async function pause(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface FilmCosts { craftId: string | null; byModel: Record<string, { calls: number; usd: number }>; totalUsd: number }

/** the open craft's real model costs from the app's usage ledger (katachi.usage in localStorage) */
export async function costs(page: Page): Promise<FilmCosts> {
  const entries = await page.evaluate(() => {
    const out: { craftId: string | null; model: string; costUsd: number; status: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.endsWith(':katachi.usage')) continue;
      try { out.push(...(JSON.parse(localStorage.getItem(k) ?? '[]') as typeof out)); } catch { /* keep going */ }
    }
    return out;
  });
  const byModel: FilmCosts['byModel'] = {};
  for (const e of entries) {
    const m = (byModel[e.model] ??= { calls: 0, usd: 0 });
    m.calls++;
    if (e.status === 'live') m.usd += e.costUsd;
  }
  for (const m of Object.values(byModel)) m.usd = Math.round(m.usd * 10000) / 10000;
  const totalUsd = Math.round(Object.values(byModel).reduce((a, m) => a + m.usd, 0) * 10000) / 10000;
  return { craftId: entries.find((e) => e.craftId)?.craftId ?? null, byModel, totalUsd };
}

/** write costs.json (flagged when replayed), then move the recording to test-results/film/<sample>.webm */
export async function finishFilm(page: Page, sample: string, replayed: boolean): Promise<void> {
  const c = await costs(page);
  writeFileSync(`test-results/film/${sample}.costs.json`, JSON.stringify({ ...c, replayed }, null, 2));
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(`test-results/film/${sample}.webm`);
}
