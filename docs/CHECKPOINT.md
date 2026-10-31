# Checkpoint — Katachi · Snap → Make Phase 1

- Slice 2026-10-29 e (design/13), checked on the four samples (cat, bookmarks, earrings, castle):
  - Separate items: holes judged by what surrounds the item (dark marble or pale cloth), dark blobs = holes in shadow, thin lines = engraving, wall shadow ignored; full resolution, cropped per item; no 0% engraving layers.
  - Passes after the layers, as chat steps: align & straighten (turns reported), interpolation (fills what a neighbour hid; holes kept). Item sizes measured upright.
  - Castle: Views shows your pictures (never stand-ins); a cut-plan picture is read by code into its sheets (A1–A4, B1–B7, ~219 pieces), each a cut + engrave pass; approximate from a low-res picture (says so); first chat line waits for Analyze.
  - Layer edits in the chat by name or number (delete, delete empty, merge, merge all engravings → one per item), Delete on the layer, Undo (chat or toolbar) for every edit; merged layers keep their role.
  - Gates: 313 unit (lines 93.4%), verify clean, build ok, e2e samples + cat 8/8 (full suite: cat/multiple time out only under 3-worker load).

- Slice 2026-10-29 d (design/12, from the agreed mockup):
  - Cutting program per sheet (domain/toolpath): inner shapes first, outline last, nearest next; G-code (GRBL) for lasers, blade moves for paper cutters; downloadable.
  - Cut queue: machine bed (mat or honeycomb) with the run following the program, waste falls away, Next sheet; queue scrolls on its own; guidance + Start at the bottom; rail badge counts and pulses.
  - Assemble: each sheet lifts off its card and lands on the stack, Play/Replay/speed/Prev/Next, finished photo at the end; cards say cut / not cut yet.
  - Material picks the machine (paper → blade cutter, wood/acrylic → laser).
  - Gates: 302 unit (lines 93.6%), verify clean, build ok, e2e 51 passed, 1 skipped.

- Slice 2026-10-29 c (design/11):
  - Home = Upload / Camera tiles (+ sketch it) and Your crafts; /crafts redirects. Muse decides the craft kind.
  - Rail: Home · Cut queue · chat · tools; an open craft adds its thumbnail + Layers · Cut · Assemble (greyed until layers exist); top step tabs gone. Cut = sheets preview + device + hidden-parts rule + virtual run.
  - Each craft has its own chat (saved with it, restored on open).
  - Several pictures of an object (any number, any order): Spark sorts views / close-ups / cut plans (/api/views) and estimates size; views page shows them.
  - Cut queue (/queue, was Batch): sheets from any craft, one at a time, person in the loop, live virtual run; persisted per user.
  - Usage ledger per user (localStorage): top bar = open craft's spend; Under the hood = by model / by craft / calls.
  - Gates: 298 unit (lines 93.5%), verify clean, build ok, e2e 50 passed, 1 skipped.

- Slice 2026-10-29 b (design/10 additions):
  - Layers: tool toolbar + view (All · This layer · Its sheet · Exploded isometric of your photo); a layer's actions float by its row (show only, hide, quote, duplicate, merge with any layer — masks unioned, split, fill to one outline); background shown removed (checkerboard); Review the gaps is a chat suggestion; chat timeline connector + even text size.
  - Strict "remove the wall" never eats the art (cat: 40% kept vs 26% before).
  - How it's built: Stacked (additive on a solid backing) · Inlay · Engrave + cut; engraving passes first. Wooden/acrylic separate items get a cut outline + measured engraving each.
  - Real size: Spark estimates `realSizeMm`; the photo is calibrated to mm with its aspect; user scales (W/H fields or "make it 300 mm wide"); items and sheets show mm.
  - Virtual run on Sheets and Burn Watch (blank sheet → engrave → cut → extra pieces vanish); Play the whole run. /canvas and /watch draw the traced sheets.
  - Gates: 284 unit (lines 92.5%), verify clean, build ok, e2e 49 passed, 1 skipped (Meta replayed).

- Slice 2026-10-29 (v0.1.0, design/10):
  - Version shown in the app (Settings → About, rail, landing footer, `/api/version`); `bun run bump --patch|--minor|--major` (bumpp).
  - Capture → **Analyze** → Layers in one press; Import, Cutout and Segment folded into Layers (old URLs redirect). Journey is four steps.
  - The breakdown runs live as chat timeline steps (thinking → working → done) with each model call, cost and time on its step; code work labelled Code. The header activity strip is gone.
  - Separate items (bookmarks) are found as items, one layer each, grouped by item in the list.
  - Chat-first Layers: no inspector in the chat column; quote a layer or a message (card + preview); suggestions inline; layer toolbar with pick / area / move / line / circle tools, Detail (blocky ↔ fine) and Weight sliders, hide / duplicate / merge / split — every action said in the chat with the layer quoted, then landing as a step.
  - Hairline outlines; the selected layer is a spotlight of the photo's own pixels (no thick strokes over the art).
  - Mobile landing hero shows the whole story.
  - Gates: 279 unit (lines 91.8%), verify clean, build ok, e2e updated (cat + replayed bookmarks + journey + layers + project + sample).

- Slice 2026-10-28 evening (black cat sample, design/09):
  - Background removal and colour layers are measured in code, in a Web Worker. SAM's outline is used as a hint.
  - The cutout waits for the brief.
  - One-layer corrections work from the chat and from the layer box.
  - "Remove the wall" rebuilds the outline and layers.
  - Photos and traced paths are stored in IndexedDB, and saves are quota-safe.
  - Capture and Layers show the real photo after a reload.
  - Gates: 269 unit (lines 90.9%), verify clean, build ok, e2e 51 passed, 1 skipped (Meta replayed; no live key in that run).

- Slice 2026-10-28 (E2E Muse wiring + invite-as-user storage, uncommitted on main):
  Spark ImageBrief (`/api/scene` with the real image), SAM 3.1 box+mask parse and
  per-region fan-out (`/api/segment`), Muse Image edits with the source image
  (`/api/art`, `/api/preview`, `imageEditWith`). `MuseAgents` jobs describe /
  cutout / segment / plan / gaps / sketch / render are live with fixture fallback
  labelled placeholder; `AppState.askForBrief` goes through `MuseAgents.brief`.
  Invite code is the `user_id`: the gate signs it and returns it, the root layout
  binds it, crafts live in localStorage under `katachi:v1:{user_id}:*` with a
  one-time legacy migration. No Supabase in the runtime path.
- Evidence: live probes on `samples/layered/setting_sun_circle_scene.webp`
  (Spark layered + 9 regions, SAM sun box+mask, Muse Image b64 edit);
  Playwright `sample-journey.spec.ts` walks that file Capture → Assemble → Save,
  reloads under the same code, and checks a second code sees an empty gallery.
- Gates: 225 unit (38 files, coverage lines 90.9%), arch/lint/check clean,
  build ok, e2e 47/47.
- Slice 2 (same day): full SAM bit-decode via @meta-sam/parser (recorded sun
  mask = 40,987 bits) and domain/vector tracing to closed mm paths on Sheets;
  committed and redeployed after gates (232 unit, e2e 47/47).
- Slice 3 (same day): no placeholder start (empty stack/regions until jobs
  land), layer-region binding, prominent colour sampled from photo pixels,
  clipped background removal, hide/show layers, scrollable stack, exploded
  stack toggle; multiple-items arrangement (bookmarks: 5 SAM instances matched
  left-to-right, one cut per item, multiple-item assembly). Gates: 245 unit,
  verify clean, e2e 48/48 incl. new multiple-items spec.
- Open: SVG/G-code file export from sheetPaths (paths exist, files do not);
  budget caps (R-PL-2) unwired; Wonder batch and voice relay still fixtures;
  Supabase auth/storage is the stretch goal once this is committed.
- Known broken: none in tests.
