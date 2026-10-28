# E2E Muse wiring + invite-as-user local storage — plan & checklist

Goal (set 2026-10-28): a working end-to-end app using Muse models at each step,
verified with one image from `samples/layered/` (primary:
`setting_sun_circle_scene.webp`), invite code as demo-grade `user_id`, crafts in
local storage (no Supabase in the runtime path). Supabase auth/storage is a
stretch goal only after this closes, within the two-day window.

## Live API probe (2026-10-28, evidence before design)

- `GET /v1/models` 200: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0`, `muse-wonder-1.0`, voice.
- Spark 1.3 vision + strict `ImageBrief` schema on the sample: 200, 5.4 s,
  class `layered`, 9 region phrases (sun, mountains, lake, forests…).
- SAM 3.1 on the sample (`sun`): 200, 2.3 s, `<|box;…;w=1588;h=1588|>` +
  `<|mask;…;data=…|>` whose header is the mask crop size (`203,326` ≈ box h×w).
- Muse Image `/images/edits`: 400 without images; 200 with
  `images:[{image_url: dataUrl}]`, returns `b64_json`. The old
  `client.imageEdit` sent no image — that was the bug.

## Corrections to docs/design (applied in this slice)

- `docs/design/02`: Muse Image edits must carry `images:[{image_url}]`;
  SAM returns box + one-bit mask (header = crop h,w), not boxes only.
- `docs/design/04` gaps #1–#3, #12: mask parse, `ImageBrief`, segment fan-out
  and `MuseAgents` wiring are this slice.

## Checklist

- [x] Probe all three Muse APIs live on the sample image
- [x] `ImageBrief` zod schema + JSON Schema (TDD)
- [x] SAM mask parse (`parseSamMasks`) + region fan-out (TDD)
- [x] `/api/scene` accepts an image → Spark `ImageBrief`; `/api/segment`
      fan-out; `/api/art` + `/api/preview` send the image to Muse Image
- [x] `MuseAgents` wired (describe, cutout, segment, plan, brief) with
      fixture fallback labelled `placeholder`; jobs flipped to `live`
- [x] Invite code = `user_id`: gate signs it, returns it, layout binds it
- [x] `ProjectStore` namespaced `katachi:v1:{user_id}:*` + legacy migration
- [x] Playwright `sample-journey.spec.ts` on the real sample: full journey,
      reload with same code restores, second code sees an empty gallery
- [x] Gates: unit 225 passed, coverage 90.9% lines, arch/lint/check clean, build ok, e2e 47/47 (sample journey 27.7s live); CHECKPOINT refreshed

## Non-goals for this slice

Potrace/vectorise (sheets stay preview), Wonder batch live call, voice relay,
full-resolution originals in storage (640 px thumbnail only, quota eviction),
Supabase anything.

## Slice 2 — full SAM bit-decode + vectorise (2026-10-28)

- [x] `@meta-sam/parser` decodes every SAM mask bit (`decodeSamText`); recorded
      live sun mask decodes to exactly 40,987 set bits with a traced path.
- [x] `domain/vector.ts`: boundary stitching -> collinear/Douglas-Peucker ->
      Chaikin, potrace knobs (`turdSize`, `tolerance`); npm potrace rejected
      (Jimp 0.14 breaks Workers; potrace-ts is browser-only and GPL).
- [x] `/api/segment` returns per-region `ones`, bit-true `areaPct` and traced
      paths in 0-1000 image coordinates; `sheets.vectorise` scales them to mm
      per sheet (`LayerFlowState.sheetPaths`, saved with the craft).
- [x] Evidence: 232 unit, coverage 91.1% lines, build, e2e 47/47 with the
      sample journey asserting 'closed paths' on Sheets.
