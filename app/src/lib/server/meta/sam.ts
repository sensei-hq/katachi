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
export async function segmentRegions(env: Record<string, string | undefined>, imageDataUrl: string, regions: SamRegionInput[], client?: MetaClient, opts: { multiple?: boolean; subjectPrompt?: string; items?: SamItemInput[] } = {}): Promise<{ regions: SamRegion[]; source: 'live' | 'fixture'; costUsd: number }> {
  if (env.META_API_KEY && imageDataUrl && (regions.length || opts.items?.length)) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      // Multiple separate items: one generic SAM call returns every instance mask at once.
      // Spark lists items left→right, so match instances sorted by box x to items in order.
      if (opts.items?.length && opts.subjectPrompt) {
        const text = await c.samText(imageDataUrl, opts.subjectPrompt);
        const instances = decodeSamText(text).sort((a, b) => a.box.x1 - b.box.x1);
        const centreIn = (d: DecodedSamMask, box: SamBox | null) => { if (!box) return true; const cx = (d.box.x1 + d.box.x2) / 2, cy = (d.box.y1 + d.box.y2) / 2; return cx >= box.x1 - 20 && cx <= box.x2 + 20 && cy >= box.y1 - 20 && cy <= box.y2 + 20; };
        const found: SamRegion[] = [];
        for (const [i, item] of opts.items.entries()) {
          let inst = instances[i];
          if (!inst) {
            // Generic call came back short: a per-item phrase returns the same instance set, so take this item's ordinal mask.
            const perItem = decodeSamText(await c.samText(imageDataUrl, item.samPrompt)).sort((a, b) => a.box.x1 - b.box.x1);
            inst = perItem[i] ?? perItem.find((d) => !instances.some((g) => g.box.x1 === d.box.x1));
          }
          const base = { itemId: item.id, itemName: item.label };
          if (item.arrangement === 'single-item' || !item.regions.length) {
            found.push({ id: item.id, label: item.label, samPrompt: item.samPrompt, ...base, box: inst?.box ?? null, mask: inst ? { h: inst.maskH, w: inst.maskW } : null, areaPct: inst?.areaPct ?? 0, ones: inst?.ones, paths: inst?.paths, keep: true });
            continue;
          }
          for (const r of item.regions) {
            const rtext = await c.samText(imageDataUrl, r.samPrompt);
            const scoped = decodeSamText(rtext).find((d) => centreIn(d, inst?.box ?? null)) ?? decodeSamText(rtext)[0];
            const d = scoped ?? inst;
            found.push({ ...r, ...base, box: d?.box ?? null, mask: d ? { h: d.maskH, w: d.maskW } : null, areaPct: d?.areaPct ?? 0, ones: d?.ones, paths: d?.paths ?? inst?.paths, keep: !r.likelyBought });
          }
        }
        if (instances.length >= 2 || found.some((r) => r.box)) return { regions: found, source: 'live', costUsd: 0.0025 * (1 + found.length) };
      }
      if (opts.multiple && opts.subjectPrompt) {
        const text = await c.samText(imageDataUrl, opts.subjectPrompt);
        const instances = decodeSamText(text).sort((a, b) => a.box.x1 - b.box.x1);
        if (instances.length >= 2) {
          const found = regions.map((r, i) => {
            const d = instances[i];
            if (d) return { ...r, box: d.box, mask: { h: d.maskH, w: d.maskW }, areaPct: d.areaPct, ones: d.ones, paths: d.paths, keep: !r.likelyBought } satisfies SamRegion;
            return { ...r, box: null, mask: null, areaPct: 0, keep: !r.likelyBought } satisfies SamRegion;
          });
          return { regions: found, source: 'live', costUsd: 0.0025 * (1 + regions.filter((r, i) => !instances[i]).length) };
        }
      }
      const found = await Promise.all(regions.map(async (r) => {
        // SAM sometimes returns nothing for a long noun phrase: retry with the label, then its head words.
        const words = r.label.split(/\s+/).filter(Boolean);
        const phrases = [...new Set([r.samPrompt, r.label, `the ${r.label}`, words.slice(0, 3).join(' '), words.slice(-2).join(' ')].filter(Boolean))].slice(0, 4);
        let text = '';
        for (const phrase of phrases) {
          text = await c.samText(imageDataUrl, phrase);
          if (decodeSamText(text).length || parseSamBoxes(text).length) break;
        }
        if (!decodeSamText(text).length && !parseSamBoxes(text).length) text = await c.samText(imageDataUrl, r.samPrompt);
        const decoded = decodeSamText(text)[0];
        if (decoded) return { ...r, box: decoded.box, mask: { h: decoded.maskH, w: decoded.maskW }, areaPct: decoded.areaPct, ones: decoded.ones, paths: decoded.paths, keep: !r.likelyBought } satisfies SamRegion;
        const box = parseSamBoxes(text)[0] ?? null;
        const header = parseSamMasks(text)[0]?.mask;
        const areaPct = box ? Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10 : 0;
        return { ...r, box, mask: header ? { h: header.h, w: header.w } : null, areaPct, keep: !r.likelyBought } satisfies SamRegion;
      }));
      if (found.some((r) => r.box)) return { regions: found, source: 'live', costUsd: found.length * 0.0025 };
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
