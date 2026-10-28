# 02 · Muse models by stage

Model IDs, endpoints and prices come from `docs/prd/04-model-orchestration.md`; this doc only assigns jobs. Rule: **each model does what it's uniquely good at; everything exact is code.**

## Matrix

| Stage (doc 01) | Model | Call | Why this model | Output consumed by | Fallback |
|---|---|---|---|---|---|
| Voice in (all) | **Muse Voice Transcribe 1.0** | realtime WS via server relay | Low WER and keyword biasing ("kerf", "finger joint", "cardstock") | Spark `converse` | Browser SpeechRecognition → text box |
| Orchestration (all) | **Muse Spark 1.3** | `converse`, `reasoning_effort: low`, UI tools | Fast, parallel tool calls; drives `ask_user` at each fork | UI cards | Scripted default path |
| S2 Classify | **Spark 1.3** | `analyze_image` → `ImageBrief`, strict schema, `medium` | Native multimodal; one call yields class, region phrases, k hint and reference | S3/S4 prompts, S5 routing | Class picker chips; generic phrases ("main subject", "frame", "background") |
| S3 Cutout | **SAM 3.1** | `/responses`, `input_text: subjectPrompt`, one-bit mask | Pixel-exact text-prompted masks | code: matte + outline fit | GrabCut-style colour-distance flood from the image border (code) + "tap the piece" |
| S4 Objects | **SAM 3.1** | fan-out, 1 call per region phrase, in parallel | One concept per request; 3,000 RPM | `RegionSet` | Spark bboxes → rectangular masks, flagged "rough" |
| S4 Naming | **Spark 1.3** | inside S2 (no extra call) | Names regions with intent ("frame ring · likely bought") | Region list copy | Generic labels |
| S5a Colour grade | **code** (k-means OKLab) | — | Deterministic, testable, free | `LayerStack` | — |
| S5a Group names | **Spark 1.3** | `name_layers`, low; sends the palette swatches + a 512 px posterised thumbnail | Cheap and human ("Shadow pines", not "#1E2F25") | Layer list | "Layer n" |
| S5b Multi-view | **Spark 1.3** | `analyze_views`, `high`; 6 images in one call | Long multimodal context; reasons about correspondences and joinery | `FaceSet` (with SAM masks) | Ask for the missing measurement as a number |
| S5b Face masks | **SAM 3.1** | per view, prompt from Spark ("front wall with round hole") | Exact silhouettes | code: mm sizes | Spark bbox |
| S6 Depth ties | **Spark 1.3** | `order_layers`, low; only when the code heuristic is ambiguous | Common sense ("sun sits in front of sky") | order | Lightness order |
| S6 Imagine fill | **Muse Image 1.0** | `/images/edits` on the layer crop with the hidden area painted magenta; prompt "continue the {layer.name} into the magenta area in the same flat paper-cut style, single colour {hex}" | Generate + edit, style-consistent | code re-runs S5a on the crop with k = 1 | Fall back to `extend` |
| S7 Vectorise | **code** (potrace, offset) | — | Must be exact | paths | — |
| S8 Finishing | **Spark 1.3** | `plan_materials`, low; layer colours + user supplies + devices | Knows stain vs paint, glue, spacer depth | Material rows + assembly notes | Nearest-swatch table only |
| Reference edits | **Spark 1.3** → **Muse Image 1.0** | Spark: utterance + circled areas → `EditOp[]`; Image: `/images/edits` on each touched crop | Spark plans and Image paints; layers outside the edit are untouched | S4–S7 on touched regions | Apply only the geometric ops (scale, merge) |
| Preview | **Muse Image 1.0** | `/responses` with the layer sheets in order + material swatches ("render as stacked paper layers with 1.5 mm foam spacers, soft side light") | Multi-reference composition | Preview card ("AI preview") | Code-rendered exploded stack (as in M07/D3) |
| Batch variants | **Muse Wonder 1.0** | background job: "make 6 seasonal variants of this stack" | Long-horizon, tool-heavy, not interactive | Gallery | — |
| Offline edits | **Muse Glimmer** (local) | same `edit_design` tools | Open weights, no network | canvas | Spark |

## Call budget (Image → Layers, paper piece, 8 layers)

| Call | Count | ≈ Cost |
|---|---|---|
| Spark analyze_image (medium) | 1 | $0.01 |
| SAM subject + 5 regions | 6 | $0.015 |
| Spark name_layers (low) | 1 | $0.003 |
| Spark plan_materials (low) | 1 | $0.003 |
| Spark converse turns | ~6 | $0.03 |
| Muse Image preview | 1 | $0.01 |
| *Optional:* Imagine fill, per layer | 0–3 | $0.01 each |
| **Total** | | **≈ $0.07 – $0.10** |

The 6-view 3D path adds 6 SAM calls and one `high` Spark call: about +$0.04.

## Prompt contracts

- Every model output that code consumes is a strict JSON Schema generated from the zod type (`zod-to-json-schema`, `additionalProperties: false`, all keys required, nullable where optional). Today `SceneAnalysisJsonSchema` is hand-written, so generate it instead (doc 04).
- System prompt and tool schemas come first, so they are cacheable; the image and utterance come last.
- Images go in at **1024 px long edge** for Spark (enough for classification, about 4× cheaper than 2048) and **full 2048 px** for SAM.
- Spark never receives masks as pixels. It receives the posterised thumbnail and a palette. It never returns coordinates that get cut, only phrases, labels, choices and numbers that code then validates.
- Each call writes a trace row: `model`, `purpose` (stage id), `latencyMs`, `costUsd`, `source: live|fixture`. "Under the hood" groups rows by stage.

## Open questions to settle with live calls

- **SAM output size.** Does SAM 3.1 return full-resolution masks for 2048 px inputs, or downsample? If it downsamples, upsample in code with an edge-aware refine, using the subject alpha as a guide.
- **Muse Image edits and colour.** Can `/images/edits` keep a flat colour exactly? If not, re-quantise its output to the layer's hex (k = 1) before vectorising. That step is already planned.
- **Multi-image throughput.** What is Spark's multi-image token cost for 6 views? Measure on `samples/` before choosing `high` vs `medium` effort.

## Live-probed corrections (2026-10-28)

Verified against `https://api.meta.ai/v1` with the demo key on
`samples/layered/setting_sun_circle_scene.webp`:

- Spark 1.3 vision accepts the strict `ImageBrief` schema and returns
  `class: layered` with SAM region phrases (5.4 s).
- SAM 3.1 returns `<|box;...|><|mask;data=<h>,<w>,<bits>|>` per concept; the
  mask header is the crop size. `parseSamMasks` in `server/meta/sam.ts` reads
  box + crop size + box area; full bit decode is still open (doc 04 #1).
- Muse Image `/images/edits` requires `images:[{image_url}]` (400 without)
  and returns `b64_json`; `MetaClient.imageEditWith` is the only edit path.
