# Katachi · the submission film: script v2 (deck + app demos, your voice)

**Status:** v2.1 (2026-11-02). It adds a 1 s pause on each slide before the voice; the cat now shows the stack said in the chat (five layers, each with the outline); every number matches the latest live captures (cat $0.022, earrings $0.032, bookmarks $0.021, $0.075 in all); and the opening says the film is made with Muse Code. **Re-record takes 1, 2, 4, 5, 6, 7, 9, 10 and 11** (3 and 8 are unchanged).

v2 (2026-11-02). It replaces v1, the Muse-made montage: that voice read as robotic and the cut jumped around. v2 is the deck (`docs/submission/katachi-deck.pptx`, also at `/slides`) with **your voice** reading the speaker notes. A sped-up recording of the real app plays after each of the three example slides, and the app's cost pill stays in view.

**Length:** about 2:55 (your takes' pace; the build warns above 178 s, because judges stop at 3:00). Eleven takes of about 35–43 words each, around 400 words in all. **Assembly:** `python3 docs/film/build.py` (ffmpeg). **Output:** `docs/film/out/katachi-demo.mp4`, plus `.vtt` and `.srt` captions.

## How the film runs

| # | Slide | On screen | About |
|---|---|---|---|
| 1 | Katachi | The title slide, slow push-in | 19 s |
| 2 | Why | The slide | 17 s |
| 3 | What it does | The slide | 15 s |
| 4 | **Example 1 · the cat** | Slide for 2 s, then the **cat recording** sped up to fill the take: Analyze, then the stack typed in the chat and **Built 5 layers to your stack**, the exploded view, the cut and Assemble. The cost card ($0.022) shows for the last 2.5 s. | 19 s |
| 5 | **Example 2 · earrings** | Slide for 2 s, then the **earrings recording**, then the cost card ($0.032) | 17 s |
| 6 | **Example 3 · bookmarks** | Slide for 2 s, then the **bookmarks recording**, then the cost card ($0.021) | 17 s |
| 7 | Architecture | The slide | 15 s |
| 8 | Actions | The slide | 14 s |
| 9 | Status (honest limits) | The slide | 16 s |
| 10 | Roadmap | The slide | 15 s |
| 11 | Build your world | The close | 14 s |

Each slide shows for 1 s before its take starts. On the example slides the take keeps playing over the recording. A demo gets at least 15 s even when the take is shorter. Segments cross-fade (0.4 s), and captions come from the takes.

## Recording your voice

**Where:** a small, soft room (a closet of clothes is ideal) or a car. Keep away from fans and fridges.

**Mic:** any headset or USB mic, or your phone held a hand-width from your mouth and slightly to the side. On a Mac, QuickTime → *File → New Audio Recording* works.

**How to read:**

- Read each take as if you were telling one friend about it, not presenting.
- Smile on the first and last lines; the voice hears it.
- Leave a breath of silence at the start and end. The build trims nothing; it adds 1 s before each take and 0.3 s after.
- One take per file. If you stumble, redo the whole take; don't patch.
- Pace is about 150 words a minute. Every take below should run 13–17 s.
- Keep the same distance, room and energy for all eleven. Record them in one sitting.

**Files:** save them as `docs/film/takes/take-01.wav` … `take-11.wav`. `.m4a`, `.mp3` and `.aiff` also work. The old Muse takes in `docs/film/vo/` are no longer used.

## The takes

> Pronunciation: **Katachi** = *ka-TAH-chee*. **Muse Spark**, **SAM three-point-one**. Read the site as *katachi dot sensei-hq dot com*.

**take-01 · Katachi** · *new: re-record*
I’m Jerry. I own a desktop laser, and Katachi is the tool I wished I had: show it a photo you love, and get pieces you can cut. It’s a prototype, built this week on Meta’s models, and this film was made with Muse Code, generated voice included.

**take-02 · Why** · *new: re-record*
When I got my laser, cutting simple shapes was easy. Turning a picture into cut files took hours of tracing and guessing. So I brought Meta’s models into a craft I know first-hand.

**take-03 · What it does**
Snap a photo. Katachi finds the items and layers, cleans them up, lays out sheets for your machine, and guides assembly. You can say what you want or tap a button: the same actions, with one undo.

**take-04 · Example 1, the cat** *(the cat recording plays under it)* · *new: re-record*
Example one, a layered cut. I tell Katachi how to stack it: a solid white base, black with the whiskers cut through, then red, white flowers and gold, every layer keeping the outline. Five sheets, built to that plan. Two cents.

**take-05 · Example 2, earrings** *(the earrings recording)* · *new: re-record*
Example two, a collage of crafts. From one tray photo it finds the earrings, matches the pairs by shape and cuts each pair to one size, with repeated holes evened out. About three cents.

**take-06 · Example 3, bookmarks** *(the bookmarks recording)* · *new: re-record*
Example three, a set. Five bookmarks, overlapping and shot at an angle. Katachi corrects the perspective, stands each one upright, rebuilds the hidden edges, and makes all five one size. Two cents.

**take-07 · Architecture** · *new: re-record*
Under the hood: the browser holds the craft and code does all the geometry. A Cloudflare worker keeps the key server-side. Muse Spark reads and plans; SAM 3.1 outlines. Models never emit coordinates.

**take-08 · Actions**
Every edit is one action with one contract, shared by the chat and the buttons. Simple phrases run instantly. Complex requests go to Muse Spark, which plans the steps as a single undoable change.

**take-09 · Status** · *new: re-record*
To be clear: this is a prototype, not a finished product. The core works, but traces still follow the photo, hidden fretwork is rebuilt solid, and real size is an estimate.

**take-10 · Roadmap** · *new: re-record*
Next: one clean cut line per piece, a reference card for true millimetres, and real cuts on a real machine. Then Muse Image for hidden detail, and jobs sent straight to the cutter. Later, 3D flat-pack.

**take-11 · Close** · *new: re-record*
Three crafts, under eight cents of Meta model calls. The hard part, seeing what to cut, already works. Build your world, one sheet at a time, at katachi dot sensei-hq dot com.

These are the speaker notes from the deck and `/slides`, word for word (`app/src/lib/content/site.ts`; `docs/film/takes.json` is the copy the build reads). If you change a line, change it in both places so the captions match.

## The app recordings

The film capture records the real app at 1920×1080 with the cost pill in the header:

```sh
cd app
FILM_BASE_URL=https://katachi.sensei-hq.com bun run film -- cat earrings bookmarks
```

It writes `test-results/film/<sample>.webm`, `.chapters.json` and `.costs.json`. The build picks them up from there. The cost card shows the `totalUsd` from each `.costs.json`; it falls back to the figure in `takes.json`.

| Recording | State | Note |
|---|---|---|
| `cat.webm` | **Re-capture** | The cat film now types the stack (`tests/film/cat.film.ts`, STACK_ASK) and waits for *Built 5 layers to your stack*, then the exploded view. |
| `earrings.webm` | **Have it** (11/2, $0.032) | 28 pieces found on the tray; the slide and narration say so (no “twenty-four”). |
| `bookmarks.webm` | **Have it** (11/2, $0.021) | |

To use a different take of a recording, drop it in `docs/film/clips/<sample>.webm`, which wins over the capture. To trim one, set `clip_in` and `clip_out` (seconds) for it in `takes.json`. The whole recording is squeezed into the demo's time: a 60 s capture in 16 s plays at about 4×.

## Building the film

```sh
python3 docs/film/build.py --check   # what's missing, and how long each segment will run
python3 docs/film/build.py           # docs/film/out/katachi-demo.mp4 (+ .vtt, .srt)
```

The build needs these inputs:

- `docs/film/slides/slide-01.png` … `slide-11.png`, the deck at 1920×1080.
- To re-render them after editing the deck:
  ```sh
  soffice --headless --convert-to pdf katachi-deck.pptx && pdftoppm -png -scale-to-x 1920 -scale-to-y 1080 katachi-deck.pdf slides/slide
  ```
- An optional `docs/film/music.mp3`, laid in quietly and ducked under your voice.

Your voice is loudness-normalised to −16 LUFS.

**Publishing it on the site:**

1. Copy `out/katachi-demo.mp4` and `out/katachi-demo.vtt` to `app/static/film/`.
2. Deploy. `/story` plays the video with captions.

The file must stay **under 25 MiB**, because Cloudflare serves static files only up to that size. The build warns if it isn't. At this length and CRF 22 it should come out at about 10–20 MB. If it's over, raise `-crf` in `build.py`.

## Plan B

If a recording isn't ready, remove the `clip` entry for that slide in `takes.json`. That slide then holds with its push-in for the whole take; slides 4–6 already show the stills and costs.
