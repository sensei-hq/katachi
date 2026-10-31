# T8 · The film capture: record each sample at demo pace, with chapters and real costs

**Goal:** a Playwright project that drives the real app through the four samples the way a person would, at 1920 × 1080. Each run is recorded to video, with chapter timestamps for every shot in `docs/film/script.md` and the real model costs. Those recordings are the `REC` shots of the film.

## Read first

- `docs/film/script.md`: the shot list. Your chapters must match its shot rows.
- `app/tests/e2e/samples.spec.ts` and `cat-sample.spec.ts`: the same journeys, as tests.
- `app/playwright.config.ts`.

## Files

- `app/playwright.film.config.ts` (new):
  - `testDir: './tests/film'`, one worker, `use: { viewport: { width: 1920, height: 1080 }, video: { mode: 'on', size: { width: 1920, height: 1080 } }, launchOptions: { slowMo: 60 } }`;
  - the same webServer and auth as the main config.
- `app/tests/film/*.film.ts` (new): one per sample, `cat`, `bookmarks`, `earrings`, `castle`.
- `app/tests/film/director.ts` (new): the shared helpers below.
- A script `"film": "playwright test -c playwright.film.config.ts"` in `app/package.json`.

## director.ts

- **`chapter(page, id, caption)`:** records `{ id, caption, t: ms since the recording started }` to `test-results/film/<sample>.chapters.json`. The ids are the script's shot times, e.g. `"0:55"`.
- **`showCaption(page, text)`:** an on-page caption bar (injected with `page.addStyleTag` / `page.evaluate`; bottom centre, 28 px, white on 70% black). Off by default, behind `FILM_CAPTIONS=1`, because the final captions are burned in later.
- **`humanType(page, locator, text)`:** types at about 12 characters a second.
- **`pause(ms)`:** a deliberate hold so a viewer can read a step. It's the only allowed sleep, and is used after each step lands.
- **`costs(page)`:** reads the usage ledger the app keeps per user (the `katachi.usage` setting, which `ProjectStore.getSetting` keeps in localStorage under the signed-in user's namespace; see `state/app.svelte.ts` `USAGE_KEY` and `state/project.svelte.ts`) and returns `{ craftId, byModel: { model: { calls, usd } }, totalUsd }` for the open craft. Written to `test-results/film/<sample>.costs.json`.

## Each film

- **Live models when there's a key:**
  - with `META_API_KEY` in the dev server's env (the user's machine), run **live**, with no routes;
  - without it, fall back to the replay data from samples.spec.ts and write `"replayed": true` into `costs.json`. Replayed costs are never used on a cost card.
- **Journey:** Home → Upload → Analyze → the steps landing → the edits the script shows (e.g. "make the whiskers finer", "remove the 0% layers", "merge …", "undo") → Cut → Send to the cut queue → run one sheet at 1× → Assemble Play.
- **Chapters:** a `chapter()` at every script row.
- **Output:** move the video from Playwright's output to `test-results/film/<sample>.webm` (`page.video().saveAs()` after `page.close()`).

## Rules

- **Nothing fails silently:** if a step doesn't land within 90 s, the film fails with the step's text.
- **No app changes,** except harmless `data-*` hooks (say which).
- **Hand back:**
  - the four `.webm` files' lengths;
  - the chapters JSON;
  - `costs.json` (live or replayed);
  - one or two notes on which shots look too fast or too slow at 1×.

## Out of scope

- Editing, voiceover and assembly (that's the next step, with Muse).
- The breakdown page.
