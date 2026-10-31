# Katachi · the 3-minute submission film: script v0 (dry run)

**Status:** draft for the dry run (2026-10-30). It gets refined after the first render, once we have the real sample runs, their costs and Muse's video options.

## How this film is made

The format follows the shot-list style of the Agora film: every shot has a start time, a narration line, what is on screen, and where the footage comes from.

**Sources:**

| Source | What it is |
|---|---|
| `REC` | A screen recording of the real app, captured by the film run (`docs/tasks/T8-film-capture.md`), sped up as noted. |
| `ANIM` | An animated card or diagram (HTML/CSS rendered to video, or Muse video). |
| `GEN` | Generated B-roll (Muse video). Each one has a prompt. |
| `CARD` | A title, cost or end card. |

**Voice:** one calm English narrator (TTS; Muse voice if available, otherwise Kokoro `af_heart` as in the reference). Narration is about 150 words a minute, about 430 words in all. Captions are the narration lines, burned in at the bottom.

**Costs:** each sample ends on its cost card. `{cost_cat}` and the others are filled from the app's own usage ledger (Under the hood → by craft) after a **live** run. The replayed test runs cost $0 and must not be used for cost cards.

**Credit:** the end card says the film was assembled with Muse, but only once that's true. If a part was made by hand (TTS, ffmpeg), the card says so honestly.

## Act 1 · Why (0:00–0:30)

| t | Source | On screen | Narration |
|---|---|---|---|
| 0:00 | GEN | Macro: a laser head tracing birch, smoke curling, an ember line. *Prompt: "macro shot of a diode laser cutting a thin birch sheet, warm workshop light, shallow depth of field, slow motion".* | "I bought a laser cutter to make things. Then I spent my evenings fighting the software." |
| 0:07 | REC | A busy desktop CAD/laser toolkit, panels everywhere (a generic mock: no real product's branding). | "Every idea started with tracing, layering and guessing the settings." |
| 0:13 | GEN → REC | A phone photographs layered cat wall art on a wall; it becomes the Katachi Home screen. | "What if you could just show it a picture of something that inspires you…" |
| 0:20 | CARD | **Katachi · Snap → Make**, with the tagline "Show it. Say it. Make it." | "…and get pieces you can cut tonight? That's Katachi. Build your world, one sheet at a time." |

## Act 2 · What it is (0:30–0:55)

| t | Source | On screen | Narration |
|---|---|---|---|
| 0:30 | ANIM | The flow as five cards lighting up in turn: **Snap → Analyze → Layers → Cut → Assemble**. | "Snap or upload a photo. Katachi works out what it is: layered art, separate pieces, or a 3D kit." |
| 0:38 | ANIM | The chat column with timeline steps ticking: thinking → working → done, each with a model chip. | "Everything happens in a chat you can see. Each step says what it's doing, and which model did it." |
| 0:45 | ANIM | One action card ("merge", "flip", "smooth", "undo") flowing from both a chat bubble and a toolbar button into the same history stack. | "Ask for a change in plain words, or tap a button: the same actions, the same undo." |
| 0:50 | ANIM | The rule as a two-column card: **Models perceive and reason · Code measures and builds**. | "Meta's models see and decide. Code measures every line you'll cut." |

## Act 3 · Four sample crafts (0:55–2:15)

About 20 seconds each, sped up 4–8× (marked), with real transitions and cut animations.

### 3a · Layered cat wall art, paper on a blade cutter (0:55–1:15)

| t | Source | On screen | Narration |
|---|---|---|---|
| 0:55 | REC ×6 | Upload the cat photo, then Analyze: "Background removed — wall and shadows cleared", then "Split into 4 layers by colour". | "A layered paper cat. Katachi removes the wall, then splits the art into its colour layers." |
| 1:03 | REC ×4 | The exploded view lifts the layers apart; the chat says "make the whiskers finer" and the layer updates. | "Ask for finer whiskers, and only that layer is measured again from your photo." |
| 1:08 | REC ×4 | The cut queue: the 12-inch mat, the blade tracing the program, the waste falling away; then Assemble with the layers flying in from their cards. | "Each sheet is cut, the waste falls away, and the layers stack into the finished piece." |
| 1:13 | CARD | **Cost: {cost_cat}** · Spark ×{n} · SAM ×{n} · Code | "Cost of the models: {cost_cat_spoken}." |

### 3b · Five wooden bookmarks, on a laser (1:15–1:35)

| t | Source | On screen | Narration |
|---|---|---|---|
| 1:15 | REC ×6 | "Found 5 items", then each bookmark shown with its holes (see-through) and its engraving (thin lines). | "Five overlapping bookmarks. Katachi finds each one, and tells the see-through holes from the engraving." |
| 1:22 | REC ×4 | "Each of the 5 items is on its own sheet, upright — turned Elephant 18°…", then "Filled in the hidden edges of Whale". | "It straightens every bookmark, and rebuilds the edge a neighbour was hiding." |
| 1:28 | REC ×4 | The laser bed: engraving first, then holes, then the outline; G-code lines scrolling. | "Engraving first, then the holes, then the outline: real G-code for the laser." |
| 1:33 | CARD | **Cost: {cost_bookmarks}** | "{cost_bookmarks_spoken}." |

### 3c · Laser-cut earrings (1:35–1:55)

| t | Source | On screen | Narration |
|---|---|---|---|
| 1:35 | REC ×6 | The earring photo, then "Found {n} items" and pairs grouped (left + right). | "A tray of earrings. Each pair is kept together." |
| 1:41 | REC ×4 | Chat: "remove the 0% layers", "merge the swirl drop left and right", "undo": three steps, one undo. | "Tidy up in plain words. Every action can be undone." |
| 1:46 | REC ×4 | Cut: layout "Fit to board", earrings packed onto one sheet, some inside others' holes; the kerf note. | "Fit to board packs them onto as few sheets as possible, and adjusts for the width of the beam." |
| 1:52 | CARD | **Cost: {cost_earrings}** | "{cost_earrings_spoken}." |

### 3d · A 3D castle kit, from five photos (1:55–2:15)

| t | Source | On screen | Narration |
|---|---|---|---|
| 1:55 | REC ×6 | Five photos uploaded; Views sorts them: front, three-quarter, close-up, top, cut plan. | "Five photos of a castle kit, in any order. Katachi sorts the views, and spots the cut plan among them." |
| 2:02 | REC ×4 | "Read 11 sheets from your cut plan": A1 to B7, 219 pieces. | "It reads the plan into eleven sheets and over two hundred pieces." |
| 2:07 | REC ×4 | The sheets in Cut; the SVG/DXF download; one sheet opened in a vector app. | "Export SVG or DXF for any laser, or import the kit's original file for exact cuts." |
| 2:12 | CARD | **Cost: {cost_castle}** | "{cost_castle_spoken}." |

## Act 4 · Meta's models, and what each does (2:15–2:45)

| t | Source | On screen | Narration |
|---|---|---|---|
| 2:15 | ANIM | **Muse Spark 1.3** card, filling in with: reads the photo (what it is, material, real size) · sorts views · names layers · turns words into actions. | "Muse Spark is the eye and the brain: it reads each photo, estimates the real size, names the layers, and turns what you say into actions." |
| 2:24 | ANIM | **SAM 3.1** card: removes the background · finds each item and region · outlines an enhanced close-up. | "SAM 3.1 draws the outlines: the background, each item, every region." |
| 2:31 | ANIM | **Muse Image** card: sketch to line art · imagines hidden parts · renders the finished piece. | "Muse Image cleans sketches, imagines what's hidden, and renders the finished piece." |
| 2:37 | ANIM | **Code** card: tracing · holes vs engraving · straighten · G-code · nesting · kerf. Then a total-cost bar for all four crafts: **{cost_total}**. | "And code does the measuring: every line, hole and move. All four crafts cost {cost_total_spoken} in model calls." |

## Act 5 · Close (2:45–3:00)

| t | Source | On screen | Narration |
|---|---|---|---|
| 2:45 | GEN | Finished pieces on a shelf: the cat, the bookmarks in a book, earrings on a stand, the castle lit. *Prompt: "warm shelf display of handmade laser-cut crafts, layered paper cat art, wooden bookmarks, earrings, a small lit wooden castle, soft evening light".* | "From a photo of something you love, to pieces in your hands." |
| 2:52 | CARD | **Katachi** · katachi.sensei-hq.com · the breakdown page link · "Film assembled with Muse" (true parts only) · Meta AI Developer Hackathon 2026. | "Katachi. Build your world." |

## The breakdown page (static, hosts the film)

1. **The film** at the top, with captions on.
2. **Why Katachi:** the Longer Ray 5 story (cutting simple shapes was easy; turning an inspiring picture into cut files wasn't), and how it fits *Build your world*.
3. **The flow:** Snap → Analyze → Layers → Cut → Assemble, one short paragraph and a screenshot each.
4. **The four samples, step by step:** for each, the input photo, each timeline step with its model chip and time, the layers, the sheets, the cut animation as a GIF, the output files (SVG / DXF / G-code), and the **cost table** from the usage ledger.
5. **Models and APIs:** a table of model → job → route → typical cost (from `content/agents.ts`), plus the rule *models perceive and reason; code measures and builds*.
6. **How it's built:** the action set (design/14), the craft model and the cut plan (design/15), and the tests (unit count, e2e on four samples).
7. **Try it:** the link, and the invite note.

## Plan B (if recordings or Muse video fall short)

- A slide deck, one slide per shot row, rendered to video with the same narration.
- REC shots become screenshots with a slow push-in.
- Keep the costs and the model section: they carry the story.

## The dry run, and what to learn from it

1. Run the film capture (T8) live on the four samples. Collect the recordings, the chapter timestamps and the cost ledger.
2. TTS the narration. Measure each line's length, and adjust the speed-ups so each shot fits its slot.
3. Ask Muse for: the three GEN shots, a title card, and (if it can) the whole assembly from this script and the recordings.
4. Review: what Muse can and can't do, which shots read too fast, where captions overflow, and whether the costs are real. Then write v1 of this script.
