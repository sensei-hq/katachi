# Checkpoint — Katachi · Snap → Make Phase 1

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
- Open: SVG/G-code file export from sheetPaths (paths exist, files do not);
  budget caps (R-PL-2) unwired; Wonder batch and voice relay still fixtures;
  Supabase auth/storage is the stretch goal once this is committed.
- Known broken: none in tests.
