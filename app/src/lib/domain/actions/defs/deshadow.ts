// Shadow layers, folded back into the layer they shade: a colour group that is only a darker shade of its
// neighbour — the same hue and chroma, less light — is usually a shadow the photo's lighting left behind, not a
// layer the maker would cut. Near-identical same-colour layers (a white backer and white petals) are left alone:
// folding one into the other needs a real lightness gap, not just a darker twin.
import * as geo from '../../geo';
import type { Pt } from '../../geo';
import { hexToLab, type Lab } from '../../layering';
import { indexCraft } from '../../craft';
import type { CraftDoc, Id, ItemDoc, PartDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone } from './shared';

export interface DeshadowOpts { minGap: number; maxGap: number; maxHue: number; maxSharePct: number }
export const DESHADOW_DEFAULTS: DeshadowOpts = { minGap: 5, maxGap: 30, maxHue: 12, maxSharePct: 20 };

const loopArea = (l: Pt[]) => Math.abs(l.reduce((a, [x, y], k) => { const [u, v] = l[(k + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2;
interface Box { x1: number; y1: number; x2: number; y2: number }
const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
// same hue, whatever the light: darkening shrinks a and b, so the hue angle (not the ab distance) is what a
// shadow shares with its base. Near-neutrals agree too (their angle is the same noise), so a grey shade on a
// white base folds while grey dirt on a red base does not.
const hueDiff = (a: Lab, b: Lab) => { const d = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1])) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
/** join cut geometries: a true union, or the paths side by side (even-odd) when the union fails */
const join = (gs: geo.Geometry[]): geo.Geometry => { try { return gs.slice(1).reduce((acc, g) => geo.union(acc, g), gs[0]); } catch { return { paths: gs.flatMap((g) => g.paths) }; } };

export interface ShadePair { item: ItemDoc; intoId: Id; shadeId: Id }
/** the shade folds among the targets: a smaller, darker, same-hue part overlapping a larger one of its item.
 *  Pure and cheap (colours and bounding boxes only): the clean-up pass and the suggestions ask this before offering. */
export function shadePairs(doc: CraftDoc, ids: Id[], opts: DeshadowOpts): ShadePair[] {
  const ix = indexCraft(doc);
  const parts = ids.map((id) => ix.get(id)).filter((n): n is Extract<NonNullable<typeof n>, { kind: 'part' }> => n?.kind === 'part');
  // loops once per part (area and box from the same parse): the suggestions ask this on every render
  const info: { node: PartDoc; item: ItemDoc; lab: Lab; area: number; box: Box }[] = [];
  for (const n of parts) {
    const node = n.node as PartDoc, lab = hexToLab(node.colour ?? '');
    const loops = node.ops.filter((o) => o.kind === 'cut').flatMap((o) => geo.toLoops(o.geometry, 0.5));
    const area = loops.reduce((a, l) => a + loopArea(l), 0);
    if (!lab || area <= 0) continue;
    const pts = loops.flat(), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    info.push({ node, item: n.item as ItemDoc, lab, area, box: { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) } });
  }
  const out: (ShadePair & { gap: number; dh: number })[] = [];
  for (const s of info) for (const b of info) {
    if (s.node.id === b.node.id || s.item.id !== b.item.id || s.area >= b.area) continue;
    const gap = b.lab[0] - s.lab[0], dh = hueDiff(s.lab, b.lab);
    if (gap < opts.minGap || gap > opts.maxGap || dh > opts.maxHue) continue;
    if ((s.area / (s.area + b.area)) * 100 > opts.maxSharePct) continue;
    if (!overlaps(s.box, b.box)) continue;
    out.push({ item: s.item, intoId: b.node.id, shadeId: s.node.id, gap, dh });
  }
  // one shade folds once: into its nearest hue twin (the closer lightness wins ties)
  const best = new Map<Id, (typeof out)[number]>();
  for (const p of out) { const q = best.get(p.shadeId); if (!q || p.dh < q.dh || (p.dh === q.dh && p.gap < q.gap)) best.set(p.shadeId, p); }
  return [...best.values()].map(({ item, intoId, shadeId }) => ({ item, intoId, shadeId }));
}

export const deshadow: ActionDef<DeshadowOpts> = {
  id: 'deshadow', label: 'Fold shadows', icon: 'i-solar:cloud-sun-linear', scope: 'part', arity: 'any', group: 'cleanup', ask: ['fold all the shadows into their layers'], kind: 'code',
  hint: 'Fold shadow layers into the layer they shade: a smaller, darker layer of the same hue joins the larger one it overlaps (same-colour design layers are left alone).',
  schema: { type: 'object', properties: { minGap: { type: 'number', minimum: 1, maximum: 15 }, maxGap: { type: 'number', minimum: 10, maximum: 60 }, maxHue: { type: 'number', minimum: 4, maximum: 45 }, maxSharePct: { type: 'number', minimum: 5, maximum: 50 } } }, defaults: DESHADOW_DEFAULTS,
  says: [/\bdeshadow\b/i, /\bfold\b.{0,25}\bshadows?( layers?)?\b/i, /\bshadows?\b.{0,25}\binto\b/i],
  can: (d, i) => {
    const ix = indexCraft(d);
    return i.targets.some((id) => { const n = ix.get(id); return n?.kind === 'part' && (n.node as PartDoc).ops.some((o) => o.kind === 'cut'); })
      ? true : 'Nothing with an outline to compare';
  },
  run(doc, { targets, opts }): ActionResult {
    const pairs = shadePairs(doc, targets, opts);
    if (!pairs.length) return { items: [], summary: 'No shadow layers found' };
    const folded: string[] = [], items: ItemDoc[] = [];
    for (const item of new Set(pairs.map((p) => p.item))) {
      const next = clone(item), gone = new Set<Id>();
      for (const p of pairs.filter((x) => x.item.id === item.id)) {
        const into = next.parts.find((x) => x.id === p.intoId), shade = next.parts.find((x) => x.id === p.shadeId);
        if (!into || !shade || gone.has(into.id) || gone.has(shade.id)) continue;
        const cuts = [...into.ops, ...shade.ops].filter((o) => o.kind === 'cut').map((o) => o.geometry);
        into.ops = [
          ...(cuts.length ? [{ id: into.ops.find((o) => o.kind === 'cut')!.id, kind: 'cut' as const, geometry: join(cuts) }] : []),
          ...[...into.ops, ...shade.ops].filter((o) => o.kind !== 'cut')
        ];
        gone.add(shade.id);
        folded.push(`${shade.name} → ${into.name}`);
      }
      if (gone.size) items.push({ ...next, parts: [...next.parts].filter((x) => !gone.has(x.id)).sort((a, b) => a.z - b.z).map((x, z) => ({ ...x, z })) });
    }
    if (!folded.length) return { items: [], summary: 'No shadow layers found' };
    return { items, summary: folded.length === 1 ? `Folded ${folded[0].replace(' → ', ' into ')}` : `Folded ${folded.length} shadow layers into their bases`, detail: folded.join(', ') };
  }
};

export const shadowActions = [deshadow];
