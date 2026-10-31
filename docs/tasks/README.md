# Tasks for parallel work

Self-contained briefs for work split across agents (design/14 and 15). Each brief says:

- what to build and which files to touch;
- the contract it must keep;
- the tests that prove it is done.

Claude (the lead in this repo) owns the contracts and reviews every hand-back.

## Rules for every task

- **Read first:** `AGENTS.md`, then `docs/design/14-action-set.md` and `docs/design/15-craft-model-and-cut-plan.md`.
- **Contracts are fixed:**
  - `app/src/lib/domain/geo/types.ts`, `geo/index.ts` (the signatures)
  - `domain/craft/types.ts`, `domain/actions/types.ts`, `domain/cutplan/types.ts`

  Don't change them. If one must change, say why in the hand-back and don't work around it.
- **Touch only your listed files** (plus new spec files next to them). Never touch `state/`, `routes/`, or `components/` unless the brief says so.
- **Pure domain code:** no Svelte, no DOM, no `fetch`, no `Date.now()`/random inside functions (pass them in). Comments say *why*, in plain words. Match the existing style: short functions, 2-space indent, single quotes.
- **New dependencies:** none, unless the brief allows one. Say which one, and its licence.
- **Done means:**
  - `cd app && bun run verify` passes: arch check, lint, svelte-check, unit tests with coverage.
  - New code is at least 90% covered by lines.
- **Hand back:** a branch `task/<id>-<slug>` or a patch (`git diff --binary`). Include a short note:
  - what was built;
  - any deviation, and why;
  - open questions;
  - test output.

## The tasks

| Id | Task | Depends on | Size | Who |
|---|---|---|---|---|
| T1 | Geometry library (`domain/geo`) — **accepted**, smoothing fix in (`T1-review.md`) | contracts only | ~1 day | delegate |
| T2 | Cut plan: profiles, `planCut`, queue adapter (`domain/cutplan`) — **accepted** (`T2-review.md`) | contracts; T1's core (already implemented) | ~1 day | delegate |
| T3 | Geometry actions as `ActionDef`s (`domain/actions/defs`) — **accepted**, registered (`T3-review.md`) | T1 | ~1 day | delegate, after T1 |
| T4 | Fit to board: the `nest` layout (`cutplan/nest.ts`) — **accepted** (`T456-review.md`) | T2 | ~1 day | delegate |
| T5 | Sheet files: SVG + DXF export, SVG import → craft (`domain/files/`) — **accepted** | T2 | ~1 day | delegate |
| T6 | Kerf compensation + the `given` layout (kits) — **accepted** | T1, T2 | ~0.5 day | delegate |
| T7 | End-to-end: the action set in the UI, and the four samples through queue + assemble | T1–T6 | ~1 day | delegate |
| T8 | Film capture: record the four samples at demo pace, with chapters + real costs (`docs/film/script.md`) | T7 (same journeys) | ~1 day | delegate |
| L1 | Craft state classes, v1 → v2 migration, `LocalRepository` — **done** (`domain/craft`, `state/craft`) | contracts | ~1.5 days | Claude |
| L2 | Action registry, `perform` / undo / redo / again, history in the doc — **done**, with merge, delete, duplicate, reorder, rename, recolour, set-role, group, ungroup (`domain/actions`, `state/craft/actions.svelte.ts`); straighten / interpolate / resize / enhance next | L1 | ~1 day | Claude |
| L3 | Wire the screens: layers, queue, Assemble and Cut read the craft and the cut plan (animations unchanged) | L1, L2, T2 | ~1 day | Claude |
| L4 | Chat: fast path from `says`, Spark tool-calling over the registry (`/api/actions/plan`) | L2, T3 | ~1 day | Claude |

T4, T5 and T6 are independent of each other (all three touch `cutplan/plan.ts`'s layout switch: T4 adds `nest`, T6 adds `given` + kerf; merge in that order).

## For T3: how to plug in

Export your definitions from `domain/actions/defs/geometry.ts` as `geometryActions: ActionDef[]`. Add one line to `defs/index.ts`, `for (const a of geometryActions) register(a as never)`, and nothing else.

`state/craft/actions.spec.ts` shows how an action runs through `ActionState` (resolve → can → run → history). Use the same pattern for one integration test per action: run it, undo, and expect the doc to be identical.
