# 10 · Analyze, and a chat-first Layers screen

Status: built (2026-10-29). Supersedes the Shape step of 07 §1 and the Layers inspector of 09.

## What changed and why

User feedback on the black-cat sample:

- **An extra step.** After Capture, the user had to press Continue, then go through Import, Cutout and Segment before reaching the layers. That repeated the capture step and cost three extra clicks.
- **Clumsy Layers screen:**
  - A layer inspector and its correction box filled the chat column and broke the conversation.
  - "Edit in work area" led to a placeholder.
  - Thick 3 px coloured strokes covered the photo's own sharp lines ("blocky lines").
- **Wanted:**
  - Every AI action visible in the chat as it happens: thinking, doing, done.
  - Every user action going through the chat.
  - Being able to quote a layer or an earlier message.
  - Tools on the work area.

## The flow

The journey now has four steps: **Capture → Layers → Sheets → Assemble**.

**Capture → Analyze.** The single-shot primary button is **Analyze** (a remix still says Continue and goes to its changes). `startFromCapture` sets `reached` to Layers and opens `/make/layers`.

**Layers is the breakdown.** Opening it runs `jobsOnVisit.layers = shape.cutout → shape.segment → layers.plan`. Each job waits for the one before it, and each stage is a **timeline step** in the chat (`ConversationState.think / work / done / fail`):

| Step | Thinking | Done (example) |
|---|---|---|
| look | Muse Spark reads what it is | I see layered floral black cat wall art · one stacked piece · paper |
| cutout | backdrop from the photo edge, SAM as a hint (or "you asked for the wall to go") | Background removed · the subject is 40.9% of the photo |
| items | one stacked piece or separate items? | Found 1 item … / Found 4 items: Fox · Owl · Leaf · Moon |
| layers | colours grouped in Lab, back to front / one cut per item | Split into 4 layers by colour (swatches) / 4 items · 4 layers |

How each step behaves:

- **Model calls attach to their step.** `MuseAgents.onFinish → logCall(call, job)`, so each step shows its model, cost and time on the same row. Code-measured work is labelled **Code**: `AgentTask.model` overrides the job's usual model.
- **Re-runs add new rows.** A rebuild ("remove the wall", "use 3 layers") bumps a run counter, so its steps appear as new timeline rows and the history stays readable.
- **The work area follows along** (and outside the subject the background is gone: a checkerboard, not a dimmed wall):
  - the photo
  - then the photo with the background removed
  - then the outlines of the items or colour groups
  - then the editor
- **A status pill** on the work area names the open step (`AppState.working`). It replaces the old activity strip above the page.

Import, Cutout and Segment are folded in:

- `legacyPath` redirects their URLs to `/make/layers`.
- A saved craft that was left on one of them reopens on Layers.
- The `steps` ids stay as they are, so the `reached` indices of saved crafts keep their meaning.

## The chat timeline

The timeline pattern is ported from Rokkit's learn app (`apps/learn/src/lib/chat`: IconTimeline + ChatMessage kinds). `@rokkit/ui` 1.9 ships ChatShell, ChatTimeline and a generic Timeline, but not the icon-per-turn conversation, so Katachi keeps:

- `components/chat/IconTimeline.svelte`
- `components/chat/ThinkingDots.svelte`
- `components/chat/TimelineEntry.svelte`
- `components/chat/QuoteCard.svelte`

These are candidates to promote to Rokkit.

Each kind of row has its own icon:

- **You:** user icon, plus the quoted layer or message as a card with a small preview.
- **Katachi:** magic-stick icon, text and actions. Hovering shows *Quote this in your reply*.
- **Step:** thinking dots, then a spinner, then a check or a warning. Shows the title, detail and layer swatches (tap one to quote that layer), then the model calls.
- **Suggestions:** inline after the last entry, for example *Remove the shadows · Remove the wall · Keep the fine details in this layer*. Clicking one sends it as a message.

**Quote:** `AppState.quote` holds the quote. It shows as a card above the composer and rides with the next message (`LogEntry.quote`). A quoted layer is what the correction applies to, ahead of a layer named in the text and of the selected layer.

## The Layers editor

The left column lists **items**, each with its layers (`LayerFlowState.items`):

- one stacked piece owns every layer
- separate items (bookmarks) each own theirs

Each layer row has a spotlight thumbnail, its shows/hidden %, a quote button and an eye. The chat column has no page content.

The **toolbar on the layer pane** has:

- **The selected layer:** its swatch, number, name and shows %.
- **Tools:**
  - *Pick* (click the photo to select the front-most layer there)
  - *Select an area* (smooth / reduce jitter inside it)
  - *Grab and move*
  - *Draw a line* (with a width)
  - *Draw a circle*
  - an *Adds / Cuts* switch for the line and circle
- **Sliders:** *Detail* (1 blocky … 5 fine) and *Weight* (−3 thinner … +3 bolder).
- **View:** All layers · This layer · Its sheet · Exploded.

A **layer's own actions float by its row** when it is selected: show only this layer, hide/show, quote, duplicate, **merge with…** (any other layer; their masks are joined, and split undoes it), split. Nothing appears twice. Next steps (*Review the gaps*) are chat suggestions, not buttons on the work area.

**Everything goes through the chat.** `AppState.layerAction(n, action)`:

1. says the action as **your** message, with the layer quoted ("Detail 5 of 5 · weight +1", "Add a circle", "Reduce the jitter in this area")
2. applies it
3. lands the result as a **step**: "Done — Layer 3 · White Floral Petals: detail 5 of 5 (fine), weight +1 · Now 11.8% shows"

Mask edits are code (`domain/layering.refineLayer`), run in the worker:

- `tune` re-measures the layer's colour from the photo. Detail sets how much it is cleaned (open/close radius) and how it is traced (`traceFor`: simplification and rounding). Weight dilates or erodes.
- `shape` rasterises a drawn circle or capsule-shaped line and adds or cuts it.
- `smoothArea` opens and closes the mask inside the selected box. Strength 3 also traces looser, which reduces the jitter.
- Move is a pure path translate (`translatePaths`).
- In the chat, "smooth" or "jitter" with an area selected applies to that area.

## The pipeline, end to end

1. **See:** Muse Spark names what it is, the kind of craft (layered artwork, laser-cut pieces, 3D object), the likely material (paper, wood, acrylic) and its **real size**. A photo has no scale, so Spark estimates it from what the thing is ("a bookmark is about 50 × 180 mm", "layered wall art 30–45 cm") and gives the basis (`ImageBrief.realSizeMm`).
2. **Outline:** the background is removed (code, with SAM 3.1 as a hint). "Remove the wall" never eats the art: if the harder pass loses more than 15% of the normal outline, the normal outline is kept and only its fringe is trimmed.
3. **Items:** one piece, or several separate items (SAM per item). For several items, the size estimate fits the median item, so one fanned or hidden item does not skew the scale.
4. **Layers per item:**
   - A stacked piece splits into its colour layers.
   - A wooden or acrylic item becomes a **cut outline plus its engraving**. The engraving is the darker tone measured inside the item, and it runs first.
5. **Tweak:** smooth, clean up, finer or blockier, merge, fill to one outline, move, draw. Every change is said in the chat and autosaved.
6. **Export or send:** a virtual run per pass.

## How it is built

A craft with one item has a **How it's built** switch, set from the photo:

| Build | Sheets | Chosen when |
|---|---|---|
| Stacked | Additive: each layer includes the ones in front of it, on a **solid backing** (the back layer is the whole outline, in the back colour) | the photo is layered art, or shows shadows or depth |
| Inlay | Each colour is its own piece; they fit together on the backing | flat colour pieces |
| Engrave + cut | One board: the inner layers are engraved first, then the outline is cut | a flat wood piece |

Where each build shows up:

- `LayerFlowState.sheetPointsFor` / `cutPathFor` give each layer's sheet for the chosen build.
- `opFor` says whether a sheet is cut or engraved.
- `passOrder` puts engraving before cutting.
- On Layers, the **Its sheet** view shows the selected layer's sheet.
- The **Exploded** view is the landing hero's isometric stack, drawn from your photo: each layer's sheet in its colour, with the photo's own pixels on top.

## Real size

- `widthMm` is the photo's width in mm. With the photo's `aspect`, it maps the 0–1000 path units to mm on each axis, so non-square photos are no longer squeezed.
- Spark's estimate calibrates `widthMm`.
- On Layers, *Real size W × H mm* (or "make it 300 mm wide", "40 cm tall", "scale it to 50%" in the chat) rescales the piece with its proportions kept, and Sheets traces again at that size.
- Items show their own sizes, and Sheets frames each piece with its dimensions.

## The virtual run (Sheets, Burn Watch)

The device preview (`CutPreview`) runs each pass:

1. a blank sheet in the material's colour
2. the engraving swept in, line by line
3. the cut traced by the head
4. the extra pieces vanish, leaving the piece

On Sheets, **Play the whole run** goes through every pass from start to end (`AppState.playRun`). Burn Watch shows the same preview for the cut on the bed. The work area (`/canvas`) and Burn Watch draw each layer's traced sheet, not the illustration.

## Sharp lines

`PhotoStage` overlays are hairlines (0.75–1.5 px, non-scaling). The selected layer is a **spotlight**: the photo's own pixels inside its mask, everything else dimmed to 14%, and an accent hairline around it. Nothing is painted over the art, so whiskers and fine strokes stay crisp. Thumbnails and quote cards use the same spotlight, without the outline.

## Phone

- The landing hero tells the whole story on phones too: your picture ↓ Muse Spark · SAM 3.1 ↓ the exploded layers ↓ Muse Image · Code ↓ cut & assembled. Before, only the centre animation showed.
- Layers on a phone stacks the toolbar (scrolls sideways), the work area, the items list and the action. The chat sheet has the same timeline, quotes and inline suggestions.

## Version

The running version shows in Settings → About, at the foot of the studio rail and in the landing footer, and at `/api/version`. Bump it with `bun run bump --patch|--minor|--major` (bumpp, following the sensei convention). It starts at 0.1.0.
