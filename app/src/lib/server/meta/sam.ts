// SAM 3.1 via Responses returns text like: <|box;x1=..;y1=..;x2=..;y2=..;w=1024;h=1024|><|mask;...|>
export interface SamBox { x1: number; y1: number; x2: number; y2: number }
export function parseSamBoxes(text: string): SamBox[] {
  const boxes: SamBox[] = [];
  for (const m of text.matchAll(/<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g)) {
    const [, x1, y1, x2, y2, w, h] = m.map(Number) as unknown as number[];
    boxes.push({ x1: (x1 / w) * 1000, y1: (y1 / h) * 1000, x2: (x2 / w) * 1000, y2: (y2 / h) * 1000 });
  }
  return boxes;
}
export interface SamMask { box: SamBox; mask: { h: number; w: number; dataLen: number }; areaPct: number }
/** SAM box+mask pairs with boxes and raw text but no bit decode: pick by box, decode only the taken one. */
export function matchSamPairs(text: string): { box: SamBox; areaPct: number; raw: string }[] {
  const out: { box: SamBox; areaPct: number; raw: string }[] = [];
  const re = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|><\|mask;x=\d+;y=\d+;data=(\d+),(\d+),([^|]*)\|>/g;
  for (const m of text.matchAll(re)) {
    const [, x1, y1, x2, y2, w, h] = m as unknown as [string, ...string[]];
    const box: SamBox = { x1: Math.round((Number(x1) / Number(w)) * 1000), y1: Math.round((Number(y1) / Number(h)) * 1000), x2: Math.round((Number(x2) / Number(w)) * 1000), y2: Math.round((Number(y2) / Number(h)) * 1000) };
    out.push({ box, areaPct: Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10, raw: m[0] });
  }
  return out;
}
/** SAM masks follow their box: <|mask;x=0;y=0;data=<h>,<w>,<encoded bits>|>. The header is the crop size. */
export function parseSamMasks(text: string): SamMask[] {
  const out: SamMask[] = [];
  const re = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|><\|mask;x=\d+;y=\d+;data=(\d+),(\d+),([^|]*)\|>/g;
  for (const m of text.matchAll(re)) {
    const [, x1, y1, x2, y2, w, h, mh, mw, data] = m as unknown as [string, ...string[]];
    const box: SamBox = { x1: Math.round((Number(x1) / Number(w)) * 1000), y1: Math.round((Number(y1) / Number(h)) * 1000), x2: Math.round((Number(x2) / Number(w)) * 1000), y2: Math.round((Number(y2) / Number(h)) * 1000) };
    const areaPct = Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10;
    out.push({ box, mask: { h: Number(mh), w: Number(mw), dataLen: (data ?? '').length }, areaPct });
  }
  return out;
}
import { decodeMaskToRaster } from '@meta-sam/parser';
import { traceMask } from '../../domain/vector';
import { MetaClient } from './client';
export interface DecodedSamMask { box: SamBox; maskW: number; maskH: number; imgW: number; imgH: number; raster: Uint8Array; ones: number; areaPct: number; paths: [number, number][][] }
/** Full bit decode of every mask in a SAM text response (official @meta-sam/parser arithmetic codec).
 * Paths are traced from the raster (domain/vector) and returned in 0-1000 image coordinates. */
export function decodeSamText(text: string): DecodedSamMask[] {
  const out: DecodedSamMask[] = [];
  const re = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|><\|mask;x=\d+;y=\d+;data=(\d+),(\d+),([^|]*)\|>/g;
  for (const m of text.matchAll(re)) {
    const [, bx1, by1, bx2, by2, iw, ih, mh, mw, payload] = m as unknown as [string, ...string[]];
    const maskW = Number(mw), maskH = Number(mh), imgW = Number(iw), imgH = Number(ih);
    try {
      const raster = decodeMaskToRaster({ encoding: 'one_bit', width: maskW, height: maskH, payload } as never);
      let ones = 0; for (const v of raster) ones += v;
      const traced = traceMask({ w: maskW, h: maskH, bits: raster }, { turdSize: Math.max(4, maskW * maskH * 0.0002), tolerance: 1.5 });
      const sx = (Number(bx2) - Number(bx1)) / maskW, sy = (Number(by2) - Number(by1)) / maskH;
      const paths = traced.paths.map((tp) => tp.points.map(([x, y]) => [Math.round(((Number(bx1) + x * sx) / imgW) * 10000) / 10, Math.round(((Number(by1) + y * sy) / imgH) * 10000) / 10] as [number, number]));
      const box: SamBox = { x1: Math.round((Number(bx1) / imgW) * 1000), y1: Math.round((Number(by1) / imgH) * 1000), x2: Math.round((Number(bx2) / imgW) * 1000), y2: Math.round((Number(by2) / imgH) * 1000) };
      out.push({ box, maskW, maskH, imgW, imgH, raster, ones, areaPct: Math.round((ones / (imgW * imgH)) * 1000) / 10, paths });
    } catch (e) { console.error('SAM mask decode failed:', e instanceof Error ? e.message : String(e)); }
  }
  return out;
}
export interface SamRegionInput { id: string; label: string; samPrompt: string; likelyBought?: boolean; note?: string }
export interface SamRegion extends SamRegionInput { box: SamBox | null; mask: { h: number; w: number } | null; areaPct: number; keep: boolean; ones?: number; paths?: [number, number][][]; itemId?: string; itemName?: string }
export interface SamItemInput { id: string; label: string; samPrompt: string; arrangement: 'stacked' | 'single-item'; regions: SamRegionInput[] }
/** One SAM call per region phrase, in parallel (design/01 S4). Missing masks keep the region with a box estimate. */
/** SAM calls one segment request may make (the Worker's subrequest limit is 50 on the free plan) */
export const SAM_BUDGET = 40;
/** map with at most `n` at a time, results in order */
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (next < xs.length) { const i = next++; out[i] = await f(xs[i]); } }));
  return out;
}
/** masks in reading order — rows top to bottom, each left to right — the order Spark lists items in. Sorting by x
 *  alone matched the first column's earrings (row 1 and row 4) to the first pair's two names. A mask joins a row
 *  when its centre is within half a typical mask height of the row's centre; one row (fanned bookmarks) stays left
 *  to right. */
export function readingOrder<T extends { box: SamBox }>(ms: T[]): T[] {
  if (ms.length < 2) return [...ms];
  const cy = (d: T) => (d.box.y1 + d.box.y2) / 2, hs = ms.map((d) => d.box.y2 - d.box.y1).sort((a, b) => a - b), half = hs[Math.floor(hs.length / 2)] / 2;
  const rows: T[][] = [];
  for (const d of [...ms].sort((a, b) => cy(a) - cy(b))) {
    const row = rows.at(-1), mid = row ? row.reduce((a, x) => a + cy(x), 0) / row.length : 0;
    if (row && Math.abs(cy(d) - mid) <= half) row.push(d); else rows.push([d]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.box.x1 - b.box.x1));
}
export async function segmentRegions(env: Record<string, string | undefined>, imageDataUrl: string, regions: SamRegionInput[], client?: MetaClient, opts: { multiple?: boolean; subjectPrompt?: string; items?: SamItemInput[] } = {}): Promise<{ regions: SamRegion[]; source: 'live' | 'fixture'; costUsd: number }> {
  if (env.META_API_KEY && imageDataUrl && (regions.length || opts.items?.length)) {
    try {
      const meta = client ?? new MetaClient(env.META_API_KEY);
      // A budget for one request: a photo Spark reads as many items (28 earrings) must not fan out into hundreds of
      // calls (the Worker's subrequest limit ends the whole request, and nothing comes back). One failed call is an
      // empty answer, not the end of the request.
      let calls = 0;
      const c = { samText: async (img: string, phrase: string) => { if (calls >= SAM_BUDGET) return ''; calls++; try { return await meta.samText(img, phrase); } catch (e) { console.error('sam call failed:', e instanceof Error ? e.message : String(e)); return ''; } } };
      const cost = () => Math.round(calls * 0.0025 * 10000) / 10000;
      // Multiple separate items: one generic SAM call returns every instance mask at once.
      // Spark lists items in reading order, so instances are matched to items in reading order too.
      if (opts.items?.length && opts.subjectPrompt) {
        const text = await c.samText(imageDataUrl, opts.subjectPrompt);
        let instances = readingOrder(decodeSamText(text));
        const centreIn = (d: DecodedSamMask, box: SamBox | null) => { if (!box) return true; const cx = (d.box.x1 + d.box.x2) / 2, cy = (d.box.y1 + d.box.y2) / 2; return cx >= box.x1 - 20 && cx <= box.x2 + 20 && cy >= box.y1 - 20 && cy <= box.y2 + 20; };
        const found: SamRegion[] = [];
        const iou = (a: SamBox, b: SamBox) => { const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)), i = w * h; return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i || 1); };
        // A short pool (fewer masks than items): shorter generic phrases often find the missing ones — one more
        // set-sized answer, not one call per item. New masks join the pool; overlaps with it don't.
        if (instances.length < opts.items.length) {
          const core = opts.subjectPrompt.replace(/\s+(on|in|of|with|against|over|under)\s+\S+$/i, '');
          const words = core.replace(/^(a|an|the|some|\d+|two|three|four|five|six|seven|eight|nine|ten|many|several)\s+/i, '').split(/\s+/).filter(Boolean);
          const phrases = [...new Set([words.slice(-2).join(' '), words.at(-1) ?? ''].filter(Boolean))].filter((p) => p !== opts.subjectPrompt);
          for (const phrase of phrases) {
            if (instances.length >= opts.items.length) break;
            const more = readingOrder(decodeSamText(await c.samText(imageDataUrl, phrase)));
            for (const d of more) if (!instances.some((e) => iou(e.box, d.box) > 0.5)) instances.push(d);
          }
          instances = readingOrder(instances);
        }
        // Items that touch or overlap (fanned bookmarks) come back from the generic phrase as fewer masks than items,
        // some covering several items at once. Then each item is asked for by its own phrase, and a mask is only
        // taken if it is one item's size (not several merged) and not already another item's.
        const short = instances.length < opts.items.length;
        // One item's size: the pool's average share when the pool covers most of the photo (a short pool
        // then holds masks over several items); the pool's median mask otherwise (stragglers are item-sized —
        // the average share of a near-empty pool would call every mask merged).
        const boxArea = (b: SamBox) => ((b.x2 - b.x1) * (b.y2 - b.y1)) / 10000;
        const poolBox = instances.map((d) => boxArea(d.box)).sort((a, b) => a - b);
        const poolCovers = poolBox.reduce((a, x) => a + x, 0);
        const poolOnes = instances.map((d) => d.areaPct).sort((a, b) => a - b);
        const one = poolCovers > 50 ? instances.reduce((a, d) => a + d.areaPct, 0) / opts.items.length : (poolOnes[Math.floor(poolOnes.length / 2)] ?? 0);
        const oneBox = poolCovers > 50 ? poolCovers / opts.items.length : (poolBox[Math.floor(poolBox.length / 2)] ?? 0);
        const merged = (d: DecodedSamMask) => short && one > 0 && d.areaPct > 1.8 * one;
        const used: SamBox[] = [];
        const free = (d: DecodedSamMask) => !merged(d) && !used.some((b) => iou(b, d.box) > 0.5);
        const freeBox = (d: { box: SamBox; areaPct: number }) => !(short && oneBox > 0 && d.areaPct > 1.8 * oneBox) && !used.some((b) => iou(b, d.box) > 0.5);
        for (const [i, item] of opts.items.entries()) {
          let inst: DecodedSamMask | undefined = short ? undefined : instances[i];
          if (!inst) inst = instances.find(free);
          if (!inst) {
            // the pool is spent: the item asks in its own words. The answer holds the whole set again, so the
            // taken mask is picked by box and bit-decoded alone — decoding every answer in full, 28 times over,
            // is beyond a Worker request's CPU. The call budget still caps how many items may ask.
            const own = readingOrder(matchSamPairs(await c.samText(imageDataUrl, item.samPrompt)));
            const ownOne = own.length >= 2 ? [...own].map((d) => d.areaPct).sort((a, b) => a - b)[Math.floor(own.length / 2)] : 0;
            const fits = (d: { box: SamBox; areaPct: number }) => freeBox(d) && !(ownOne > 0 && d.areaPct > 2.5 * ownOne);
            const pick = (own.length === opts.items.length && fits(own[i]) ? own[i] : undefined) ?? own.find(fits);
            inst = (pick ? decodeSamText(pick.raw)[0] : undefined) ?? instances.find(free);
          }
          if (inst) used.push(inst.box);
          const base = { itemId: item.id, itemName: item.label };
          // the parts SAM must find inside the item: bought findings (a hook, a chain) are not cut, so they need no
          // call; one part left is the item itself. Each extra call decodes every instance on the photo again (28
          // earrings × a hook and a pendant was ~60 full decodes: more CPU than a Worker request is allowed)
          const parts = item.regions.filter((r) => !r.likelyBought);
          if (item.arrangement === 'single-item' || !parts.length || (parts.length === 1 && parts.length < item.regions.length)) {
            found.push({ id: item.id, label: item.label, samPrompt: item.samPrompt, ...base, box: inst?.box ?? null, mask: inst ? { h: inst.maskH, w: inst.maskW } : null, areaPct: inst?.areaPct ?? 0, ones: inst?.ones, paths: inst?.paths, keep: true });
            continue;
          }
          for (const r of parts) {
            const all = decodeSamText(await c.samText(imageDataUrl, r.samPrompt));
            const scoped = all.find((d) => centreIn(d, inst?.box ?? null)) ?? all[0];
            const d = scoped ?? inst;
            found.push({ ...r, ...base, box: d?.box ?? null, mask: d ? { h: d.maskH, w: d.maskW } : null, areaPct: d?.areaPct ?? 0, ones: d?.ones, paths: d?.paths ?? inst?.paths, keep: true });
          }
        }
        if (instances.length >= 2 || found.some((r) => r.box)) return { regions: found, source: 'live', costUsd: cost() };
      }
      if (opts.multiple && opts.subjectPrompt) {
        // the subject phrase, then shorter generic ones ("wooden earrings", "earrings"): the first that finds several
        const words = opts.subjectPrompt.replace(/^(a|an|the|some|\d+|two|three|four|five|six|seven|eight|nine|ten|many|several)\s+/i, '').split(/\s+/).filter(Boolean);
        let instances: DecodedSamMask[] = [];
        for (const phrase of [...new Set([opts.subjectPrompt, words.slice(-2).join(' '), words.at(-1) ?? ''].filter(Boolean))]) {
          instances = readingOrder(decodeSamText(await c.samText(imageDataUrl, phrase)));
          if (instances.length >= 2) break;
        }
        if (instances.length >= 2) {
          const found = regions.map((r, i) => {
            const d = instances[i];
            if (d) return { ...r, box: d.box, mask: { h: d.maskH, w: d.maskW }, areaPct: d.areaPct, ones: d.ones, paths: d.paths, keep: !r.likelyBought } satisfies SamRegion;
            return { ...r, box: null, mask: null, areaPct: 0, keep: !r.likelyBought } satisfies SamRegion;
          });
          return { regions: found, source: 'live', costUsd: cost() };
        }
      }
      const found = await pool(regions, 4, async (r) => {
        // SAM sometimes returns nothing for a long noun phrase: retry with the label, then its head words (fewer
        // retries when there are many regions, so the budget reaches every region)
        const words = r.label.split(/\s+/).filter(Boolean);
        const phrases = [...new Set([r.samPrompt, r.label, `the ${r.label}`, words.slice(0, 3).join(' '), words.slice(-2).join(' ')].filter(Boolean))].slice(0, regions.length > 8 ? 2 : 4);
        let text = '';
        for (const phrase of phrases) {
          text = await c.samText(imageDataUrl, phrase);
          if (decodeSamText(text).length || parseSamBoxes(text).length) break;
        }
        const decoded = decodeSamText(text)[0];
        if (decoded) return { ...r, box: decoded.box, mask: { h: decoded.maskH, w: decoded.maskW }, areaPct: decoded.areaPct, ones: decoded.ones, paths: decoded.paths, keep: !r.likelyBought } satisfies SamRegion;
        const box = parseSamBoxes(text)[0] ?? null;
        const header = parseSamMasks(text)[0]?.mask;
        const areaPct = box ? Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10 : 0;
        return { ...r, box, mask: header ? { h: header.h, w: header.w } : null, areaPct, keep: !r.likelyBought } satisfies SamRegion;
      });
      if (found.some((r) => r.box)) return { regions: found, source: 'live', costUsd: cost() };
    } catch (e) { console.error('segment regions live failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { regions: regions.map((r, i) => ({ ...r, box: { x1: 100 + i * 40, y1: 100, x2: 600, y2: 700 }, mask: null, areaPct: Math.max(2, 30 - i * 5), keep: !r.likelyBought })), source: 'fixture', costUsd: 0 };
}
export async function segmentPiece(env: Record<string, string | undefined>, imageDataUrl: string, prompt: string, client?: MetaClient): Promise<{ boxes: SamBox[]; masks?: { w: number; h: number; ones: number; paths: [number, number][][] }[]; source: 'live' | 'fixture' }> {
  if (env.META_API_KEY && imageDataUrl) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const words = prompt.split(/\s+/).filter(Boolean);
      const phrases = [...new Set([prompt, words.slice(-3).join(' '), words[words.length - 1] ?? '', 'the main subject', 'the object in the center'].filter(Boolean))].slice(0, 4);
      for (const phrase of phrases) {
        const text = await c.samText(imageDataUrl, phrase);
        const decoded = decodeSamText(text);
        if (decoded.length) return { boxes: decoded.map((d) => d.box), masks: decoded.map((d) => ({ w: d.maskW, h: d.maskH, ones: d.ones, paths: d.paths })), source: 'live' };
        const boxes = parseSamBoxes(text);
        if (boxes.length) return { boxes, source: 'live' };
      }
    } catch (e) { console.error('segment live failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { boxes: [{ x1: 300, y1: 200, x2: 700, y2: 800 }], source: 'fixture' };
}
