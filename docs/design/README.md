# docs/design: how Snap → Make turns a picture into parts

The PRD (`docs/prd/`) says *what* we build. This folder says *how*:

- how an image is broken down;
- which Muse model does which job;
- how the output reaches a machine.

Read in order:

| Doc | What it covers |
|---|---|
| [01-image-pipeline.md](01-image-pipeline.md) | The stages from "image in" to "layers / parts out", with data contracts and where the user is asked |
| [02-muse-models.md](02-muse-models.md) | Model-by-stage matrix: which Muse model, why, call shape, cost, fallback |
| [03-device-adapters.md](03-device-adapters.md) | Object → Impl architecture. Adapters split into planner, emitter and connector so Cricut, 3D printers, CNC and more plug in after the hackathon |
| [04-gap-analysis.md](04-gap-analysis.md) | What the code does today vs what this design needs, file by file, in build order |
| [05-sketch-to-make.md](05-sketch-to-make.md) | Phase 2: sketch → interpreted model → style + devices → full build |
| [06-ui-gap-analysis.md](06-ui-gap-analysis.md) | The app's screens vs the mockups: phone and desktop, responsive layout, shared state, asset rule, build order (roadmap 12–15) |
| [07-ux-journey-review.md](07-ux-journey-review.md) | **Start here for UX.** The one craft journey, gaps G1–G21 with resolutions, and the state/agent boundary. Supersedes 06 for flow decisions |
| [08-mixed-items-and-3d-stitching.md](08-mixed-items-and-3d-stitching.md) | Separate items (bookmarks) and six-view 3D stitching |
| [09-colour-layers-and-corrections.md](09-colour-layers-and-corrections.md) | Background removal and colour layers measured in code; one-layer corrections |
| [12-cutting-program-queue-assemble.md](12-cutting-program-queue-assemble.md) | **Cut and assemble.** The cutting program (G-code / blade moves), the cut queue's simulated run, Assemble's layers flying from their cards |
| [13-item-passes-cut-plans-edits.md](13-item-passes-cut-plans-edits.md) | **Items, plans, edits.** Fretwork holes vs engraving, the straighten and interpolation passes, reading a cut-plan picture, layer edits by name or number, undo |
| [14-action-set.md](14-action-set.md) | **The action set (proposed).** One registry of typed actions (layers in, layers out) used by the chat, the buttons and the pipeline; shared undo / redo / again; per-item frames at standard tiers; smooth, enhance, resize |
| [15-craft-model-and-cut-plan.md](15-craft-model-and-cut-plan.md) | **Craft model + Cut plan (proposed).** Craft → Items → Parts → Ops (cut / engrave are ops on a part), state classes over a versioned doc, one repository (local → Supabase), and the Cut plan: sheets per device + material, today's layout as the first cut profile |
| [11-start-rail-and-cut-queue.md](11-start-rail-and-cut-queue.md) | **Current navigation.** Home = Upload/Camera + your crafts; craft steps in the rail (Layers · Cut · Assemble); a chat per craft; several views sorted by Muse; the cut queue; the usage ledger |
| [10-analyze-and-chat-first-layers.md](10-analyze-and-chat-first-layers.md) | **Current flow.** Capture → Analyze → Layers (Shape folded in); the breakdown live in the chat timeline; quotes; the layer toolbar, tools and sliders, every action through the chat |

Mockups for these flows (frozen as visual reference since 2026-10-28; the running app is the prototype, see 07 G20):

- `mockups/svelte` (runnable SvelteKit);
- the "Katachi · Snap → Make" design canvas (Overview, Mobile Snap → Make, Mobile Image → Layers, Desktop Image → Layers).

## Three rules carried from the PRD

1. **Models perceive, reason and imagine; code measures and builds geometry.** No model ever emits a coordinate that is cut. Masks come from SAM, and everything after the mask is code.
2. **Ask at the forks, default everywhere else.** The user is asked only where the photo cannot answer:
   - which regions to keep;
   - merge or split a colour group;
   - what fills the hidden areas;
   - which material and which device.
   Every question comes with a proposed default.
3. **One Object, many Impls.** The analysis produces a device-agnostic Object (layers, parts, paths in mm). Changing the device re-plans in code with zero model calls.
