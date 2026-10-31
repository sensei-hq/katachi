# T7 · End-to-end tests: the actions in the UI, and the four samples all the way through

**Goal:** the app's edits and the four sample crafts are covered end to end in a browser: Layers → Cut → the cut queue → Assemble. Today the e2e suite covers analysis well, but not the action set (design/14), the cut plan (design/15) or the full journey per sample.

## Read first

- `app/tests/e2e/samples.spec.ts`: how the four samples are replayed. Spark's brief and SAM's outlines are routed with `page.route`; everything after that is the real code on the real photos.
- `app/tests/e2e/cat-sample.spec.ts` (queue and assemble), `start.ts` (`uploadFromHome`), `layers.spec.ts`.
- `docs/design/14-action-set.md` §6–§8 and `app/src/lib/domain/actions/chat.ts` (the fast-path phrases).

## Files

- `app/tests/e2e/actions.spec.ts` (new): the action set through the UI.
- `app/tests/e2e/samples.spec.ts`: extend each sample to the end of its journey.
- If you need stable hooks, small `data-*` attributes in components are allowed. Say which ones in the hand-back. No behaviour changes.

## actions.spec.ts (bookmarks replay, as in samples.spec.ts)

**Through the chat** (`say(page, …)` as in samples.spec.ts), each landing as a done step:

- **flip:** "flip the fox bookmark" → the step "Flipped …"; Its sheet shows it mirrored. Check with a `data-flipped` attribute on the sheet view if you add one.
- **mirror:** "mirror the leaf"-style on one bookmark → a new item "… (mirrored)" appears in Items and layers.
- **smooth:** "smooth the whale bookmark a lot" → the step detail says "within … mm of your shape".
- **rotate:** "rotate the phoenix bookmark 90 degrees".
- **quantity:** "make 3 copies of the fox bookmark" → later the cut queue has 3 Fox sheets.
- **undo / redo:** the toolbar Undo and Redo buttons and the words "undo" and "redo" each restore the row count and names exactly. A two-step request ("merge layers 1 and 2 and then smooth it", sent through the planner; route `/api/actions/plan` to return two calls) is undone by **one** Undo.
- **Refusals say why:** "split the elephant bookmark" on a one-piece layer → "One piece — nothing to split". Never "Noted".

**Through the buttons:** Delete, Duplicate, Merge with…, Split (on a merged layer, giving back the originals), each said in the chat with the layer quoted.

## samples.spec.ts: each sample to the end

| Sample | Journey to cover |
|---|---|
| **Cat** | Already in `cat-sample.spec.ts`; keep it. |
| **Bookmarks** | Layers → "Cut the sheets" → send to the cut queue → **5 sheets** (one per bookmark, engraving and cut together) → run the first sheet (Start; wait for phase `weeding` or `cut`) → Assemble shows 5 cells. |
| **Earrings** | → the cut queue. Pairs (left + right) go on one sheet when the layout is "pairs together". When the Cut page's layout choice lands (Claude's L3 work), add a test for "Fit to board": fewer sheets than items. |
| **Castle** | → Cut shows ≥ 11 sheets → the cut queue takes them → one sheet runs. SVG / DXF download buttons are coming in L3: add a `test.fixme` for them now, with the exact expectation (a `download` event; the file starts with `<?xml` or `0\nSECTION`). |

## Rules

- **Replayed models only** (no key in CI), as in samples.spec.ts. Don't change the replay data's meaning.
- **One worker per file must pass,** and the whole suite at `--workers=2`. The heavy files may use `test.describe.configure({ mode: 'serial' })`.
- **No sleeps:** wait on step status (`data-step-status="done"`), URL, or attributes. Timeouts ≤ 60 s per wait.
- **Screenshots** go to `test-results/samples/<sample>-<n>-<what>.png`. The film page reuses them.
- **Done means:** `bunx playwright test tests/e2e/actions.spec.ts tests/e2e/samples.spec.ts tests/e2e/cat-sample.spec.ts --workers=2` passes **three times in a row**. Paste the three summaries in the hand-back.

## Out of scope

- Live Meta calls (that's T8, the film run).
- Changing app behaviour. If a test finds a bug, write it up in the hand-back with the failing test marked `test.fail()` and a one-line description.
