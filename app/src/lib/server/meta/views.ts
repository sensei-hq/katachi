import { MetaClient } from './client';
// Several pictures of one object, in any order and any number (not exactly six): Muse Spark says which side each
// one shows, which are close-ups or cut plans (kept as reference), what the object is and its real size.
import { ANGLES, PICTURE_KINDS, ViewsJsonSchema, type PictureRole, type ViewsBrief } from '../../domain/views';
export type { PictureRole, ViewsBrief };
const SYSTEM = `You are Katachi, a workshop buddy that rebuilds a real object from flat laser-cut or paper parts.
You get several pictures of ONE object, in any order — not always six, sometimes with extras. For each picture (index from 1):
- kind: "view" (the whole object from one side), "detail" (a close-up of part of it), "plan" (a cut sheet / parts layout / template), or "other".
- angle for a view: front, back, left, right, top, base, or three-quarter (an angled view showing two sides); "unknown" for non-views.
- note: a few words on what it shows ("lit doorway close-up", "parts layout, 12 sheets").
Also: what the object is (subject), its likely material, and its real size in millimetres (w × h × d) estimated from what it is, with the basis in a few words.`;
/** Fixture without a key: the pictures in the order a person usually shoots them. */
export function fixtureViews(n: number): ViewsBrief {
  const order: PictureRole['angle'][] = ['front', 'right', 'back', 'left', 'top', 'base'];
  return { subject: 'a 3D object', likelyMaterial: 'wood', realSizeMm: { w: 200, h: 220, d: 200, basis: 'a typical desk model' }, pictures: Array.from({ length: n }, (_, i) => ({ index: i + 1, kind: 'view' as const, angle: order[i] ?? 'unknown', note: '' })) };
}
export async function sortViews(env: Record<string, string | undefined>, images: string[], client?: MetaClient): Promise<{ brief: ViewsBrief; source: 'live' | 'fixture'; trace: { model: string; purpose: string; latencyMs: number; costUsd: number }[] }> {
  const imgs = images.filter((u) => /^data:image\/(jpeg|jpg|png|gif|webp)[;,]|^https?:/i.test(u)).slice(0, 8);
  if (env.META_API_KEY && imgs.length) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const r = await c.sparkVisionMany(SYSTEM, `${imgs.length} pictures of one object. Sort them.`, imgs, ViewsJsonSchema as unknown as Record<string, unknown>, 'Views');
      const d = r.data as ViewsBrief;
      if (d && Array.isArray(d.pictures) && d.subject) {
        const pictures = d.pictures.filter((p) => p.index >= 1 && p.index <= imgs.length && PICTURE_KINDS.includes(p.kind) && ANGLES.includes(p.angle));
        return { brief: { ...d, pictures }, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'sort_views', latencyMs: r.latencyMs, costUsd: r.costUsd }] };
      }
    } catch (e) { console.error('views failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { brief: fixtureViews(images.length), source: 'fixture', trace: [] };
}
