# T3 review (Claude, 2026-10-30)

**Status:** accepted. Registered in `defs/index.ts` and running in the app.

## Checked through the real engine

`state/craft/geometry-actions.spec.ts` runs each action on a craft migrated from v1 (a bookmark with a hole and engraving, a ring with an island, a leaf, a dense coin) via `ActionState`:

- **Undo and redo:** all 13 cases (offset in both modes) run; undo gives back the identical craft; redo gives back the identical result.
- **On real shapes:**
  - mirror makes "Leaf (mirrored)" in a `pair` group cut on the same sheet;
  - bridge leaves the ring with 0 islands;
  - add-hole adds exactly one loop;
  - flip and `qty: 3` reach the cut plan (3 Fox sheets).
- **Phrases:** the chat reaches every action in plain words.

**Named groups in `says`** (`(?<qty>\d+)`, `(?<axis>…)`) are a good idea. The chat's fast path now reads options from them for every action (`groupsOf`), so new actions bring their own phrasing.

**Align** taking `scope: 'item'` while also handling part ids (and refusing a mix) is agreed.

## Fixed in review (small)

Patterns that fired on everyday sentences:

- **add-hole:** `/\bhole\b/` fired on "fill the hole in the fox", and would have *added* a hole. Now it needs "add / punch / drill / put / cut … hole" or "hanging hole".
- **quantity:** `make (?<qty>\d+)` fired on "make the leaf 40 mm tall" (quantity 40). Now a unit after the number (mm, cm, in, %, degrees) rules it out.
- **flip:** "vertically" missed the axis group. Now `horizontal|vertical` takes an optional `ly`.

## Still open

T1's `smooth` on ragged outlines (`T1-review.md`). The smooth *action* is right, but on a traced (pixel-staircase) outline it changes nothing until the T1 fix lands.
