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
import { MetaClient } from './client';
export interface SamRegionInput { id: string; label: string; samPrompt: string; likelyBought?: boolean; note?: string }
export interface SamRegion extends SamRegionInput { box: SamBox | null; mask: { h: number; w: number } | null; areaPct: number; keep: boolean }
/** One SAM call per region phrase, in parallel (design/01 S4). Missing masks keep the region with a box estimate. */
export async function segmentRegions(env: Record<string, string | undefined>, imageDataUrl: string, regions: SamRegionInput[], client?: MetaClient): Promise<{ regions: SamRegion[]; source: 'live' | 'fixture'; costUsd: number }> {
  if (env.META_API_KEY && imageDataUrl && regions.length) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const found = await Promise.all(regions.map(async (r) => {
        const text = await c.samText(imageDataUrl, r.samPrompt);
        const mask = parseSamMasks(text)[0];
        const box = mask?.box ?? parseSamBoxes(text)[0] ?? null;
        const areaPct = mask?.areaPct ?? (box ? Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10 : 0);
        return { ...r, box, mask: mask ? { h: mask.mask.h, w: mask.mask.w } : null, areaPct, keep: !r.likelyBought } satisfies SamRegion;
      }));
      if (found.some((r) => r.box)) return { regions: found, source: 'live', costUsd: found.length * 0.0025 };
    } catch (e) { console.error('segment regions live failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { regions: regions.map((r, i) => ({ ...r, box: { x1: 100 + i * 40, y1: 100, x2: 600, y2: 700 }, mask: null, areaPct: Math.max(2, 30 - i * 5), keep: !r.likelyBought })), source: 'fixture', costUsd: 0 };
}
export async function segmentPiece(env: Record<string, string | undefined>, imageDataUrl: string, prompt: string, client?: MetaClient): Promise<{ boxes: SamBox[]; source: 'live' | 'fixture' }> {
  if (env.META_API_KEY && imageDataUrl) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const text = await c.samText(imageDataUrl, prompt);
      const boxes = parseSamBoxes(text);
      if (boxes.length) return { boxes, source: 'live' };
    } catch (e) { console.error('segment live failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { boxes: [{ x1: 300, y1: 200, x2: 700, y2: 800 }], source: 'fixture' };
}
