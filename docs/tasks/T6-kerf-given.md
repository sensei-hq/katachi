# T6 · Kerf compensation and the `given` layout (`app/src/lib/domain/cutplan/`)

Two small pieces of the cut plan.

## A · Kerf (`cutplan/kerf.ts`)

`withKerf(sheet: Sheet, kerfMm: number): Sheet`: each cut pass is offset by half the kerf so the *part* comes out the drawn size.

- **Direction:** outlines (even depth) grow by kerf/2; holes (odd depth) shrink by kerf/2 (they get *bigger* as cut), so holes come out the drawn size too.
- **Unchanged:** engrave and score passes, and the part's identity.
- **How:** `geo.offset` per loop (T1, already in). Find each loop's depth with `geo.depths` on the sheet's cut loops of the same part.
- **Where it's applied:** in `planCut`, after placement, when `profile.kerfMm > 0`. Remove the `// kerf: applied by the program, later` note.
- **Collapse:** a loop that would collapse (a hole smaller than the kerf) is dropped, and the sheet gets a `warnings: string[]` entry: "a 0.2 mm hole in Fox can't be cut with a 0.2 mm kerf". Add `warnings?: string[]` to `Sheet` in `cutplan/types.ts`; this is the one contract change allowed.

**Tests:**

- A 20 × 20 square with kerf 0.2 cuts at 20.2 × 20.2 (area within 0.5%), and its 10 × 10 hole cuts at 9.8 × 9.8.
- Engraving is untouched.
- A tiny hole is dropped and the warning is present.
- Kerf 0 changes nothing (deep-equal).

## B · The `given` layout (`cutplan/plan.ts`)

A kit's own sheet arrangement: the castle's parts layout. Each kit part is already one sheet (`Sheet A1`…), drawn where it sits on the kit's sheet.

- **Behaviour:** for `layout: 'given'`, each part of an item with `build: 'assembly'` becomes one sheet **in place**. There is no re-centring on its bounding box: the frame origin is the sheet's corner, and the sheet size is the part's frame extent in mm (`frame.size / pxPerMm`, which for a kit is the kit sheet, e.g. 300 × 301).
- **Items that aren't kits** fall back to `one-part-per-sheet`.
- **Remove the throw:** `'layout "given" lands with the kit layout'` goes.

**Tests:**

- A kit item with 2 parts (as `migrateV1` makes from a plan; build one with `craft/migrate.ts` and a `plan` snapshot) → 2 sheets of 300 × 300, with loops at the same mm positions as drawn.
- Non-kit items in the same craft get one-part-per-sheet.

## Out of scope

- Screens.
- Nesting (T4).
