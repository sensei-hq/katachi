// The code-side photo measurements (domain/layering), run in a Web Worker in the browser so the page never
// freezes, and inline where there is no Worker (unit tests, SSR). Same inputs and results either way.
import type { PixelImage } from '../domain/colour';
import { colourLayers, maskToPaths, rasterisePaths, refineLayer, subjectMask, type ColourLayer, type LayerOp } from '../domain/layering';

let worker: Worker | null = null, seq = 0, broken = false;
const waiting = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
function getWorker(): Worker | null {
  if (worker) return worker;
  if (broken) return null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    worker = new Worker(new URL('../domain/layering.worker.ts', import.meta.url), { type: 'module' });
    // a worker that fails to load must not leave a step waiting forever: fail every pending call, then run inline
    worker.onerror = () => { for (const [, w] of waiting) w.rej(new Error('measure worker failed')); waiting.clear(); worker?.terminate(); worker = null; broken = true; };
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id);
      if (e.data.ok) w.res(e.data.value); else w.rej(new Error(e.data.error));
    };
    return worker;
  } catch { return null; }
}
function call<T>(msg: Record<string, unknown>): Promise<T> | null {
  const w = getWorker(); if (!w) return null;
  const id = ++seq;
  // state arrays arrive as reactive proxies, which cannot cross to a worker: send plain copies (pixels stay typed)
  const plain = Object.fromEntries(Object.entries(msg).map(([k, v]) => [k, k === 'img' ? v : JSON.parse(JSON.stringify(v ?? null))]));
  return new Promise<T>((res, rej) => { waiting.set(id, { res: res as (v: unknown) => void, rej }); try { w.postMessage({ ...plain, id }); } catch (e) { waiting.delete(id); rej(e as Error); } });
}

export async function measureSubject(img: PixelImage, opts: { strict?: boolean; hintPaths?: [number, number][][] }): Promise<{ areaPct: number; paths: [number, number][][] }> {
  const viaWorker = call<{ areaPct: number; paths: [number, number][][] }>({ kind: 'subject', img, ...opts });
  if (viaWorker) { const r = await viaWorker.catch(() => null); if (r) return r; }
  const m = subjectMask(img, { strict: opts.strict, hint: opts.hintPaths?.length ? rasterisePaths(opts.hintPaths, img.w, img.h) : null });
  return { areaPct: m.areaPct, paths: maskToPaths(m.bits, img.w, img.h) };
}
export async function measureLayers(img: PixelImage, subjectPaths: [number, number][][], opts: { k: number; titles: string[] }): Promise<ColourLayer[]> {
  const viaWorker = call<ColourLayer[]>({ kind: 'layers', img, subjectPaths, ...opts });
  if (viaWorker) { const r = await viaWorker.catch(() => null); if (r) return r; }
  return colourLayers(img, rasterisePaths(subjectPaths, img.w, img.h), opts);
}
export async function measureRefine(img: PixelImage, subjectPaths: [number, number][][], opts: { colours: string[]; index: number; current: [number, number][][]; front: [number, number][][]; op: LayerOp }) {
  type R = { visiblePaths: [number, number][][]; sheetPaths: [number, number][][]; visiblePct: number; hiddenPct: number; describe: string };
  const viaWorker = call<R>({ kind: 'refine', img, subjectPaths, ...opts });
  if (viaWorker) { const r = await viaWorker.catch(() => null); if (r) return r; }
  return refineLayer(img, rasterisePaths(subjectPaths, img.w, img.h), opts);
}
