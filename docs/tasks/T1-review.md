# T1 review (Claude, 2026-10-30)

**Status:** accepted. The smoothing fix is in (2026-10-30): a staircase circle goes from 188 segments to 6, the jitter to 4, and a clean square keeps 4 exact corners.

## Checked

**Contracts:** `geo/types.ts`, `cutplan/types.ts` and the core in `geo/index.ts` are unchanged.

**On real shapes:**

- A 10 mm square offset by 1 has area 143.14, exactly 100 + 40 + π. The `clipper2-js` offset fix works. Pinning 1.2.4 with the subclass and a note is the right call.
- An "O" (outer, hole, island) has 1 island; after `bridge` it has 0.
- Strict containment for depths in the booleans is good: loops that touch stay on the same level.

**Gates:** check, lint, and 39 geo + cutplan tests pass. The whole app's 378 unit tests pass with T1 in (merge now uses the real `union`).

## Fix needed: `smooth` does nothing to ragged outlines

The spec's jittery circle is a smooth 7-lobe wobble (`0.4 · sin 7a`). Real traced outlines are ragged *at every vertex*:

- a pixel staircase, from tracing a mask;
- noise that alternates from one vertex to the next.

On those, `smooth` returns the input unchanged:

| Input | tol | Result |
|---|---|---|
| staircase circle, r 40, 320 pts | 0.5 | 188 segs, hausdorff 0.00 |
| staircase circle, r 40, 320 pts | 1 | 300 segs, hausdorff 0.00 |
| per-vertex ±0.4 jitter, r 50, 200 pts | 0.5 and 1 | 200 segs, hausdorff 0.00 |

**Cause:** every stair step or zigzag turns more than `cornerDeg`, so every vertex becomes a corner anchor, and the fit between neighbouring anchors is the input itself. The resample "always keeping the original vertices" makes it certain.

**Fix:** a corner is a turn that lasts. Features smaller than `tol` are not corners.

- Measure the turn at i between chords that reach at least `max(3 samples, 3·tol)` *of arc length* each way, not 3 samples.
- Or find corners on a pre-smoothed copy (e.g. RDP at `tol`, then the turn test), then snap each corner to the nearest original sample.
- Don't force the original vertices into the resample when they are within `tol / 2` of the chord.

## Tests to add (all must pass)

- **Staircase circle,** r 40 (the one above), tol 0.5: ≤ 16 `C` segments, hausdorff ≤ 0.75, and no point of the result is more than 0.75 from the true circle.
- **Per-vertex ±0.4 jitter,** r 50, 200 pts, tol 0.5: ≤ 16 `C` segments, hausdorff ≤ 0.75.
- **Staircase square** (a 40 × 40 square rotated 20°, traced to a pixel staircase), tol 0.5: still 4 sharp corners (end points within 0.75 of the true corners), ≤ 12 `C` segments.
- **The existing tests** still pass (wobbly circle, square, open stroke).

Generator for the staircase circle:

```ts
const stairs: Pt[] = [];
for (let a = 0; a < 360; a++) {
  const x = Math.round(50 + 40 * Math.cos(a * Math.PI / 180)), y = Math.round(50 + 40 * Math.sin(a * Math.PI / 180));
  const l = stairs.at(-1);
  if (!l || l[0] !== x || l[1] !== y) { if (l && l[0] !== x && l[1] !== y) stairs.push([x, l[1]]); stairs.push([x, y]); }
}
```
