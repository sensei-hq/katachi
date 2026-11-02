// Runs the photo measurements off the main thread so the page stays responsive while a layer is measured.
import { colourLayers, maskToPaths, rasterisePaths, refineLayer, stackLayers, subjectMask, type LayerOp, type StackPlan } from './layering';
import type { PixelImage } from './colour';

type Req =
  | { id: number; kind: 'subject'; img: PixelImage; strict?: boolean; hintPaths?: [number, number][][] }
  | { id: number; kind: 'layers'; img: PixelImage; subjectPaths: [number, number][][]; k: number; titles: string[]; plan?: StackPlan | null }
  | { id: number; kind: 'refine'; img: PixelImage; subjectPaths: [number, number][][]; colours: string[]; index: number; current: [number, number][][]; front: [number, number][][]; op: LayerOp };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  try {
    if (r.kind === 'subject') {
      const hint = r.hintPaths?.length ? rasterisePaths(r.hintPaths, r.img.w, r.img.h) : null;
      const m = subjectMask(r.img, { strict: r.strict, hint });
      (self as unknown as Worker).postMessage({ id: r.id, ok: true, value: { areaPct: m.areaPct, paths: maskToPaths(m.bits, r.img.w, r.img.h) } });
    } else if (r.kind === 'layers') {
      (self as unknown as Worker).postMessage({ id: r.id, ok: true, value: r.plan ? stackLayers(r.img, rasterisePaths(r.subjectPaths, r.img.w, r.img.h), r.plan) : colourLayers(r.img, rasterisePaths(r.subjectPaths, r.img.w, r.img.h), { k: r.k, titles: r.titles }) });
    } else {
      (self as unknown as Worker).postMessage({ id: r.id, ok: true, value: refineLayer(r.img, rasterisePaths(r.subjectPaths, r.img.w, r.img.h), r) });
    }
  } catch (err) { (self as unknown as Worker).postMessage({ id: r.id, ok: false, error: String(err) }); }
};
