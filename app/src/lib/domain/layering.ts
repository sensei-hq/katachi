// Photo → subject mask → colour layers, measured in code (models perceive; code measures).
// Used when SAM gives no usable outline, when the user asks for the background to go, and to turn a
// layered-art photo into its colour layers: SAM finds *objects* by phrase, but the layers of a paper or
// wood piece are *colour groups*, so each layer's mask comes from the photo's pixels, not from a phrase.
// Pure functions on RGBA pixel arrays; no DOM. Paths come back in 0-1000 image coordinates.
import { traceMask, type Mask } from './vector';
import { hullOf } from './toolpath';
import type { PixelImage } from './colour';

export type Lab = [number, number, number];

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function hexToLab(hex: string): Lab | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
/** colour distance that forgives lighting: brightness counts less than hue and chroma (shadows on a wall) */
export function shadeDistance(a: Lab, b: Lab, lightWeight = 0.35): number {
  return Math.hypot((a[0] - b[0]) * lightWeight, a[1] - b[1], a[2] - b[2]);
}
const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function labsOf(img: PixelImage): Float32Array {
  const out = new Float32Array(img.w * img.h * 3);
  for (let i = 0; i < img.w * img.h; i++) {
    const [L, A, B] = rgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    out[i * 3] = L; out[i * 3 + 1] = A; out[i * 3 + 2] = B;
  }
  return out;
}
const labAt = (labs: Float32Array, i: number): Lab => [labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]];

/** k-means in Lab over the given pixel indices (deterministic: seeded by the given centres or by spread picks). */
export function kmeans(labs: Float32Array, idx: number[], k: number, seeds: Lab[] = [], iters = 12): { centres: Lab[]; assign: Int16Array } {
  const centres: Lab[] = seeds.slice(0, k).map((s) => [...s] as Lab);
  // farthest-point picks for the rest, so small but distinct colours (white petals, red leaves) get a centre
  const sample = idx.length > 6000 ? idx.filter((_, i) => i % Math.ceil(idx.length / 6000) === 0) : idx;
  if (!centres.length && sample.length) centres.push(labAt(labs, sample[Math.floor(sample.length / 2)]));
  while (centres.length < k && sample.length) {
    let best = sample[0], bestD = -1;
    for (const i of sample) { const p = labAt(labs, i); const d = Math.min(...centres.map((c) => dist(p, c))); if (d > bestD) { bestD = d; best = i; } }
    centres.push(labAt(labs, best));
  }
  const assign = new Int16Array(idx.length);
  for (let it = 0; it < iters; it++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    idx.forEach((i, j) => {
      const p = labAt(labs, i); let bi = 0, bd = Infinity;
      centres.forEach((c, ci) => { const d = dist(p, c); if (d < bd) { bd = d; bi = ci; } });
      assign[j] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    centres.forEach((c, ci) => { const s = sum[ci]; if (s[3]) { c[0] = s[0] / s[3]; c[1] = s[1] / s[3]; c[2] = s[2] / s[3]; } });
  }
  return { centres, assign };
}

function neighbours4(i: number, w: number, h: number): number[] {
  const x = i % w, y = (i - x) / w, out: number[] = [];
  if (x > 0) out.push(i - 1); if (x < w - 1) out.push(i + 1); if (y > 0) out.push(i - w); if (y < h - 1) out.push(i + w);
  return out;
}
/** connected components of a mask, largest first */
export function components(bits: Uint8Array, w: number, h: number): number[][] {
  const seen = new Uint8Array(w * h), out: number[][] = [];
  for (let s = 0; s < w * h; s++) {
    if (!bits[s] || seen[s]) continue;
    const comp: number[] = [], stack = [s]; seen[s] = 1;
    while (stack.length) { const i = stack.pop()!; comp.push(i); for (const n of neighbours4(i, w, h)) if (bits[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}
/** fill holes: background pixels not reachable from the border become foreground */
export function fillHoles(bits: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h), stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) { const i = stack.pop()!; if (outside[i] || bits[i]) continue; outside[i] = 1; for (const n of neighbours4(i, w, h)) if (!outside[n] && !bits[n]) stack.push(n); }
  const out = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1; return out;
}
function erode(bits: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bits[i] && neighbours4(i, w, h).every((n) => bits[n]) && neighbours4(i, w, h).length === 4 ? 1 : 0;
  return out;
}
function dilate(bits: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bits[i] || neighbours4(i, w, h).some((n) => bits[n]) ? 1 : 0;
  return out;
}

export interface SubjectOptions {
  /** how far (Lab, light-forgiving) a pixel may be from the wall/backdrop colours to count as background */
  tolerance?: number;
  /** remove harder: wider tolerance and a stricter shape clean-up (the user asked for the backdrop to go) */
  strict?: boolean;
  /** an outline from SAM (0-1000 coords): the subject is kept to its neighbourhood */
  hint?: Uint8Array | null;
}
/**
 * Background removal by colour: the backdrop is whatever the photo's border looks like (a wall, with its
 * shadows, a shelf). Flood from the border through backdrop-coloured pixels, keep the largest object, fill
 * its holes. Returns 1 for subject pixels.
 */
export function subjectMask(img: PixelImage, opts: SubjectOptions = {}): { bits: Uint8Array; backdrop: Lab[]; areaPct: number } {
  const { w, h } = img, labs = labsOf(img);
  const border: number[] = [];
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) border.push(y * w + x);
  // the backdrop's colours: a few clusters of the border (lit wall, shadowed wall, shelf…)
  const { centres, assign } = kmeans(labs, border, 4, [], 8);
  const counts = centres.map((_, ci) => assign.filter((a) => a === ci).length);
  // each backdrop colour gets a tolerance from its own spread: a textured, shadowed wall is wide, a plain
  // shelf strip is tight (so a gold rim next to it is not mistaken for shelf)
  const spread = centres.map((c, ci) => { let s = 0, n = 0; border.forEach((i, j) => { if (assign[j] === ci) { s += shadeDistance(labAt(labs, i), c) ** 2; n++; } }); return n ? Math.sqrt(s / n) : 0; });
  const keepIdx = centres.map((_, ci) => ci).filter((ci) => counts[ci] >= border.length * 0.08);
  const backdrop = keepIdx.map((ci) => centres[ci]);
  const base = opts.tolerance ?? (opts.strict ? 16 : 12);
  const tols = keepIdx.map((ci) => Math.max(6, Math.min(base + (opts.strict ? 4 : 0), 2.5 * spread[ci] + 3)));
  const isBack = (i: number) => { const p = labAt(labs, i); return backdrop.some((c, k) => shadeDistance(p, c) < tols[k]); };
  const bg = new Uint8Array(w * h), stack: number[] = [];
  for (const i of border) if (isBack(i)) stack.push(i);
  while (stack.length) { const i = stack.pop()!; if (bg[i]) continue; bg[i] = 1; for (const n of neighbours4(i, w, h)) if (!bg[n] && isBack(n)) stack.push(n); }
  let fg: Uint8Array = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) fg[i] = bg[i] ? 0 : 1;
  // open (erode→dilate) cuts thin bridges to plants and props, then keep the main object
  fg = dilate(erode(fg, w, h), w, h);
  if (opts.strict) fg = dilate(erode(fg, w, h), w, h);
  const comps = components(fg, w, h);
  const keep = new Uint8Array(w * h);
  const main = comps[0] ?? [];
  if (opts.hint) {
    // with an outline hint: keep every sizeable piece that overlaps it (a cat plus the flowers around it)
    for (const c of comps) { if (c.length < main.length * 0.04) continue; const over = c.filter((i) => opts.hint![i]).length; if (over / c.length > 0.3 || c === main) for (const i of c) keep[i] = 1; }
  } else for (const i of main) keep[i] = 1;
  let bits = fillHoles(keep, w, h);
  let ones = 0; for (const v of bits) ones += v;
  if (opts.strict && !opts.tolerance) {
    // "remove the wall" must never eat the art: when the harder pass loses a real part of the subject (dark
    // flowers in shadow look like the wall), keep the normal outline and only trim its fringe (shadow halos)
    const normal = subjectMask(img, { hint: opts.hint });
    let n = 0; for (const v of normal.bits) n += v;
    if (ones < n * 0.85) {
      bits = fillHoles(erode(normal.bits, w, h), w, h);
      ones = 0; for (const v of bits) ones += v;
    }
  }
  return { bits, backdrop, areaPct: Math.round((ones / (w * h)) * 1000) / 10 };
}

/** colour names Spark tends to use in layer titles, for matching titles to measured colour groups */
const NAMED: Record<string, string> = {
  black: '#151515', white: '#F1ECE4', cream: '#EFE3C8', ivory: '#EFE7D6', gold: '#D19A45', golden: '#D19A45', yellow: '#E8C547', orange: '#E07B39',
  red: '#B53A2C', crimson: '#9E1B32', pink: '#E59AA8', rose: '#D4697E', purple: '#7B4F9D', violet: '#7B4F9D', blue: '#3A6EA5', navy: '#1F3456', teal: '#2D7F7A',
  green: '#4F7A3A', sage: '#8A9A6B', olive: '#6B6A2E', brown: '#6B4A2F', tan: '#C8A57A', beige: '#D9C3A0', grey: '#8A8A8A', gray: '#8A8A8A', silver: '#B8B8B8', copper: '#B06A3B'
};
export function colourOfTitle(title: string): Lab | null {
  const t = title.toLowerCase();
  for (const [word, hex] of Object.entries(NAMED)) if (new RegExp(`\\b${word}\\b`).test(t)) return hexToLab(hex);
  return null;
}
const toHex = (l: Lab): string => {
  // Lab → sRGB for the swatch
  const fy = (l[0] + 16) / 116, fx = fy + l[1] / 500, fz = fy - l[2] / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const r = X * 3.2406 + Y * -1.5372 + Z * -0.4986, g = X * -0.9689 + Y * 1.8758 + Z * 0.0415, b = X * 0.0557 + Y * -0.204 + Z * 1.057;
  const gam = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return `#${[r, g, b].map((c) => gam(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

export interface ColourLayer {
  /** back → front position (1 = back) */
  n: number; name: string; hex: string;
  /** what shows of this layer in the finished piece (0-1000 image coordinates) */
  visiblePaths: [number, number][][];
  /** the whole sheet: what shows plus what sits under the layers in front (the default "extend behind") */
  sheetPaths: [number, number][][];
  visiblePct: number; hiddenPct: number;
}

/**
 * Split the subject into colour layers. k comes from the brief (colour groups) or the titles; titles that
 * name a colour ("Red leaf filler") seed and label their group, the rest are named by their colour.
 * Order back → front: groups that make the outline sit at the back, interior detail at the front.
 */
export function colourLayers(img: PixelImage, subject: Uint8Array, opts: { k?: number; titles?: string[]; minPct?: number } = {}): ColourLayer[] {
  const { w, h } = img, labs = labsOf(img);
  const idx: number[] = []; for (let i = 0; i < w * h; i++) if (subject[i]) idx.push(i);
  if (!idx.length) return [];
  const titles = opts.titles ?? [];
  const named = titles.map((t) => ({ title: t, lab: colourOfTitle(t) }));
  const seeds = named.filter((x) => x.lab).map((x) => x.lab!) as Lab[];
  const k = Math.max(2, Math.min(8, opts.k ?? (titles.length || 5)));
  const { centres, assign } = kmeans(labs, idx, k, seeds);
  // label map with a 3×3 majority vote, so shading does not shatter a layer into specks — but only for
  // pixels whose colour is ambiguous between two groups: a crisp white whisker or fur stroke that clearly
  // matches its group is kept even when it is one pixel wide (fine detail is the point of a top layer)
  const label = new Int16Array(w * h).fill(-1);
  const crisp = new Uint8Array(w * h);
  idx.forEach((i, j) => {
    label[i] = assign[j];
    const p = labAt(labs, i); const ds = centres.map((c) => dist(p, c)).sort((a, b) => a - b);
    if (ds[1] - ds[0] > 18) crisp[i] = 1;
  });
  const smooth = new Int16Array(label);
  for (const i of idx) {
    if (crisp[i]) continue;
    const x = i % w, y = (i - x) / w, votes = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const l = label[yy * w + xx]; if (l >= 0) votes.set(l, (votes.get(l) ?? 0) + 1); }
    let best = label[i], bv = 0; for (const [l, v] of votes) if (v > bv) { bv = v; best = l; }
    smooth[i] = best;
  }
  // merge groups that are the same colour, drop specks below minPct into their nearest group
  const total = idx.length, minPct = opts.minPct ?? 0.6;
  const count = centres.map((_, ci) => idx.filter((i) => smooth[i] === ci).length);
  const alias = centres.map((_, ci) => ci);
  centres.forEach((c, ci) => {
    if (count[ci] / total * 100 >= minPct) { for (let cj = 0; cj < ci; cj++) if (alias[cj] === cj && count[cj] && dist(c, centres[cj]) < 10) { alias[ci] = cj; break; } return; }
    let best = -1, bd = Infinity; centres.forEach((o, cj) => { if (cj !== ci && count[cj] / total * 100 >= minPct && dist(c, o) < bd) { bd = dist(c, o); best = cj; } });
    if (best >= 0) alias[ci] = best;
  });
  // a small group whose colour lies between two bigger ones is a blend (anti-aliased rims, shadow at a
  // layer edge, a highlight on a curve), not a layer: fold it into the nearer of the two
  const sized = () => centres.map((_, ci) => idx.filter((i) => alias[smooth[i]] === ci).length);
  let sizes = sized();
  for (let pass = 0; pass < 3; pass++) {
    const live = centres.map((_, ci) => ci).filter((ci) => alias[ci] === ci && sizes[ci]);
    for (const ci of live) {
      if (sizes[ci] / total * 100 >= 10) continue;
      const big = live.filter((o) => o !== ci && sizes[o] > sizes[ci]);
      let into = -1;
      for (const a of big) for (const b of big) {
        if (a >= b) continue;
        const ab = dist(centres[a], centres[b]);
        if (dist(centres[a], centres[ci]) + dist(centres[ci], centres[b]) < ab * 1.12) into = dist(centres[a], centres[ci]) < dist(centres[b], centres[ci]) ? a : b;
      }
      if (into >= 0) { centres.forEach((_, cj) => { if (alias[cj] === ci) alias[cj] = into; }); }
    }
    sizes = sized();
  }
  for (const i of idx) smooth[i] = alias[smooth[i]];
  const groups = [...new Set(alias)];
  // depth: distance to the subject's edge — the back layer carries the outline
  const edgeDist = new Float32Array(w * h).fill(Infinity), queue: number[] = [];
  for (const i of idx) if (neighbours4(i, w, h).some((n) => !subject[n]) || neighbours4(i, w, h).length < 4) { edgeDist[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) { const i = queue[q]; for (const n of neighbours4(i, w, h)) if (subject[n] && edgeDist[n] > edgeDist[i] + 1) { edgeDist[n] = edgeDist[i] + 1; queue.push(n); } }
  const stats = groups.map((g) => {
    let n = 0, d = 0, edge = 0; for (const i of idx) if (smooth[i] === g) { n++; d += edgeDist[i]; if (edgeDist[i] <= 1) edge++; }
    return { g, n, depth: n ? d / n : 0, edgeShare: n ? edge / n : 0 };
  }).filter((s) => s.n);
  stats.sort((a, b) => b.edgeShare - a.edgeShare || a.depth - b.depth);
  // titles: a colour-named title goes to the nearest group; remaining titles (no colour word) fill in by order
  const used = new Set<number>(), titleFor = new Map<number, string>();
  for (const x of named.filter((x) => x.lab)) {
    let best = -1, bd = Infinity; stats.forEach((s, si) => { if (used.has(si)) return; const d = dist(centres[s.g], x.lab!); if (d < bd) { bd = d; best = si; } });
    if (best >= 0 && bd < 45) { used.add(best); titleFor.set(best, x.title); }
  }
  const rest = named.filter((x) => !x.lab).map((x) => x.title);
  const colourWord = (l: Lab) => { let best = 'Colour', bd = Infinity; for (const [word, hex] of Object.entries(NAMED)) { const d = dist(l, hexToLab(hex)!); if (d < bd) { bd = d; best = word; } } return best[0].toUpperCase() + best.slice(1); };
  // speck filter scaled to the working size: small enough to keep whiskers and fur strokes as cut lines
  const turd = Math.max(3, Math.round(w * h * 0.00005));
  const toPaths = (bits: Uint8Array): [number, number][][] =>
    traceMask({ w, h, bits } satisfies Mask, { turdSize: turd, tolerance: 0.8 }).paths.map((p) => p.points.map(([x, y]) => [Math.round((x / w) * 10000) / 10, Math.round((y / h) * 10000) / 10] as [number, number]));
  return stats.map((s, si) => {
    const visible = new Uint8Array(w * h), sheet = new Uint8Array(w * h);
    const front = new Set(stats.slice(si).map((x) => x.g));
    let sheetN = 0;
    for (const i of idx) { if (smooth[i] === s.g) visible[i] = 1; if (front.has(smooth[i])) { sheet[i] = 1; sheetN++; } }
    const filled = si === 0 ? fillHoles(sheet, w, h) : sheet;
    const name = titleFor.get(si) ?? rest.shift() ?? `${colourWord(centres[s.g])} layer`;
    return {
      n: si + 1, name, hex: toHex(centres[s.g]),
      visiblePaths: toPaths(visible), sheetPaths: toPaths(filled),
      visiblePct: Math.round((s.n / total) * 1000) / 10,
      hiddenPct: Math.round(((sheetN - s.n) / Math.max(1, sheetN)) * 1000) / 10
    };
  });
}

/** rasterise 0-1000 paths into a w×h mask (even-odd), for SAM outlines arriving as paths */
export function rasterisePaths(paths: [number, number][][], w: number, h: number): Uint8Array {
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ny = ((y + 0.5) / h) * 1000, xs: number[] = [];
    for (const poly of paths) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > ny) !== (yj > ny)) xs.push(xi + ((ny - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil((xs[k] / 1000) * w - 0.5)), x1 = Math.min(w - 1, Math.floor((xs[k + 1] / 1000) * w - 0.5));
      for (let x = x0; x <= x1; x++) bits[y * w + x] = 1;
    }
  }
  return bits;
}
/** trace a mask to 0-1000 paths: `tolerance` simplifies (px), `smooth` rounds the pixel stairs (Chaikin passes) */
export function maskToPaths(bits: Uint8Array, w: number, h: number, opts: { tolerance?: number; smooth?: number } = {}): [number, number][][] {
  const turd = Math.max(3, Math.round(w * h * 0.00005));
  return traceMask({ w, h, bits }, { turdSize: turd, tolerance: opts.tolerance ?? 0.8, smooth: opts.smooth ?? 1 }).paths.map((p) => p.points.map(([x, y]) => [Math.round((x / w) * 10000) / 10, Math.round((y / h) * 10000) / 10] as [number, number]));
}

// ── One layer at a time: corrections the user asks for in the chat ("keep the whiskers", "make it bolder",
// "take the wall out of this layer"). Spark's job (layers.refine) is to turn free text into these ops; the
// keyword reader below covers the common asks so they apply now. Code edits the mask; models never draw it.
/** a shape drawn on the work area, in 0-1000 image coordinates (y scaled to the same 0-1000 range) */
export type DrawnShape = { type: 'circle'; cx: number; cy: number; r: number } | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number };
export type Box = { x1: number; y1: number; x2: number; y2: number };
export type LayerOp =
  | { kind: 'detail' } | { kind: 'bolder' } | { kind: 'thinner' } | { kind: 'smoother' }
  | { kind: 'remove'; backdrop?: boolean; colour?: Lab; word?: string } | { kind: 'add'; colour: Lab; word: string }
  /** the layer's sliders: detail 1 (blocky) … 5 (finest), weight -3 (thinner) … +3 (bolder), from its photo colour */
  | { kind: 'tune'; detail: number; weight: number }
  /** add or cut a drawn circle / line */
  | { kind: 'shape'; shape: DrawnShape; mode: 'add' | 'erase' }
  /** smooth the edges inside a selected area; strength 1 (smooth) … 3 (reduce jitter) */
  | { kind: 'smoothArea'; box: Box; strength: number }
  /** one solid outline: the inner sections filled in ("the base would just be a full outline") */
  | { kind: 'fill' }
  /** complete the hidden edges: an item partly covered by its neighbour in the photo gets its full outline back */
  | { kind: 'complete' };

/** the detail slider's trace settings: finer = less simplification and rounding */
export const traceFor = (detail: number) => ({ tolerance: 0.5 + (5 - detail) * 0.45, smooth: detail >= 4 ? 2 : 3 });

/** a drawn shape as a polygon in 0-1000 coordinates */
export function shapePolygon(shape: DrawnShape): [number, number][] {
  if (shape.type === 'circle') return Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [shape.cx + Math.cos(a) * shape.r, shape.cy + Math.sin(a) * shape.r] as [number, number]; });
  const { x1, y1, x2, y2 } = shape, half = shape.width / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * half, ny = ((x2 - x1) / len) * half, a0 = Math.atan2(y2 - y1, x2 - x1);
  const cap = (cx: number, cy: number, from: number) => Array.from({ length: 9 }, (_, i) => { const a = from + (i / 8) * Math.PI; return [cx + Math.cos(a) * half, cy + Math.sin(a) * half] as [number, number]; });
  return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], ...cap(x2, y2, a0 - Math.PI / 2), [x2 - nx, y2 - ny], [x1 - nx, y1 - ny], ...cap(x1, y1, a0 + Math.PI / 2)];
}
/** is a point inside the paths (even-odd, like the overlays draw them)? 0-1000 coordinates */
export function pointInPaths(paths: [number, number][][], x: number, y: number): boolean {
  let inside = false;
  for (const poly of paths) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** two layers' masks as one (merge): rasterised together and traced again, so overlaps never cancel out */
export function unionPaths(a: [number, number][][], b: [number, number][][], size = 640): [number, number][][] {
  const ra = rasterisePaths(a, size, size), rb = rasterisePaths(b, size, size);
  for (let i = 0; i < ra.length; i++) ra[i] = ra[i] || rb[i] ? 1 : 0;
  return maskToPaths(ra, size, size);
}
/** move paths by (dx, dy) in 0-1000 coordinates (grab and move on the work area) */
export function translatePaths(paths: [number, number][][], dx: number, dy: number): [number, number][][] {
  const r = (n: number) => Math.round(n * 10) / 10;
  return paths.map((p) => p.map(([x, y]) => [r(x + dx), r(y + dy)] as [number, number]));
}

export function parseLayerOp(text: string): LayerOp | null {
  const t = text.toLowerCase();
  const colourWord = Object.keys(NAMED).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const removing = /\b(remove|drop|delete|erase|exclude|without|get rid of|no)\b|\btake\b.*\bout\b/.test(t);
  if (removing && /\b(background|backdrop|wall|shadows?|texture)\b/.test(t)) return { kind: 'remove', backdrop: true };
  if (colourWord && (removing || /\bnot\b/.test(t))) return { kind: 'remove', colour: hexToLab(NAMED[colourWord])!, word: colourWord };
  if (colourWord && /\b(add|include|keep|with|also|merge|missing)\b/.test(t)) return { kind: 'add', colour: hexToLab(NAMED[colourWord])!, word: colourWord };
  if (/\b(complete|restore|recover|rebuild)\b.*\b(hidden|edges?|corners?|outline|shape|parts?)\b|\b(hidden|covered|overlapp(ed|ing)|cut off|chopped)\b.*\b(edges?|corners?|parts?|bits?)\b|\bstraight(en)? (the )?edges\b/.test(t)) return { kind: 'complete' };
  if (/\b(full|solid|whole|filled|enclosing|outer) (outline|silhouette|shape|piece|backing)\b|\b(completely |fully )?filled\b|\bfill(ed)? (it|in|up|out)?\s*(the )?(holes|gaps|inner|inside|middle|shape|outline|whole)?\b|\binner (sections?|parts?|holes?)\b|\bno (holes|gaps)\b|\bone (solid )?piece\b/.test(t)) return { kind: 'fill' };
  if (/\b(whiskers?|hairs?|fur|fine|details?|thin lines|strokes|lost|missing|sharper|crisper)\b/.test(t)) return { kind: 'detail' };
  if (/\b(bolder|thicker|wider|fatter|heavier|grow)\b/.test(t)) return { kind: 'bolder' };
  if (/\b(thinner|slimmer|lighter|shrink)\b/.test(t)) return { kind: 'thinner' };
  if (/\b(smooth|smoothen|smoother|clean ?up|specks?|noise|noisy|jagged|rough|jitter|jittery|wobbly)\b/.test(t)) return { kind: 'smoother' };
  return null;
}

/**
 * Apply one op to one layer. `layers` are all layer colours back → front (hex) and the index of the one being
 * corrected; `current` its visible paths. Returns the layer's new visible paths and sheet paths.
 */
export function refineLayer(img: PixelImage, subject: Uint8Array, opts: { colours: string[]; index: number; current: [number, number][][]; front: [number, number][][]; op: LayerOp }): { visiblePaths: [number, number][][]; sheetPaths: [number, number][][]; visiblePct: number; hiddenPct: number; describe: string } {
  const { w, h } = img, labs = labsOf(img);
  const centres = opts.colours.map((c) => hexToLab(c) ?? [50, 0, 0] as Lab);
  const mine = centres[opts.index];
  let bits: Uint8Array = rasterisePaths(opts.current, w, h);
  const nearest = (i: number) => { const p = labAt(labs, i); let bi = 0, bd = Infinity; centres.forEach((c, ci) => { const d = dist(p, c); if (d < bd) { bd = d; bi = ci; } }); return bi; };
  let describe = '';
  const op = opts.op;
  let trace: { tolerance?: number; smooth?: number } = {};
  const open = (b: Uint8Array, n: number) => { let x = b; for (let i = 0; i < n; i++) x = erode(x, w, h); for (let i = 0; i < n; i++) x = dilate(x, w, h); return x; };
  const close = (b: Uint8Array, n: number) => { let x = b; for (let i = 0; i < n; i++) x = dilate(x, w, h); for (let i = 0; i < n; i++) x = erode(x, w, h); return x; };
  if (op.kind === 'detail') {
    // every subject pixel whose colour is this layer's, unsmoothed: one-pixel strokes come back
    const out = new Uint8Array(w * h); let added = 0;
    for (let i = 0; i < w * h; i++) if (subject[i] && (nearest(i) === opts.index || dist(labAt(labs, i), mine) < 14)) { out[i] = 1; if (!bits[i]) added++; }
    bits = out; describe = `kept the fine detail (${Math.round((added / Math.max(1, w * h)) * 10000) / 100}% of the photo added back)`;
  } else if (op.kind === 'bolder') { bits = dilate(bits, w, h); describe = 'made it bolder by one stroke width'; }
  else if (op.kind === 'thinner') { bits = erode(bits, w, h); describe = 'made it thinner by one stroke width'; }
  else if (op.kind === 'smoother') { bits = erode(dilate(dilate(erode(bits, w, h), w, h), w, h), w, h); describe = 'smoothed the edges and dropped the specks'; }
  else if (op.kind === 'remove') {
    if (op.backdrop) { const strict = subjectMask(img, { strict: true }).bits; let n = 0; for (let i = 0; i < w * h; i++) if (bits[i] && !strict[i]) { bits[i] = 0; n++; } describe = `took the wall and its shadows out of this layer (${Math.round((n / (w * h)) * 1000) / 10}% of the photo)`; }
    else if (op.colour) { let n = 0; for (let i = 0; i < w * h; i++) if (bits[i] && dist(labAt(labs, i), op.colour) < 30) { bits[i] = 0; n++; } describe = `took the ${op.word} out of this layer (${Math.round((n / (w * h)) * 1000) / 10}% of the photo)`; }
  } else if (op.kind === 'tune') {
    const detail = Math.max(1, Math.min(5, Math.round(op.detail))), weight = Math.max(-3, Math.min(3, Math.round(op.weight)));
    // from the photo again: this colour's pixels inside the subject, cleaned less the finer the detail
    let b: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (subject[i] && (nearest(i) === opts.index || (detail >= 4 && dist(labAt(labs, i), mine) < 14))) b[i] = 1;
    const r = 5 - detail;
    if (r > 0) b = close(open(b, Math.ceil(r / 2)), r);
    for (let i = 0; i < Math.abs(weight); i++) b = weight > 0 ? dilate(b, w, h) : erode(b, w, h);
    bits = b; trace = traceFor(detail);
    describe = `detail ${detail} of 5 (${detail <= 2 ? 'blocky' : detail >= 4 ? 'fine' : 'balanced'}), weight ${weight > 0 ? `+${weight}` : weight}`;
  } else if (op.kind === 'shape') {
    const shape = rasterisePaths([shapePolygon(op.shape)], w, h); let n = 0;
    for (let i = 0; i < w * h; i++) if (shape[i]) { if (op.mode === 'add' && !bits[i]) { bits[i] = 1; n++; } else if (op.mode === 'erase' && bits[i]) { bits[i] = 0; n++; } }
    describe = `${op.mode === 'add' ? 'added' : 'cut'} a ${op.shape.type}${op.mode === 'add' ? '' : ' out'} (${Math.round((n / (w * h)) * 1000) / 10}% of the photo)`;
  } else if (op.kind === 'smoothArea') {
    const s = Math.max(1, Math.min(3, Math.round(op.strength)));
    const x1 = Math.max(0, Math.floor((Math.min(op.box.x1, op.box.x2) / 1000) * w)), x2 = Math.min(w - 1, Math.ceil((Math.max(op.box.x1, op.box.x2) / 1000) * w));
    const y1 = Math.max(0, Math.floor((Math.min(op.box.y1, op.box.y2) / 1000) * h)), y2 = Math.min(h - 1, Math.ceil((Math.max(op.box.y1, op.box.y2) / 1000) * h));
    const smooth = close(open(bits, s), s);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) bits[y * w + x] = smooth[y * w + x];
    trace = s >= 3 ? { tolerance: 1.6, smooth: 3 } : {};
    describe = s >= 3 ? 'reduced the jitter in the selected area' : 'smoothed the curves in the selected area';
  } else if (op.kind === 'complete') {
    // the outline's convex hull: what a neighbour lying over it hid comes back as straight edges
    const pts: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (bits[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !bits[i - 1] || !bits[i + 1] || !bits[i - w] || !bits[i + w])) pts.push([((x + 0.5) / w) * 1000, ((y + 0.5) / h) * 1000]); }
    const before = bits.reduce((a, v) => a + v, 0);
    // only the bitten-off part is filled (solid); the piece's own holes and cut-outs stay as they are
    if (pts.length > 2) { const hull = rasterisePaths([hullOf(pts)], w, h), whole = fillHoles(bits, w, h); for (let i = 0; i < w * h; i++) if (hull[i] && !whole[i]) bits[i] = 1; }
    describe = `completed the hidden edges (${Math.round(((bits.reduce((a, v) => a + v, 0) - before) / (w * h)) * 1000) / 10}% of the photo added back)`;
  } else if (op.kind === 'fill') {
    const before = bits.reduce((a, v) => a + v, 0);
    // the enclosing shape: close the small gaps along the edge, then fill everything inside it
    bits = fillHoles(erode(dilate(dilate(bits, w, h), w, h), w, h), w, h);
    describe = `filled the inner sections: one solid outline (${Math.round(((bits.reduce((a, v) => a + v, 0) - before) / (w * h)) * 1000) / 10}% of the photo added)`;
  } else if (op.kind === 'add') {
    let n = 0; for (let i = 0; i < w * h; i++) if (subject[i] && !bits[i] && dist(labAt(labs, i), op.colour) < 30) { bits[i] = 1; n++; }
    describe = `added the ${op.word} parts to this layer (${Math.round((n / (w * h)) * 1000) / 10}% of the photo)`;
  }
  let vis = 0, total = 0; for (let i = 0; i < w * h; i++) { if (bits[i]) vis++; if (subject[i]) total++; }
  const front = rasterisePaths(opts.front, w, h);
  const sheet = new Uint8Array(w * h); let sheetN = 0;
  for (let i = 0; i < w * h; i++) if (bits[i] || (front[i] && subject[i])) { sheet[i] = 1; sheetN++; }
  if (op.kind === 'fill') { const filled = fillHoles(sheet, w, h); sheetN = 0; for (let i = 0; i < w * h; i++) { sheet[i] = filled[i]; sheetN += filled[i]; } }
  return { visiblePaths: maskToPaths(bits, w, h, trace), sheetPaths: maskToPaths(opts.index === 0 ? fillHoles(sheet, w, h) : sheet, w, h, trace), visiblePct: Math.round((vis / Math.max(1, total)) * 1000) / 10, hiddenPct: Math.round(((sheetN - vis) / Math.max(1, sheetN)) * 1000) / 10, describe };
}

/**
 * One flat item cut from wood or acrylic (a fretwork bookmark): inside its outline, the dark tone is either holes
 * cut right through (blobs: the background shows) or engraving (thin lines burnt into the surface). Returns the piece
 * to cut (the item minus its holes, which become inner cuts) and the engraving, as 0-1000 paths.
 */
type WoodPiece = { cutPaths: [number, number][][]; holePaths: [number, number][][]; engravePaths: [number, number][][]; holesPct: number; engravePct: number };
export function woodPiece(img: PixelImage, item: Uint8Array): WoodPiece {
  // work on the item's own box (plus a margin for its surroundings): a small item in a big photo stays fast
  let x1 = img.w, y1 = img.h, x2 = -1, y2 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (item[y * img.w + x]) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  if (x2 < 0) return { cutPaths: [], holePaths: [], engravePaths: [], holesPct: 0, engravePct: 0 };
  const m = 12; x1 = Math.max(0, x1 - m); y1 = Math.max(0, y1 - m); x2 = Math.min(img.w - 1, x2 + m); y2 = Math.min(img.h - 1, y2 + m);
  const sw = x2 - x1 + 1, sh = y2 - y1 + 1;
  if (sw === img.w && sh === img.h) return woodPieceIn(img, item);
  const data = new Uint8ClampedArray(sw * sh * 4), sub = new Uint8Array(sw * sh);
  const src = img.data;
  for (let y = 0; y < sh; y++) { for (let k = 0; k < sw * 4; k++) data[y * sw * 4 + k] = src[((y + y1) * img.w + x1) * 4 + k]; sub.set(item.subarray((y + y1) * img.w + x1, (y + y1) * img.w + x2 + 1), y * sw); }
  const r = woodPieceIn({ w: sw, h: sh, data }, sub);
  const back = (paths: [number, number][][]) => paths.map((p) => p.map(([x, y]) => [Math.round(((x1 + (x / 1000) * sw) / img.w) * 10000) / 10, Math.round(((y1 + (y / 1000) * sh) / img.h) * 10000) / 10] as [number, number]));
  return { ...r, cutPaths: back(r.cutPaths), holePaths: back(r.holePaths), engravePaths: back(r.engravePaths) };
}
function woodPieceIn(img: PixelImage, item: Uint8Array): WoodPiece {
  const { w, h } = img, labs = labsOf(img);
  const idx: number[] = []; for (let i = 0; i < w * h; i++) if (item[i]) idx.push(i);
  if (idx.length < 20) return { cutPaths: [], holePaths: [], engravePaths: [], holesPct: 0, engravePct: 0 };
  // what lies around the item (a ring just outside it): a hole shows that, whether it is dark marble or pale cloth
  let near: Uint8Array = item; for (let k = 0; k < 2; k++) near = dilate(near, w, h);
  let far: Uint8Array = near; for (let k = 0; k < 4; k++) far = dilate(far, w, h);
  const ring: number[] = []; for (let i = 0; i < w * h; i++) if (far[i] && !near[i]) ring.push(i);
  const bg: Lab = [0, 0, 0]; for (const i of ring) for (let c = 0; c < 3; c++) bg[c] += labs[i * 3 + c] / Math.max(1, ring.length);
  // the wood: if one of two tones inside the item is the surroundings showing through, the other one; if neither
  // is (no holes), the lighter one — engraving is burnt darker
  const { centres } = kmeans(labs, idx, 2, [], 10);
  const dc = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const [c0, c1] = centres, nearBg = dc(c0, bg) <= dc(c1, bg) ? 0 : 1;
  const wood = ring.length && dc(centres[nearBg], bg) < 25 ? centres[1 - nearBg] : c0[0] >= c1[0] ? c0 : c1;
  // too like the surroundings to tell a hole from the wood: no holes are judged
  const axis = dc(bg, wood) > 15 ? dc(bg, wood) ** 2 : 0;
  // see-through: nearer the surroundings than the wood; engraved: darker than the wood (burnt), not see-through
  const through = new Uint8Array(w * h), dark = new Uint8Array(w * h);
  for (const i of idx) {
    // how far from the wood towards the surroundings (0 wood … 1 surroundings); a hole in shadow sits short of 1
    if (ring.length && axis > 0 && ((labs[i * 3] - wood[0]) * (bg[0] - wood[0]) + (labs[i * 3 + 1] - wood[1]) * (bg[1] - wood[1]) + (labs[i * 3 + 2] - wood[2]) * (bg[2] - wood[2])) / axis > 0.4) through[i] = 1;
    if (labs[i * 3] < wood[0] - 12) dark[i] = 1;
  }
  // holes are blobs (they survive an opening: erode then dilate twice); thin see-through slivers are shading
  // (how hard depends on the item's size in the picture: a small earring's lattice holes are only a few pixels)
  const open = idx.length > 25000 ? 2 : 1;
  // a small hole in shadow looks dark, not like the surroundings: dark blobs are holes too (engraving is thin lines)
  const either = new Uint8Array(w * h); for (const i of idx) if (through[i] || dark[i]) either[i] = 1;
  let blobs: Uint8Array = either; for (let k = 0; k < open; k++) blobs = erode(blobs, w, h); for (let k = 0; k < open; k++) blobs = dilate(blobs, w, h);
  const minHole = Math.max(4, Math.round(idx.length * 0.0008));
  const holes = new Uint8Array(w * h);
  for (const comp of components(blobs, w, h)) if (comp.length >= minHole) for (const i of comp) holes[i] = 1;
  const piece = new Uint8Array(w * h), engr = new Uint8Array(w * h);
  let nh = 0, ne = 0;
  // dark right against a hole or the outer edge is the cut wall's shadow, not engraving
  let wall: Uint8Array = holes; for (let k = 0; k < 2; k++) wall = dilate(wall, w, h);
  let edge: Uint8Array = item; for (let k = 0; k < 2; k++) edge = erode(edge, w, h);
  for (const i of idx) { if (holes[i]) { nh++; continue; } piece[i] = 1; if (dark[i] && !wall[i] && edge[i]) { engr[i] = 1; ne++; } }
  const inHoles = new Uint8Array(w * h); for (const i of idx) if (holes[i]) inHoles[i] = 1;
  return { cutPaths: maskToPaths(piece, w, h), holePaths: maskToPaths(inHoles, w, h), engravePaths: maskToPaths(engr, w, h), holesPct: Math.round((nh / idx.length) * 1000) / 10, engravePct: Math.round((ne / idx.length) * 1000) / 10 };
}

/**
 * Read a cut plan from a picture of it (a parts layout: square sheets with coloured lines on a light page).
 * Each sheet is found as a big framed block; inside it, blue/black lines are cuts and red/green marks are
 * engraving. The pieces are the regions the cut lines close off (the scrap between them is what connects to the
 * sheet's edge). A low-resolution picture gives approximate shapes: good for a preview and a count, not a precise
 * cut file — the original file (SVG/DXF) is what to cut from.
 */
export interface PlanSheet { name: string; box: { x: number; y: number; w: number; h: number }; cut: [number, number][][]; engrave: [number, number][][]; pieces: number; sizeMm: [number, number] }
export function readPlan(img: PixelImage, { sheetMm = 300 }: { sheetMm?: number } = {}): PlanSheet[] {
  const { w, h, data } = img;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  // the page colour: the most common light colour around the border
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let x = 0; x < w; x += 3) for (const y of [0, h - 1]) { const [r, g, b] = px(y * w + x); br += r; bg += g; bb += b; n++; }
  br /= n; bg /= n; bb /= n;
  const ink = new Uint8Array(w * h), red = new Uint8Array(w * h), green = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = px(i);
    if (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 70) continue;
    ink[i] = 1;
    if (r > g + 50 && r > b + 50) red[i] = 1; else if (g > r + 25 && g > b + 10) green[i] = 1;
  }
  // sheets: big blocks of ink (lines merge into one block once thickened)
  let grown: Uint8Array = ink; for (let k = 0; k < 3; k++) grown = dilate(grown, w, h);
  const blocks = components(grown, w, h).map((c) => { let x1 = w, y1 = h, x2 = 0, y2 = 0; for (const i of c) { const x = i % w, y = (i / w) | 0; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; } return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }; })
    .filter((b) => b.w > w * 0.08 && b.h > h * 0.08 && b.w / b.h > 0.5 && b.w / b.h < 2);
  // plans group their sheets (A1–A4 on the left, B1–B7 on the right): a wide empty column splits the groups;
  // within a group, sheets read row by row
  const xs = [...blocks].sort((a, b) => a.x - b.x), groupOf = new Map<(typeof blocks)[number], number>();
  let g = 0; xs.forEach((b, i) => { if (i && b.x - Math.max(...xs.slice(0, i).map((p) => p.x + p.w)) > b.w * 0.35) g++; groupOf.set(b, g); });
  blocks.sort((a, b) => groupOf.get(a)! - groupOf.get(b)! || (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
  const counts: number[] = [];
  const sheets: PlanSheet[] = [];
  for (const blk of blocks) {
    // the sheet's frame: the rows and columns that are mostly ink (its four edges); the label above it is not
    const rowInk = (y: number) => { let c = 0; for (let x = blk.x; x < blk.x + blk.w; x++) c += ink[y * w + x]; return c; };
    const colInk = (x: number) => { let c = 0; for (let y = blk.y; y < blk.y + blk.h; y++) c += ink[y * w + x]; return c; };
    const rows: number[] = [], cols: number[] = [];
    for (let y = blk.y; y < blk.y + blk.h; y++) if (rowInk(y) > blk.w * 0.6) rows.push(y);
    for (let x = blk.x; x < blk.x + blk.w; x++) if (colInk(x) > blk.h * 0.55) cols.push(x);
    const bx = rows.length > 1 && cols.length > 1 ? { x: cols[0], y: rows[0], w: cols[cols.length - 1] - cols[0] + 1, h: rows[rows.length - 1] - rows[0] + 1 } : blk;
    const pad = 3, sw = bx.w - pad * 2, sh = bx.h - pad * 2;
    if (sw < 20 || sh < 20) continue;
    const at = (x: number, y: number) => (bx.y + pad + y) * w + (bx.x + pad + x);
    let line = new Uint8Array(sw * sh); const mark = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = at(x, y); if (red[i] || green[i]) mark[y * sw + x] = 1; else if (ink[i]) line[y * sw + x] = 1; }
    // a low-res picture breaks thin lines: close one-pixel gaps before deciding what is enclosed
    line = dilate(line, sw, sh) as Uint8Array<ArrayBuffer>;
    // every enclosed region (between the lines) gets a label; the regions the sheet's edge reaches are scrap
    const label = new Int32Array(sw * sh).fill(-1); const sizes: number[] = [];
    for (let i0 = 0; i0 < sw * sh; i0++) {
      if (line[i0] || label[i0] >= 0) continue;
      const id = sizes.length, stack = [i0]; let n = 0; label[i0] = id;
      while (stack.length) { const i = stack.pop()!; n++; for (const k of neighbours4(i, sw, sh)) if (!line[k] && label[k] < 0) { label[k] = id; stack.push(k); } }
      sizes.push(n);
    }
    // which regions face each other across a line (looking a few pixels each way)
    const near = new Map<number, Set<number>>(); const R = 3;
    const link = (a: number, b: number) => { if (a === b || a < 0 || b < 0) return; (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b); (near.get(b) ?? near.set(b, new Set()).get(b)!).add(a); };
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      if (!line[y * sw + x]) continue;
      const l = x >= R ? label[y * sw + x - R] : -1, r = x + R < sw ? label[y * sw + x + R] : -1, u = y >= R ? label[(y - R) * sw + x] : -1, d = y + R < sh ? label[(y + R) * sw + x] : -1;
      link(l, r); link(u, d);
    }
    // depth from the scrap: 1 = a piece, 2 = a hole in it, 3 = a piece cut inside that hole, ...
    const depth = new Array(sizes.length).fill(-1), queue: number[] = [];
    const edgeLabels = new Set<number>();
    for (let x = 0; x < sw; x++) { edgeLabels.add(label[x]); edgeLabels.add(label[(sh - 1) * sw + x]); }
    for (let y = 0; y < sh; y++) { edgeLabels.add(label[y * sw]); edgeLabels.add(label[y * sw + sw - 1]); }
    for (const l of edgeLabels) if (l >= 0) { depth[l] = 0; queue.push(l); }
    while (queue.length) { const a = queue.shift()!; for (const b of near.get(a) ?? []) if (depth[b] < 0) { depth[b] = depth[a] + 1; queue.push(b); } }
    const piece = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) { const l = label[i]; if (l >= 0 && depth[l] > 0 && depth[l] % 2 === 1) piece[i] = 1; }
    // pieces take the lines around them back (each line is half piece, half scrap): grow into the line pixels only
    for (let k = 0; k < 2; k++) { const g = dilate(piece, sw, sh); for (let i = 0; i < sw * sh; i++) if (g[i] && line[i]) piece[i] = 1; }
    const keep = new Uint8Array(sw * sh); let pieces = 0;
    for (const c of components(piece, sw, sh)) { if (c.length < sw * sh * 0.0008 || c.length > sw * sh * 0.9) continue; pieces++; for (const i of c) keep[i] = 1; }
    const kx = sheetMm / sw, ky = (sheetMm * (sh / sw)) / sh;
    const toMmPaths = (bits: Uint8Array) => traceMask({ w: sw, h: sh, bits }, { turdSize: 4, tolerance: 0.7, smooth: 1 }).paths.map((p) => p.points.map(([x, y]) => [Math.round(x * kx * 10) / 10, Math.round(y * ky * 10) / 10] as [number, number]));
    const around = dilate(keep, sw, sh), marks = new Uint8Array(sw * sh); for (let i = 0; i < sw * sh; i++) if (mark[i] && around[i]) marks[i] = 1;
    const gi = groupOf.get(blk)!; counts[gi] = (counts[gi] ?? 0) + 1;
    sheets.push({ name: `${String.fromCharCode(65 + gi)}${counts[gi]}`, box: bx, cut: toMmPaths(keep), engrave: toMmPaths(marks), pieces, sizeMm: [sheetMm, Math.round(sheetMm * (sh / sw))] });
  }
  return sheets;
}
