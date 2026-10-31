# T4–T6 review (Claude, 2026-10-30)

| Task | Status |
|---|---|
| **T5** SVG / DXF export, SVG import | **accepted** |
| **T6** kerf, `given` layout | **accepted** |
| **T4** nest | **accepted**: both fixes in and verified (see the end) |

Gates: 463 unit tests, check, lint and arch all pass with the three in.

## T5: checked

- **DXF:** a castle sheet's DXF opens in **ezdxf** (`recover.readfile`) with no errors and no fixes: R12 (AC1009), `$INSUNITS` 4, 77 closed `POLYLINE`s on `CUT` and 30 on `ENGRAVE`.
- **SVG:** the castle's sheet A1 exported to SVG and imported back with `svgToCraft` gives **62 separate parts**. That is better than the one part per sheet the low-res picture reading gives. This is the precise kit path.
- **No new dependency** (hand-written parser): fine.

## T6: checked

- **Kerf is exact.** On the xTool (0.15) the outline grows by exactly 0.15 and the hole shrinks by exactly 0.15 (kerf 0 → 0.15 → 0.4: 40.059 → 40.209 → 40.459, and 20.029 → 19.879 → 19.629).
- The 0.03–0.06 mm residual was the craft migration rounding its frame to whole px. That was Claude's code, now fixed: frames keep their exact size.
- **`given`:** the real castle layout gives 11 sheets of 300 × 301 mm, 389 passes, no warnings.

## T4: two fixes

### 1 · A part larger than the board is placed anyway, and the next part lands on it

Repro, with `planCut` on the xTool profile (300 × 300 board, margin 5 → 290 × 290 inside):

- A single 310 mm square part → 1 sheet, **no warning**.
- A 301 mm and a 100 mm part → **1 sheet with both**, overlapping. The oversized part is placed "best effort at the origin" without stamping the grid, so the next one goes on top of it.

**Fix:**

- A part that doesn't fit an empty board (in any allowed rotation) gets **its own sheet**, at the margin, and the grid is **stamped as full**, so nothing else goes on that sheet.
- The sheet gets a warning: `"Sheet A1 (301 × 301 mm) is larger than the xTool S1's 290 × 290 mm working area — scale it down or use a bigger board"`. Use the board size and margin from the profile.
- **Tests:**
  - 310 alone → 1 sheet with a warning;
  - 301 + 100 → 2 sheets, the 100 on its own sheet, no overlap;
  - 299 alone → a warning (299 > 290).

### 2 · Too slow on real parts: the castle doesn't finish

Nesting the castle kit (11 parts read from `samples/3D/castle/castle_5.webp`, hundreds of loops each, about 20k edges per part) ran **more than 200 s** without finishing.

**Cause:** `rasterize` tests every cell with `insideEvenOdd` *and* `distToLoops` over every edge: O(cells × edges). A 300 mm part is 84k cells × 20k edges × 4 rotations × 11 parts.

**Fix:**

- **Fill by scanline:** per row, intersect the row's centre line with all edges once, sort the crossings, and fill between pairs (even-odd). That's O(rows × edges + cells).
- **Dilate on the grid:** fill the cells the edges pass through, then dilate by `ceil(dil / cell)` cells: a square or diamond structuring element, or a chamfer distance transform. No per-cell distance to every edge.
- **Rotate the raster, don't recompute:** rotate 90° steps by index arithmetic. Only 45° steps need a re-raster.
- **No spreads on big arrays:** replace `Math.min(...xs)` with a loop (big arrays overflow the stack).
- **Target:** the castle (load it the way `domain/layering.spec.ts`'s readPlan test does, then `migrateV1` with a `plan` snapshot, then `planCut(…, { layout: 'nest' })`) in **under 3 s**, and 50 earrings stays under 0.5 s (it's 0.28 s now).

**Tests:**

- a 280 mm part with 2,000 small square holes (a grid) rasterises in under 200 ms, with the same occupancy as the brute-force version on a small case (compare cell sets on a 40 × 40 part with 3 holes);
- the castle nest finishes in under 3 s (timeout 10 s), and every sheet has a warning or fits.

## T4 fixes: verified (2026-10-30)

- **Oversized parts:** 310 alone → 1 sheet with the exact warning. 301 + 100 → 2 sheets, no overlap, the 301 warned. 280 + 280 → 2 sheets, no warning.
- **Speed:** the castle nests in 1.6 s here (it was over 200 s), with all 11 sheets warned on the xTool's 290 × 290 working area. On the Glowforge (485 × 269) 10 of the 11 are warned for height, which is correct.
- **Exact rasterising:** scanline fill plus exact edge distance through a spatial hash keeps brute-force parity. Agreed to skip raster rotation for that reason: the target is met with room to spare.
- **`stage.spec.ts`:** the 10 s budget on its heavy-import test is fine.
- **Gates:** verify is green (470 tests, line coverage 94.7%).
