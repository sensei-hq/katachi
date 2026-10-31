# T1 · Geometry library (`app/src/lib/domain/geo`)

**Goal:** implement every function in `geo/index.ts` that throws `not implemented yet (task T1)`, with tests. The core in that file (`fromLoops`, `toLoops`, `bbox`, matrices, `transform`, `reversePath`, `toSvgD`) is already done; use it.

## Files

- `geo/measure.ts`: `area`, `hausdorff`, `depths`, `islands`, `longAxisDeg`
- `geo/simplify.ts`: `simplify` (RDP)
- `geo/smooth.ts`: `smooth` (Chaikin + Schneider cubic fit)
- `geo/boolean.ts`: `offset`, `union`, `difference`, `weld`, `hull`, `bridge`
- Re-export them from `geo/index.ts`, replacing the stubs and keeping the signatures and doc comments.
- Add a spec file per module.

## What each does (the contract is the doc comment in `index.ts`)

- **`area(g)`:** shoelace over the flattened closed paths, even-odd (a hole subtracts, whatever its winding). Absolute value per loop, signed by depth parity using `depths`.
- **`simplify(g, tol)`:**
  - Ramer–Douglas–Peucker per path; closed paths keep at least 3 points.
  - Bézier paths are flattened first (`toLoops(g, tol / 4)`). The result is all `L` segments.
- **`smooth(g, { tol, passes = 1, keepCorners = true, cornerDeg = 35 })`:**
  1. Flatten, then resample at about `tol / 2` spacing.
  2. Find corners: points where the direction turns by more than `cornerDeg` (measured over a window of about 3 samples). Corners stay as anchors.
  3. Run `passes` rounds of Chaikin corner-cutting between anchors (never moving the anchors).
  4. Fit cubic Béziers between consecutive anchors with Schneider's algorithm ("An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems 1990), splitting where the error exceeds `tol`.
  5. A closed path with no corners is fitted as one loop: split it at its two farthest-apart points.

  The output uses `C` segments.

  **Must hold:** `hausdorff(smooth(g, {tol}), g) <= tol * 1.5`, and the corners of a square stay within `tol` of the original corners.
- **`offset(g, d)`:** grow or shrink with round joins. Holes move the opposite way (a hole shrinks when the outline grows). A shrink that makes a loop vanish drops it.
- **`union`, `difference`, `weld`:** polygon booleans on flattened closed paths, output as clean outer loops plus holes. `weld(g)` = union of all of g's loops (overlapping petals → one outline).
- **`hull(g)`:** monotone chain over all points. There is one already in `domain/toolpath.ts` (`hullOf`); reuse it.
- **`hausdorff(a, b, step)`:** sample both outlines every `step` (default: 1/200 of the larger bbox side), return the max of the two directed distances. Point-to-segment distance; there is no need to be exact between samples.
- **`depths(g)`:** for each closed path, how many other closed paths contain it (point-in-polygon test of one vertex). 0 = outer, 1 = hole, 2 = island in a hole…
- **`islands(g)`:** indices with even depth ≥ 2.
- **`bridge(g, { width, per = 2 })`:**
  - For each island, find the `per` shortest gaps between it and its enclosing hole's loop, spread out: pick the shortest, then the next shortest at least 90° away around the island's centroid.
  - At each gap, cut a rectangle of `width` × gap length out of the *hole*, so the island stays connected to the surrounding piece.
  - Return the new geometry. The island and its hole merge into the piece.
- **`longAxisDeg(g)`:** PCA of the outline resampled by length (don't use raw vertices: dense corners skew it). Angle in degrees, in (−90, 90]. `domain/toolpath.ts` has `longAxis` for the polyline case; match its result on polylines.

## Dependency allowed

One polygon-clipping library for the booleans and offset:

- [`clipper2-js`](https://www.npmjs.com/package/clipper2-js) (MIT) is preferred, or `js-angusj-clipper` (MIT).
- Work at a fixed integer scale (e.g. ×1000) and convert back.
- No other dependencies.

## Tests (at least)

- **`area`:** square = 100; square with a 4 × 4 hole = 84, for both windings of the hole.
- **`simplify`:** a 1000-point circle at tol 0.5 has under 80 points, with `hausdorff` ≤ 0.5.
- **`smooth`:**
  - a jittery circle (±0.4 noise) at tol 0.5 comes out as ≤ 12 `C` segments, hausdorff ≤ 0.75;
  - a square keeps 4 sharp corners;
  - an open stroke stays open.
- **`offset`:** square 10 → offset 1 → area within 1% of 100 + 40 + π; shrinking a 2 × 2 square by 2 → no paths.
- **`union` / `weld`:** two overlapping squares → 1 loop, area = sum − overlap.
- **`difference`:** a square minus a centred smaller square → 1 outer + 1 hole.
- **`depths` / `islands`:** an "O" shape (outer, hole, island) → [0, 1, 2], islands [2].
- **`bridge`:** that "O" with width 1, per 2 → no islands left (`islands(result)` is empty), and area grows by about 2 × width × gap.
- **`longAxisDeg`:** a 10 × 40 rectangle rotated 30° → 30 ± 0.5 (or −60 / 120 normalised to the same axis).
- Every function: empty geometry in → empty out, no throw.

## Out of scope

- Actions (T3).
- Touching `layering.ts` or `toolpath.ts`, beyond importing from them.
