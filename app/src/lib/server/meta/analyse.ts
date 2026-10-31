import { SceneAnalysisSchema, SceneAnalysisJsonSchema, ImageBriefSchema, ImageBriefJsonSchema, type SceneAnalysis, type ImageBrief } from '../../domain/schemas';
import { measureScene, type MeasureResult } from '../../domain/measure';
import { MetaClient } from './client';
const FIXTURE: SceneAnalysis = { objects: [{ id: 'o1', label: 'hand-drawn M logo', samPrompt: 'logo drawing', role: 'art', bbox: [0, 0, 10, 10], shapeHint: 'freeform' }, { id: 'o2', label: 'mug base', samPrompt: 'bottom rim of the mug', role: 'fit_target', bbox: [0, 0, 10, 10], shapeHint: 'round' }, { id: 'o3', label: 'credit card', samPrompt: 'credit card', role: 'reference', bbox: [0, 0, 10, 10], shapeHint: 'rectangular' }], reference: { objectId: 'o3', kind: 'id1_card' }, camera: { topDownConfidence: 0.92 }, notes: 'demo fixture' };
export const FIXTURE_BRIEF: ImageBrief = {
  subject: 'layered paper art in a round hoop', class: 'layered', arrangement: 'stacked', likelyMaterial: 'paper',
  subjectPrompt: 'layered paper art',
  regions: [
    { id: 'frame', label: 'Frame ring', samPrompt: 'round frame ring', likelyBought: true, note: 'looks bought' },
    { id: 'sky', label: 'Sky', samPrompt: 'sky background', likelyBought: false, note: 'back layer' },
    { id: 'sun', label: 'Sun', samPrompt: 'round sun', likelyBought: false, note: 'small disc' },
    { id: 'mountains', label: 'Mountains', samPrompt: 'mountain range', likelyBought: false, note: 'peaks and ridge' },
    { id: 'trees', label: 'Hills and pines', samPrompt: 'hills and pine trees', likelyBought: false, note: 'foreground' }
  ],
  items: [], colourGroupsHint: 6, reference: null, topDownConfidence: 0.9, notes: 'demo fixture',
  realSizeMm: { w: 300, h: 300, basis: 'a typical 30 cm embroidery hoop' }
};
const BRIEF_SYSTEM = 'You are Katachi, a workshop buddy who turns a photo into cut layers. Classify the image for a layered/3D craft build. Set arrangement: stacked = one piece made of stacked layers; multiple-items = several separate finished objects side by side (bookmarks, earrings, coasters, ornaments) — then regions MUST be one entry per separate object, ordered left to right, each with its own SAM noun phrase, AND items[] MUST carry one entry per object with its own arrangement (stacked if that object itself has layers, else single-item) and its internal regions when stacked; single-item = one flat shape; assembly-3d = parts of one 3D object. Give each distinct region a short SAM noun phrase. Mark bought hardware (frames, hoops, tassels, cords) likelyBought. Never emit coordinates. A photo has no scale: estimate realSizeMm, the real-world width and height in millimetres of the whole piece (for multiple-items: of ONE typical item, as it lies flat), from what it is and its proportions — e.g. a bookmark is about 50 × 180 mm, layered paper wall art 300–450 mm, a coaster 90–100 mm across — and give the basis in a few words.';
/** S2 Classify: Spark vision on the real image -> ImageBrief. Fixture brief without a key or on failure. */
export async function analyseImage(env: Record<string, string | undefined>, imageDataUrl: string | undefined, client?: MetaClient): Promise<{ brief: ImageBrief; source: 'live' | 'fixture'; trace: { model: string; purpose: string; stage: string; latencyMs: number; costUsd: number }[] }> {
  if (env.META_API_KEY && imageDataUrl) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const r = await c.sparkVision(BRIEF_SYSTEM, 'Analyse this photo for a layered craft build.', imageDataUrl, ImageBriefJsonSchema as unknown as Record<string, unknown>, 'ImageBrief');
      const parsed = ImageBriefSchema.safeParse(r.data);
      if (parsed.success) {
        let brief = parsed.data;
        if (brief.regions.length < 3 && brief.arrangement !== 'multiple-items') {
          try {
            const again = await c.sparkVision(BRIEF_SYSTEM, 'List at least 5 distinct cuttable regions of this image, back to front, each one region only.', imageDataUrl, ImageBriefJsonSchema as unknown as Record<string, unknown>, 'ImageBrief');
            const second = ImageBriefSchema.safeParse(again.data);
            if (second.success && second.data.regions.length > brief.regions.length) brief = { ...brief, regions: second.data.regions };
          } catch { /* keep the first brief */ }
        }
        // Deterministic normalisation: a pattern-shape photo with several regions is a set of separate
        // items (bookmarks, coasters, earrings) even when Spark under-reports the arrangement/items.
        if (brief.class === 'pattern-shape' && brief.regions.length >= 3 && brief.arrangement !== 'multiple-items' && /separate|set of|items|bookmarks|coasters|earrings|ornaments|each (is|bookmark|item)/i.test(brief.subject + ' ' + brief.notes)) brief = { ...brief, arrangement: 'multiple-items' };
        if (brief.arrangement === 'multiple-items' && !brief.items.length) brief = { ...brief, items: brief.regions.filter((r) => !r.likelyBought).map((r) => ({ id: r.id, label: r.label, samPrompt: r.samPrompt, arrangement: 'single-item' as const, regions: [] })) };
        return { brief, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_image', stage: 'S2', latencyMs: r.latencyMs, costUsd: r.costUsd }] };
      }
      console.error('ImageBrief parse failed, using fixture');
    } catch (e) { console.error('live image analysis failed, using fixture:', e instanceof Error ? e.message : String(e)); }
  }
  return { brief: FIXTURE_BRIEF, source: 'fixture', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_image (demo fixture — set META_API_KEY for live)', stage: 'S2', latencyMs: 900, costUsd: 0.01 }] };
}
export async function analyseScene(env: Record<string, string | undefined>, client?: MetaClient): Promise<{ scene: SceneAnalysis; measure: MeasureResult; source: 'live' | 'fixture'; trace: { model: string; purpose: string; latencyMs: number; costUsd: number }[] }> {
  const measure = measureScene({ reference: { kind: 'id1_card', wPx: 856, hPx: 540 }, targets: [{ id: 'o2', shape: 'round', minorPx: 820, majorPx: 850 }] });
  if (env.META_API_KEY) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const r = await c.sparkJson('You are Katachi, a workshop buddy. Analyse the workshop scene described by the user: identify the art sketch, the fit target object, and the size reference.', 'A hand-drawn M logo sketch, a mug, and a credit card on a work bench, shot from above.', SceneAnalysisJsonSchema as unknown as Record<string, unknown>, 'SceneAnalysis');
      const parsed = SceneAnalysisSchema.safeParse(r.data);
      if (parsed.success) return { scene: parsed.data, measure, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_scene', latencyMs: r.latencyMs, costUsd: r.costUsd }] };
    } catch (e) { console.error('live scene failed, using fixture:', e instanceof Error ? e.message : String(e)); }
  }
  return { scene: FIXTURE, measure, source: 'fixture', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_scene (demo fixture — set META_API_KEY for live)', latencyMs: 900, costUsd: 0.01 }, { model: 'sam-3.1', purpose: 'mask mug base', latencyMs: 600, costUsd: 0.0075 }] };
}
