// Six-view stitcher (docs/design/08-B): SAM silhouettes -> one ObjectSpec -> flat panels + join table.
// Code measures and builds geometry; the model only labels faces and spots symmetry candidates.
import type { Joinery, ViewId } from '../content/layers';

export interface ViewSilhouette { view: ViewId; box: { x1: number; y1: number; x2: number; y2: number }; areaPct: number }
export interface Panel { name: string; view: ViewId; wMm: number; hMm: number; qty: number }
export interface Join { a: string; b: string; edge: string; angleDeg: number; kind: Joinery }
export interface ObjectSpec { wMm: number; dMm: number; hMm: number; thicknessMm: number; panels: Panel[]; joins: Join[]; warnings: string[]; symmetry: string[] }

const ratio = (s: ViewSilhouette | undefined) => (s ? { w: Math.max(1, s.box.x2 - s.box.x1), h: Math.max(1, s.box.y2 - s.box.y1) } : null);
const round = (n: number) => Math.round(n);

/** Reconstruct W×D×H from the faces that were photographed, guess the rest, and derive panels + joins. */
export function stitchViews(views: ViewSilhouette[], opts: { sizeMm: number; thicknessMm: number; joinery: Joinery }): ObjectSpec {
  const by = (v: ViewId) => views.find((x) => x.view === v);
  const warnings: string[] = [], symmetry: string[] = [];
  const front = ratio(by('front')) ?? ratio(by('back'));
  const side = ratio(by('right')) ?? ratio(by('left'));
  const top = ratio(by('top')) ?? ratio(by('base'));
  if (!by('front') && !by('back')) warnings.push('Front and Back missing — width and height are guessed from the side views.');
  if (!by('left')) warnings.push('Left view missing — guessed from the Right view.');
  if (!by('right')) warnings.push('Right view missing — guessed from the Left view.');
  if (!by('top') && !by('base')) warnings.push('Top and Base missing — depth is guessed from the side views.');
  // Ratios relative to front height (or side height when no front).
  const W = front ? front.w / front.h : 1, D = side ? side.w / side.h : (top ? (top.h / top.w) * W : 0.6), H = 1;
  if (top && front) {
    const impliedD = (top.h / top.w) * W;
    if (side && Math.abs(impliedD - D) / Math.max(D, 0.01) > 0.35) warnings.push('Top view disagrees with the side views on depth — the side views win.');
  }
  // Deterministic height check on normalised boxes: front and side silhouettes should share height share.
  const f = by('front'), s = by('right') ?? by('left');
  if (f && s) {
    const fh = (f.box.y2 - f.box.y1) / 1000, sh = (s.box.y2 - s.box.y1) / 1000;
    if (Math.abs(fh - sh) / Math.max(fh, sh) > 0.15) warnings.push('Front and side heights disagree by more than 15% — keeping the front height.');
  }
  const scale = opts.sizeMm / Math.max(W, D, H);
  const wMm = round(W * scale), dMm = round(D * scale), hMm = round(H * scale), t = opts.thicknessMm;
  const pair = (a: ViewId, b: ViewId, label: string) => {
    const ra = ratio(by(a)), rb = ratio(by(b));
    if (ra && rb && Math.abs(ra.w / ra.h - rb.w / rb.h) / Math.max(ra.w / ra.h, rb.w / rb.h) < 0.1) symmetry.push(label);
  };
  pair('left', 'right', 'Left ≈ Right'); pair('front', 'back', 'Front ≈ Back'); pair('top', 'base', 'Top ≈ Base');
  const panels: Panel[] = [
    { name: 'Front', view: 'front', wMm, hMm, qty: 1 },
    { name: 'Back', view: 'back', wMm, hMm, qty: 1 },
    { name: 'Left', view: 'left', wMm: Math.max(1, dMm - 2 * t), hMm, qty: 1 },
    { name: 'Right', view: 'right', wMm: Math.max(1, dMm - 2 * t), hMm, qty: 1 },
    { name: 'Top', view: 'top', wMm, hMm: Math.max(1, dMm - 2 * t), qty: 1 },
    { name: 'Base', view: 'base', wMm, hMm: Math.max(1, dMm - 2 * t), qty: 1 }
  ];
  // Left/Right panels: width is the depth (less thickness), height is H — normalise fields explicitly.
  for (const p of panels) {
    if (p.name === 'Left' || p.name === 'Right') { p.wMm = Math.max(1, dMm - 2 * t); p.hMm = hMm; }
    if (p.name === 'Top' || p.name === 'Base') { p.wMm = wMm; p.hMm = Math.max(1, dMm - 2 * t); }
  }
  const J = (a: string, b: string, edge: string): Join => ({ a, b, edge, angleDeg: 90, kind: opts.joinery });
  const joins: Join[] = [
    J('Base', 'Front', 'front edge'), J('Base', 'Back', 'back edge'), J('Base', 'Left', 'left edge'), J('Base', 'Right', 'right edge'),
    J('Top', 'Front', 'front edge'), J('Top', 'Back', 'back edge'), J('Top', 'Left', 'left edge'), J('Top', 'Right', 'right edge'),
    J('Front', 'Left', 'left corner'), J('Front', 'Right', 'right corner'), J('Back', 'Left', 'left corner'), J('Back', 'Right', 'right corner')
  ];
  return { wMm, dMm, hMm, thicknessMm: t, panels, joins, warnings, symmetry };
}
