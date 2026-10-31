# 09 · Colour layers, background removal and per-layer corrections

Written on 2026-10-28 after a run with `samples/layered/layered_floral_black_cat_wall_art.jpg.avif` on the deployed app.

## What went wrong

| Symptom | Cause |
|---|---|
| Shape says "background removed" but the wall is still there, and the check says "SAM 3.1 (fixture)" | The cutout ran before Spark's brief arrived, so SAM got the phrase "main subject". SAM is a concept segmenter, so it found nothing and the step fell back to the fixture box. With no traced paths, the Cutout view showed the plain photo. |
| Layer names are right (Gold backer, Black cat, Red leaves…) but every mask is the cat | Each layer ran one SAM call per phrase. SAM returns the most salient *object*, the cat, for "gold backer base" and "red leaf filler" alike. The layers of a paper or wood piece are **colour groups**, not objects. |
| Layers falls back to the mountain illustration; hiding every layer shows placeholders; Capture opens empty when you go back | The photo was only kept for the session. Each craft also saved every traced path into localStorage (about 5 MB for the whole site), so saves started failing on quota and a reload lost the craft. |
| "Remove the textured wall" did nothing | Chat notes were saved, but nothing turned them into an action. |

## What changed

1. **Background removal is measured in code** (`domain/layering.subjectMask`):
   - The backdrop colours come from the photo's border: the lit wall, its shadows, a shelf. Each colour gets a tolerance from its own spread.
   - The removal floods in from the edge through backdrop-coloured pixels, opens thin bridges, keeps the main object and fills its holes.
   - When SAM does return a live outline, it is used as a hint, so flowers around a cat stay attached.
   - The cutout now waits for the brief.
2. **Stacked art is split into colour layers in code** (`colourLayers`):
   - k-means in Lab colour space runs inside the subject outline.
   - Spark's titles that name a colour seed and label their group.
   - Blends (anti-aliased rims, shadow edges) fold into the nearer real colour.
   - A majority filter smooths only pixels whose colour is ambiguous. Crisp one-pixel strokes such as whiskers, fur and eye highlights keep their layer, and the speck filter is small enough to trace them.
   - The layer that carries the outline goes to the back.
   - Each layer has its *visible* paths and its *sheet* paths: what shows, plus what sits under the layers in front. Shows and hidden percentages are measured, not fixed at 40%.
   - SAM is still used for separate items (bookmarks), where each piece is an object.
3. **Per-layer corrections** (`parseLayerOp` and `refineLayer`):
   - "keep the fine details" and "the whiskers are missing" → `detail`
   - "bolder", "thinner", "smoother" → the matching op
   - "take the wall out of this layer" → `remove` the backdrop from that layer
   - "add / remove the gold parts" → add or remove that colour
   - You can ask from the chat, naming the layer or meaning the selected one, or from the layer's **Correct this layer** box.
   - "Remove the wall / background was not removed" on any step (and at Import) re-runs the cutout in strict mode and rebuilds the regions and layers.
   - "use 3 layers" regroups the colours.
   - Asks it cannot map are kept as notes. Turning free text into these ops is the job of `layers.refine` (Spark) once it is wired; the op set is its tool schema.
4. **Storage**:
   - Captured photos (downscaled to 1600 px) and heavy results (traced paths, sheets) live in IndexedDB.
   - The localStorage craft list keeps only light records with a 360 px thumbnail, and a save never throws on quota.
   - Reopening a craft restores the photo on every step, Capture included, and steps wait for this before deciding whether to re-run a job.
5. The measurements run in a **Web Worker** (`domain/layering.worker.ts` through `state/measure.ts`), so the page does not freeze. In unit tests they run inline.
6. `PhotoStage` keeps the photo's aspect ratio (no crop), so masks stay registered on non-square photos. Paths use even-odd fill, so holes show, and each overlay is drawn in its layer's own colour.

## Tests

- `domain/layering.spec.ts`: a synthetic wall-art photo. The wall and a plant are removed, one layer per colour, one-pixel strokes kept, ops parsed and applied.
- `state/photo-flow.spec.ts`: the same photo through `AppState`. Covers the outline when SAM finds nothing, colour layers, a correction aimed at one layer, "remove the wall" at a step and at Import, and "3 layers".
- `state/storage.spec.ts`: a full quota never throws, and traced paths go to IndexedDB and come back.
- `tests/e2e/cat-sample.spec.ts`: the real cat photo, with Muse responses replayed as observed (brief and names from Spark; SAM with no outline, or with the cat alone). It checks the wall is gone, the four colour layers each have their own mask, hiding every layer keeps the photo, the photo survives a reload on Capture, "remove the textured background wall" is applied, and one-layer corrections apply from the box and from the chat.
