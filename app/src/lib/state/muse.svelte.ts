import { agentJobs, type AgentJobId } from '../content/agents';
import { copy, regions, layerSets, type Kind, type MakeAs } from '../content/layers';
import { fixtureParts, type Check, type Outline, type Part, type Region } from './layer-flow.svelte';
import type { AssemblyStep } from '../domain/assembly';
import { startFor, type Start } from '../content/journey';
import type { ImageBrief } from '../domain/schemas';
import type { Layer } from '../content/layers';
import { loadPixels } from './photo';
import { measureLayers, measureRefine, measureSubject } from './measure';
import { parseLayerOp, rasterisePaths, readPlan, woodPiece } from '../domain/layering';
import { cutLength, pathsToSvg, scalePaths } from '../domain/vector';

type Live<T> = { result: T; summary: string; source?: 'live' | 'fixture'; costUsd?: number; /** who actually did it, when not the job's usual model (code measured it) */ model?: import('../content/agents').AgentModel };
async function post(route: string, body: unknown): Promise<any | null> {
  try {
    const r = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r || typeof r.json !== 'function') return null;
    const j = await r.json().catch(() => null);
    return (r as { ok?: boolean }).ok === false ? null : j;
  } catch { return null; }
}
/** what the Meta API accepts: JPEG, PNG, GIF, WebP data URLs (AVIF/HEIC uploads are re-encoded to JPEG at Analyze) */
const sendable = (u?: string) => Boolean(u && (/^data:image\/(jpeg|jpg|png|gif|webp)[;,]/i.test(u) || u.startsWith('http')));
async function withPhotoColours(imageDataUrl: string | undefined, found: Region[]): Promise<Region[]> {
  if (!imageDataUrl || typeof document === 'undefined') return found;
  try {
    const { dominantColour } = await import('../domain/colour');
    const img = new Image();
    await Promise.race([new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = imageDataUrl; }), new Promise<void>((_, rej) => setTimeout(() => rej(new Error('colour timeout')), 700))]);
    const w = 240, h = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); if (!ctx) return found;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return found.map((r) => {
      const paths = r.paths?.length ? r.paths : r.box ? [[[r.box.x1, r.box.y1], [r.box.x2, r.box.y1], [r.box.x2, r.box.y2], [r.box.x1, r.box.y2]] as [number, number][]] : [];
      const colour = paths.length ? dominantColour({ data: data.data, w, h }, paths) : null;
      return colour ? { ...r, colour } : r;
    });
  } catch { return found; }
}
const traceCost = (j: any): number | undefined => Array.isArray(j?.trace) ? j.trace.reduce((a: number, x: any) => a + (Number(x?.costUsd) || 0), 0) : undefined;

/** One run of a model or agent job for a craft, as the UI shows it. */
export interface AgentTask { key: string; job: AgentJobId; craftId: string; status: 'running' | 'done' | 'placeholder' | 'failed'; summary: string; costUsd?: number; ms?: number; model?: import('../content/agents').AgentModel }

const tick = () => new Promise<void>((r) => queueMicrotask(r));

/**
 * The only place the craft journey talks to Meta models and agents (presentation never does).
 * Each job runs through `run`, which records a task the screens render. Today every craft job is a
 * placeholder: it returns a fixture in the shape the live call will return, and is marked as such.
 * Wiring one means replacing its body with a fetch to the route in content/agents.ts.
 */
export class MuseAgents {
  tasks = $state<AgentTask[]>([]);
  /** decodes the photo for the code-side measurements (tests pass pixels directly) */
  pixels: (url: string | undefined, max: number) => Promise<import('../domain/colour').PixelImage | null> = loadPixels;
  /** told about every finished job (AppState posts it in the chat with its model, action and cost) */
  onFinish: ((t: AgentTask) => void) | null = null;

  private async run<T>(job: AgentJobId, craftId: string, work: () => Promise<Live<T>>): Promise<T> {
    const key = `${craftId}:${job}:${this.tasks.length}`;
    this.tasks = [...this.tasks, { key, job, craftId, status: 'running', summary: agentJobs[job].label }];
    const set = (patch: Partial<AgentTask>) => { this.tasks = this.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)); };
    const started = Date.now();
    const finish = (patch: Partial<AgentTask>) => { set({ ...patch, ms: Date.now() - started }); const t = this.tasks.find((x) => x.key === key); if (t) this.onFinish?.(t); };
    try {
      const { result, summary, source, costUsd, model } = await work();
      const live = source ? source === 'live' : agentJobs[job].status === 'live';
      finish({ status: live ? 'done' : 'placeholder', summary, costUsd: live ? (costUsd ?? agentJobs[job].estUsd) : agentJobs[job].estUsd, ...(model ? { model } : {}) });
      return result;
    } catch (e) {
      finish({ status: 'failed', summary: `${agentJobs[job].label} failed`, costUsd: 0 });
      throw e;
    }
  }
  /** a job already ran (or is running) for this craft */
  has(craftId: string, job: AgentJobId) { return this.tasks.some((t) => t.craftId === craftId && t.job === job && t.status !== 'failed'); }
  /** tasks for one craft, newest last */
  forCraft(craftId: string | undefined) { return craftId ? this.tasks.filter((t) => t.craftId === craftId) : []; }

  // ── Home
  /** Spark classifies intent into a starting point. Placeholder: keyword match, synchronous so Capture opens at once. */
  classifyIntent(text: string, craftId: string): Start {
    const start = startFor(text);
    void this.run('intent.classify', craftId, async () => ({ result: start, summary: `Reads “${text}” as ${start.label.toLowerCase()}` }));
    return start;
  }
  // ── Capture
  describeCapture(craftId: string, kind: Kind, imageDataUrl?: string) {
    const fallback = kind === '3d' ? 'a birdhouse' : 'layered paper art in a round hoop';
    return this.run('capture.describe', craftId, async () => {
      const j = sendable(imageDataUrl) ? await post('/api/scene', { imageDataUrl }) : null;
      const brief = (j?.brief ?? null) as ImageBrief | null;
      if (brief?.subject) return { result: { subject: brief.subject, brief }, summary: `Sees ${brief.subject}`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      await tick(); return { result: { subject: fallback, brief: null as ImageBrief | null }, summary: `Sees ${fallback}`, source: 'fixture' as const };
    });
  }
  /** Several pictures of one object: Spark says which side each shows, which are close-ups or cut plans, the object and its size */
  sortViews(craftId: string, images: string[]) {
    return this.run('capture.describe', craftId, async () => {
      const send = images.filter((u) => sendable(u));
      const j = send.length ? await post('/api/views', { images: send }) : null;
      const brief = (j?.brief ?? null) as import('../domain/views').ViewsBrief | null;
      if (brief?.pictures?.length) return { result: brief, summary: `Sorted ${brief.pictures.length} pictures of ${brief.subject}`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      await tick();
      const order = ['front', 'right', 'back', 'left', 'top', 'base'] as const;
      return { result: { subject: 'a 3D object', likelyMaterial: 'unknown' as const, realSizeMm: { w: 200, h: 200, d: 200, basis: '' }, pictures: images.map((_, i) => ({ index: i + 1, kind: 'view' as const, angle: order[i] ?? 'unknown' as const, note: '' })) }, summary: `${images.length} views in the usual order`, source: 'fixture' as const };
    });
  }
  /** Import brief via Spark (/api/convert). Lives here so AppState never fetches directly. */
  async brief(body: { imageDataUrl?: string; description: string; group: string }) { return post('/api/convert', body); }
  // ── Shape
  cleanSketch(craftId: string, imageDataUrl?: string) {
    return this.run('shape.cleanSketch', craftId, async () => {
      const j = sendable(imageDataUrl) ? await post('/api/art', { imageDataUrl, prompt: 'Redraw this sketch as clean, bold, single-color black line art on pure white, laser-engraving friendly, keep the composition', n: 1 }) : null;
      const images = (j?.images ?? []) as string[];
      if (images.length) return { result: { variants: images.length, images }, summary: `${images.length} line-art take of your sketch`, source: 'live' as const, costUsd: traceCost(j) };
      await tick(); return { result: { variants: 3, images: [] as string[] }, summary: '3 line-art takes of your sketch', source: 'fixture' as const };
    });
  }
  /**
   * Shape · remove the background. SAM 3.1 outlines the subject by phrase; code then measures the backdrop
   * from the photo's border (a wall, its shadows, a shelf) and keeps the object, using SAM's outline as a hint
   * so flowers and rims around a cat stay attached. `strict` = the user asked for the backdrop to go.
   */
  cutout(craftId: string, opts: { imageDataUrl?: string; subjectPrompt?: string; strict?: boolean; phrases?: string[] } = {}) {
    const fallbackOutline: Outline = { shape: 'circle', sizeMm: 300 };
    const fallbackChecks = copy.cutout.checks.map((c) => ({ ...c })) as Check[];
    return this.run('shape.cutout', craftId, async () => {
      const j = sendable(opts.imageDataUrl) ? await post('/api/segment', { imageDataUrl: opts.imageDataUrl, prompt: opts.subjectPrompt || 'wall art' }) : null;
      const samPaths = ((j?.masks ?? []) as { paths?: [number, number][][] }[]).flatMap((m) => m.paths ?? []) as [number, number][][];
      const px = await this.pixels(opts.imageDataUrl, 400);
      if (px) {
        const m = await measureSubject(px, { strict: opts.strict, hintPaths: samPaths.length && j?.source === 'live' ? samPaths : undefined });
        // trust SAM alone when the colour flood clearly failed (the subject fills the frame or almost nothing)
        const useCode = m.areaPct > 3 && m.areaPct < 92;
        const paths = useCode ? m.paths : samPaths;
        if (paths.length) {
          const box = paths.flat().reduce((b, [x, y]) => ({ x1: Math.min(b.x1, x), y1: Math.min(b.y1, y), x2: Math.max(b.x2, x), y2: Math.max(b.y2, y) }), { x1: 1000, y1: 1000, x2: 0, y2: 0 });
          const bw = box.x2 - box.x1, bh = box.y2 - box.y1;
          const shape: Outline['shape'] = Math.abs(bw - bh) / Math.max(bw, bh) < 0.12 ? 'circle' : bw > 0 && bh > 0 && m.areaPct / ((bw * bh) / 10000) > 0.9 ? 'rect' : 'free';
          const samLive = j?.source === 'live' && samPaths.length > 0;
          const checks: Check[] = [
            { status: 'pass', text: useCode ? `Background removed · ${opts.strict ? 'wall and props cleared' : 'backdrop measured from the photo edge'} (code)` : 'Background removed · SAM 3.1 outline' },
            { status: samLive ? 'pass' : 'warn', text: samLive ? 'Outline hint · SAM 3.1 (live)' : 'SAM 3.1 found no outline · photo colours only' },
            { status: 'pass', text: `Subject · ${useCode ? m.areaPct : '—'}% of the photo · ${shape} outline` }
          ];
          return { result: { outline: { shape, sizeMm: 300 } as Outline, checks, paths, aspect: (px.w / px.h) as number | undefined }, summary: `Background removed · ${shape} outline${useCode ? `, ${m.areaPct}% of the photo` : ''}`, source: samLive || useCode ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
        }
      }
      const box = j?.boxes?.[0];
      if (box) {
        const w = Math.max(1, box.x2 - box.x1), h = Math.max(1, box.y2 - box.y1);
        const shape: Outline['shape'] = Math.abs(w - h) / Math.max(w, h) < 0.25 ? 'circle' : 'rect';
        const outline: Outline = { shape, sizeMm: 300 };
        const checks: Check[] = [{ status: 'pass', text: `Outline found · SAM 3.1 (${j.source ?? 'fixture'})` }, { status: 'pass', text: `Shape · ${shape}` }];
        const paths = ((j?.masks ?? []) as { paths?: [number, number][][] }[]).flatMap((m) => m.paths ?? []) as [number, number][][];
        const items = (j?.masks ?? []).length;
        return { result: { outline, checks, paths, aspect: undefined as number | undefined }, summary: items > 1 ? `Background removed · ${items} separate items traced` : `Background removed · ${shape} outline, Ø 300 mm`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      }
      // A real photo never gets the demo outline: say what failed so the user can ask again
      if (sendable(opts.imageDataUrl)) { await tick(); return { result: { outline: fallbackOutline, checks: [{ status: 'fail', text: 'Could not trace the outline from this photo' }, { status: 'warn', text: 'Say “remove the background” to try again' }] as Check[], paths: [] as [number, number][][], aspect: undefined as number | undefined }, summary: 'Outline not found in this photo', source: 'fixture' as const }; }
      await tick(); return { result: { outline: fallbackOutline, checks: fallbackChecks, paths: [] as [number, number][][], aspect: undefined as number | undefined }, summary: `Background removed · ${fallbackOutline.shape} outline, Ø ${fallbackOutline.sizeMm} mm`, source: 'fixture' as const };
    });
  }
  segment(craftId: string, opts: { imageDataUrl?: string; briefRegions?: ImageBrief['regions']; brief?: ImageBrief | null; subjectPaths?: [number, number][][]; k?: number; plan?: import('../domain/layering').StackPlan | null } = {}) {
    const fallback: Region[] = regions.map((r) => ({ ...r }));
    return this.run('shape.segment', craftId, async () => {
      // One stacked piece (layered paper / wood art): its layers are colour groups, so code measures them from
      // the photo inside the subject outline. SAM per phrase finds the most salient *object* (the cat) for
      // "gold backer" and "red leaves" alike, so it is kept for separate items, not for colour layers.
      const stacked = opts.brief?.arrangement !== 'multiple-items';
      const px = stacked && opts.subjectPaths?.length ? await this.pixels(opts.imageDataUrl, 800) : null;
      if (px) {
        const titles = (opts.briefRegions ?? []).filter((r) => !r.likelyBought).map((r) => r.label);
        const k = opts.k ?? Math.min(8, Math.max(3, opts.brief?.colourGroupsHint ?? titles.length ?? 5));
        const layers = await measureLayers(px, opts.subjectPaths!, { k, titles, plan: opts.plan ?? null });
        if (layers.length >= 2) {
          const tones = ['warn', 'ink', 'accent', 'ok', 'muted'] as const;
          const found = layers.map((l, i) => ({ id: `c${l.n}` as Region['id'], name: l.name, pct: l.visiblePct, note: `colour group ${l.hex} · ${l.hiddenPct}% hidden under the layers in front`, tone: tones[i % tones.length], keep: true, colour: l.hex, paths: l.visiblePaths, cutPaths: l.sheetPaths, hiddenPct: l.hiddenPct })) as Region[];
          return { result: found, summary: opts.plan ? `${found.length} layers built to your stack (code)` : `${found.length} colour layers measured from your photo (code)`, source: 'live' as const, costUsd: 0, model: 'Code' as const };
        }
      }
      const many = opts.brief?.arrangement === 'multiple-items' && Boolean(opts.brief.items?.length);
      const j = sendable(opts.imageDataUrl) && (opts.briefRegions?.length || many) ? await post('/api/segment', { imageDataUrl: opts.imageDataUrl, regions: opts.briefRegions ?? [], ...(opts.brief?.arrangement === 'multiple-items' ? { multiple: true, subjectPrompt: opts.brief.subjectPrompt, items: opts.brief.items ?? [] } : {}) }) : null;
      const live = (j?.regions ?? []) as { id: string; label: string; note?: string; areaPct?: number; keep?: boolean; ones?: number; paths?: [number, number][][]; box?: { x1: number; y1: number; x2: number; y2: number }; itemId?: string; itemName?: string }[];
      if (live.length) {
        const tones = ['warn', 'accent', 'ok', 'ink', 'muted'] as const;
        let found = live.map((r, i) => ({ id: r.id as Region['id'], name: r.label, pct: Math.round((r.areaPct ?? 0) * 10) / 10, note: r.note ?? '', tone: tones[i % tones.length], keep: r.keep ?? true, ...(r.ones ? { ones: r.ones } : {}), ...(r.paths?.length ? { paths: r.paths } : {}), ...(r.box ? { box: r.box } : {}), ...(r.itemId ? { itemId: r.itemId, itemName: r.itemName } : {}) })) as Region[];
        found = await withPhotoColours(opts.imageDataUrl, found);
        // separate items cut from wood or acrylic (bookmarks, coasters): each item is a cut outline plus an
        // engraving — code measures the engraved detail inside each item from the photo (two tones per item)
        const laser = opts.brief?.arrangement === 'multiple-items' && (opts.brief.likelyMaterial === 'wood' || opts.brief.likelyMaterial === 'acrylic');
        // full resolution: small items (earrings) have holes only a few pixels wide at working size
        const ipx = laser ? await this.pixels(opts.imageDataUrl, 1600) : null;
        if (ipx) {
          const extra: Region[] = [];
          for (const r of found) {
            if (!r.paths?.length) continue;
            r.role = 'cut';
            // fretwork: dark blobs inside the item are see-through holes (cut out); thin dark lines are engraving
            const wp = woodPiece(ipx, rasterisePaths(r.paths, ipx.w, ipx.h));
            if (wp.holesPct >= 2) r.holes = wp.holePaths;
            // an engraving that would show 0% of the item is no layer at all
            // in heavy fretwork (mostly holes), a little dark left over is the cut walls' shadow, not engraving
            if (wp.holesPct > 35 && wp.engravePct < 4) continue;
            if (wp.engravePct < 2 || wp.engravePct > 70 || !wp.engravePaths.length || (wp.engravePct * r.pct) / 100 < 0.5) continue;
            extra.push({ id: `${r.id}-e` as Region['id'], name: `${r.itemName ?? r.name} · engraving`, pct: Math.round(((wp.engravePct * r.pct) / 100) * 10) / 10, note: `engraved detail inside the item${r.holes ? ` · ${wp.holesPct}% of it is cut through` : ''}`, tone: 'ink', keep: true, colour: '#5A3A22', paths: wp.engravePaths, itemId: r.itemId ?? r.id, itemName: r.itemName ?? r.name, role: 'engrave' } as Region);
          }
          found = [...found, ...extra];
        }
        return { result: found, summary: opts.brief?.arrangement === 'multiple-items' ? `${found.length} separate items found` : `${found.length} regions found`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      }
      // A real photo never gets the demo regions (the mountain scene): nothing found is shown as nothing found
      if (sendable(opts.imageDataUrl)) { await tick(); return { result: [] as Region[], summary: 'No regions found yet — the outline is needed first', source: 'fixture' as const }; }
      await tick(); return { result: fallback, summary: `${fallback.length} regions found`, source: 'fixture' as const };
    });
  }
  // ── Layers
  planLayers(craftId: string, makeAs: MakeAs, opts: { imageDataUrl?: string; description?: string; regions?: Region[]; brief?: ImageBrief | null; named?: boolean } = {}) {
    const set = layerSets[makeAs === 'wood' ? 'wood' : 'paper'];
    const fallback: Layer[] = [];
    return this.run('layers.plan', craftId, async () => {
      const kept = (opts.regions ?? []).filter((r) => (r as { on?: boolean }).on ?? r.keep);
      const material = makeAs === 'wood' ? '3 mm birch plywood' : makeAs === 'acrylic' ? '3 mm acrylic' : makeAs === 'paper' ? 'Cardstock' : opts.brief?.likelyMaterial === 'wood' ? '3 mm birch plywood' : opts.brief?.likelyMaterial === 'acrylic' ? '3 mm acrylic' : set.layers[0].material;
      // Several separate finished objects (bookmarks, earrings…): each item is its own cut, never a stack.
      if (opts.brief?.arrangement === 'multiple-items' && kept.length) {
        const groups: Record<string, Region[]> = {};
        for (const r of kept) { const k = r.itemName ?? r.name; groups[k] = [...(groups[k] ?? []), r]; }
        const layers: Layer[] = [];
        for (const [item, rs0] of Object.entries(groups)) {
          const rs = [...rs0].sort((a, b) => (a.role === 'engrave' ? 1 : 0) - (b.role === 'engrave' ? 1 : 0));
          for (const [j, r] of rs.entries()) layers.push({ n: layers.length + 1, name: r.role === 'cut' ? `${r.name} · cut` : r.name, shapes: ['sky'], colour: r.colour ?? set.layers[layers.length % set.layers.length].colour, visiblePct: Math.round(r.pct * 10) / 10, hiddenPct: rs.length > 1 && j < rs.length - 1 ? 40 : 0, material, regionId: r.id, itemName: item, ...(r.role ? { role: r.role } : {}) });
        }
        const itemCount = Object.keys(groups).length;
        return { result: layers, summary: itemCount > 1 ? `${itemCount} separate items · ${layers.length} cuts` : `${layers.length} separate items · one cut each`, source: 'live' as const, costUsd: 0, model: 'Code' as const };
      }
      // the user named the stack: its names and order stand, no need to ask Spark for titles
      if (opts.named && kept.length >= 2) return { result: kept.map((r, i) => ({ n: i + 1, name: r.name, shapes: ['sky' as const], colour: r.colour ?? set.layers[i % set.layers.length].colour, visiblePct: Math.round(r.pct * 10) / 10, hiddenPct: r.hiddenPct ?? 0, material, regionId: r.id })) as Layer[], summary: `${kept.length} layers, as you stacked them`, source: 'live' as const, costUsd: 0, model: 'Code' as const };
      const j = sendable(opts.imageDataUrl) ? await post('/api/convert', { imageDataUrl: opts.imageDataUrl, description: opts.description ?? 'layered craft from this photo', group: makeAs === 'wood' ? 'laser-cut' : 'cricut-paper' }) : null;
      const pieces = (j?.pieces ?? []) as { name: string; kind: string; note: string }[];
      const layerPieces = pieces.filter((x) => x.kind === 'layer' || j?.conversionClass === 'layered');
      // Layers are built from the SAM regions (every layer is guaranteed its own mask, colour and content);
      // Spark's convert pieces only lend nicer titles, matched by stemmed word overlap - never by position.
      if (kept.length >= 2) {
        const stem = (w: string) => w.toLowerCase().replace(/(ies)$/, 'y').replace(/(es|s)$/, '').replace(/floral/, 'flower').replace(/leave/, 'leaf');
        const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).map(stem).filter((w) => w.length > 2);
        const used: number[] = [];
        const layers: Layer[] = kept.map((r, i) => {
          const rt = tokens(r.name + ' ' + r.note);
          let best = -1, bestScore = 0;
          layerPieces.forEach((piece, pi) => { if (used.includes(pi)) return; const score = tokens(piece.name + ' ' + (piece.note ?? '')).filter((w) => rt.includes(w)).length; if (score > bestScore) { bestScore = score; best = pi; } });
          const title = best >= 0 && bestScore > 0 ? layerPieces[best].name.replace(/^Layer \d+\s*(\((back|mid|front)\))?\s*[-–—:·]?\s*/i, '') : '';
          if (best >= 0) used.push(best);
          return { n: i + 1, name: title || r.name, shapes: ['sky' as const], colour: r.colour ?? set.layers[i % set.layers.length].colour, visiblePct: Math.round(r.pct * 10) / 10, hiddenPct: r.hiddenPct ?? (i === kept.length - 1 ? 0 : 40), material, regionId: r.id };
        });
        return { result: layers, summary: `${layers.length} layers from the regions in your photo`, source: j ? (j.source === 'live' ? 'live' as const : 'fixture' as const) : 'live' as const, costUsd: traceCost(j) ?? j?.costUsd };
      }
      if (layerPieces.length >= 2) {
        const shapes = ['sky', 'sun', 'far', 'ridge', 'hills', 'pines'] as const;
        const layers: Layer[] = layerPieces.map((piece, i) => { const base = set.layers[i % set.layers.length]; return { n: i + 1, name: piece.name.replace(/^Layer \d+\s*(\((back|mid|front)\))?\s*[-–—:·]?\s*/i, '') || piece.name, shapes: [shapes[i % shapes.length]], colour: base.colour, visiblePct: Math.max(2, Math.round((100 / layerPieces.length) * 10) / 10), hiddenPct: i === layerPieces.length - 1 ? 0 : 40, material: base.material }; });
        return { result: layers, summary: `${layers.length} layers · ${String(j.objective ?? set.label).slice(0, 60)}`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) ?? j?.costUsd };
      }
      // No convert plan, but we have SAM regions: one layer per kept region, bound to its mask + photo colour.
      if (kept.length) {
        const layers: Layer[] = kept.map((r, i) => ({ n: i + 1, name: r.name, shapes: ['sky'], colour: r.colour ?? set.layers[i % set.layers.length].colour, visiblePct: Math.round(r.pct * 10) / 10, hiddenPct: i === kept.length - 1 ? 0 : 40, material, regionId: r.id }));
        return { result: layers, summary: `${layers.length} layers from the regions in your photo`, source: 'live' as const, costUsd: 0 };
      }
      await tick(); return { result: fallback, summary: 'No layers yet — run Segment first', source: 'fixture' as const };
    });
  }
  imagineGaps(craftId: string, imageDataUrl?: string) {
    return this.run('layers.imagineGaps', craftId, async () => {
      const j = sendable(imageDataUrl) ? await post('/api/art', { imageDataUrl, prompt: 'Continue the hidden areas behind each layer in the same flat style, single colours', n: 1 }) : null;
      const images = (j?.images ?? []) as string[];
      if (images.length) return { result: { filled: images.length, images }, summary: 'Imagined what hides behind each layer', source: 'live' as const, costUsd: traceCost(j) };
      await tick(); return { result: { filled: 0, images: [] as string[] }, summary: 'Ready to fill hidden areas when you ask', source: 'fixture' as const };
    });
  }
  unfold(craftId: string) {
    const parts: Part[] = fixtureParts.map((p) => ({ ...p, needs: [...p.needs] }));
    return this.run('layers.unfold', craftId, async () => { await tick(); return { result: parts, summary: `${parts.length} part groups · front, back, sides, roof, floor` }; });
  }
  /** enhance (design/14): an item's crop, outlined again by SAM. The crop is encoded here (browser), never in domain/ */
  async segmentCrop(img: import('../domain/colour').PixelImage, prompt: string): Promise<{ paths: [number, number][][]; costUsd: number; latencyMs: number } | null> {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = img.w; canvas.height = img.h;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    const t = performance.now(), j = await post('/api/segment', { imageDataUrl: canvas.toDataURL('image/jpeg', 0.92), prompt });
    const paths = ((j?.masks ?? []) as { paths?: [number, number][][] }[]).flatMap((m) => m.paths ?? []) as [number, number][][];
    return paths.length ? { paths, costUsd: traceCost(j) ?? 0, latencyMs: Math.round(performance.now() - t) } : null;
  }
  /** the chat's planner (design/14 §7): Muse Spark picks from the actions; code runs them */
  planActions(craftId: string, body: { text: string; layers: { n: number; name: string; item: string; role: string; shows: number }[]; selected: number[]; actions: { id: string; hint: string; options: string }[] }) {
    return this.run('layers.refine', craftId, async () => {
      const j = await post('/api/actions/plan', body);
      const answer = (j?.answer ?? { calls: [], reply: '', ask: '' }) as { calls: { action: string; refs: { kind: string; value: string }[]; opts: Record<string, unknown> }[]; reply: string; ask: string };
      return { result: answer, summary: answer.calls.length ? `Planned ${answer.calls.map((c) => c.action).join(', ')}` : answer.ask ? 'Asked which layers' : `Read “${body.text}” as a note`, source: j?.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
    });
  }
  /** A 3D kit's cut plan, read by code from its picture (design/13): each framed sheet, its pieces (what the cut
   *  lines close off) and its engraving. A low-resolution picture gives approximate outlines. */
  readCutPlan(craftId: string, url: string | undefined) {
    return this.run('layers.readPlan', craftId, async () => {
      const img = await loadPixels(url, 1600);
      const sheets = img ? readPlan(img) : [];
      const pieces = sheets.reduce((a, s) => a + s.pieces, 0);
      return { result: { sheets, w: img?.w ?? 0, h: img?.h ?? 0 }, summary: sheets.length ? `Read ${sheets.length} sheets · ${pieces} pieces from the cut plan` : 'No sheets found in the cut plan', source: 'live' as const, costUsd: 0 };
    });
  }
  /** Six-view stitch (design/08-B): SAM silhouette per captured view -> stitchViews -> panels as layers + rectangle sheets. */
  stitchViews(craftId: string, opts: { views: { view: import('../content/layers').ViewId; url?: string }[]; sizeMm?: number; joinery?: import('../content/layers').Joinery; thicknessMm?: number }) {
    return this.run('layers.unfold', craftId, async () => {
      const { stitchViews } = await import('../domain/stitch');
      const silhouettes: import('../domain/stitch').ViewSilhouette[] = [];
      let live = false;
      for (const v of opts.views) {
        const j = v.url && sendable(v.url) ? await post('/api/segment', { imageDataUrl: v.url, prompt: 'the whole object' }) : null;
        const box = j?.boxes?.[0];
        if (box) { live = true; silhouettes.push({ view: v.view, box, areaPct: Math.round((((box.x2 - box.x1) * (box.y2 - box.y1)) / 10000) * 10) / 10 }); }
      }
      if (!silhouettes.length) {
        const demo: [import('../content/layers').ViewId, number, number][] = [['front', 420, 320], ['right', 240, 320], ['top', 420, 240]];
        for (const [view, w, h] of demo) silhouettes.push({ view, box: { x1: 100, y1: 100, x2: 100 + w, y2: 100 + h }, areaPct: 30 });
      }
      const spec = stitchViews(silhouettes, { sizeMm: opts.sizeMm ?? 300, thicknessMm: opts.thicknessMm ?? 6, joinery: opts.joinery ?? 'finger' });
      const layers: Layer[] = spec.panels.map((panel, i) => ({ n: i + 1, name: panel.name, shapes: ['sky'], colour: '#C89B6A', visiblePct: 100, hiddenPct: 0, material: '6 mm ply', regionId: undefined }));
      const sheets = spec.panels.map((panel) => ({ name: panel.name, svg: `M0 0L${panel.wMm} 0L${panel.wMm} ${panel.hMm}L0 ${panel.hMm}Z`, pathCount: 1, cutLengthMm: 2 * (panel.wMm + panel.hMm), sizeMm: Math.max(panel.wMm, panel.hMm) }));
      const parts: Part[] = spec.panels.map((panel) => ({ name: `${panel.name}`, size: `${panel.wMm} × ${panel.hMm}`, needs: [panel.view], missing: '' }));
      return { result: { spec, layers, sheets, parts }, summary: `Stitched ${spec.wMm} × ${spec.dMm} × ${spec.hMm} mm · ${spec.panels.length} panels · ${spec.joins.length} joins${spec.warnings.length ? ` · ${spec.warnings.length} guesses` : ''}`, source: live ? 'live' as const : 'fixture' as const, costUsd: live ? 0.015 : 0 };
    });
  }
  /**
   * One layer, corrected from the chat ("keep the whiskers", "bolder", "take the wall out of this layer").
   * The words become a layer op (domain/layering parseLayerOp — Spark's tool schema once layers.refine is wired)
   * and code re-measures that layer's mask from the photo. Unknown asks are kept as notes.
   */
  refineLayer(craftId: string, opts: { imageDataUrl?: string; subjectPaths: [number, number][][]; colours: string[]; index: number; current: [number, number][][]; front: [number, number][][]; text: string; name: string; op?: import('../domain/layering').LayerOp }) {
    return this.run('layers.refine', craftId, async () => {
      const op = opts.op ?? parseLayerOp(opts.text);
      const px = op && opts.subjectPaths.length ? await this.pixels(opts.imageDataUrl, 800) : null;
      if (!op || !px) { await tick(); return { result: null, summary: `Noted “${opts.text}” for ${opts.name} — saved with the craft`, source: 'fixture' as const }; }
      const r = await measureRefine(px, opts.subjectPaths, { colours: opts.colours, index: opts.index, current: opts.current, front: opts.front, op });
      return { result: r, summary: `${opts.name}: ${r.describe} (code, from your photo)`, source: 'live' as const, costUsd: 0, model: 'Code' as const };
    });
  }
  /** Spark reads free text about one layer as one edit the code can apply (fill, detail, bolder, merge…) */
  interpretLayer(craftId: string, body: { text: string; layer: string; layers: string[] }) {
    return this.run('layers.refine', craftId, async () => {
      const j = await post('/api/layer-op', body);
      const answer = (j?.answer ?? { op: 'none', colour: '', other: '', reply: '' }) as { op: string; colour: string; other: string; reply: string };
      return { result: answer, summary: answer.op === 'none' ? `Read “${body.text}” as a note` : `Read “${body.text}” as ${answer.op.replace('-', ' ')}`, source: j?.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
    });
  }
  /** Spark turns a chat note into edit operations (merge, split, raise, recolour) on the layer it names. */
  applyRefinement(craftId: string, note: { step: string; layer?: string; text: string }) {
    return this.run('layers.refine', craftId, async () => { await tick(); return { result: { applied: false, ops: [] as string[] }, summary: `Noted “${note.text}”${note.layer ? ` for ${note.layer}` : ''} — saved with the craft`, source: 'fixture' as const }; });
  }
  // ── Sheets
  /** Sheets: SAM mask paths (0-1000 image coords from /api/segment) scaled to mm and traced to closed SVG per kept region. */
  vectorise(craftId: string, sheets: number, opts: { regions?: Region[]; sizeMm?: number; /** photo width / height */ aspect?: number; layers?: Layer[]; /** per-layer sheet paths (how it is built decides them) */ sheetPoints?: (n: number) => [number, number][][]; /** separate items: each laid out on its own sheet, already in mm */ pieceMm?: (n: number) => [number, number][][]; op?: (n: number) => 'cut' | 'engrave'; order?: number[] } = {}) {
    return this.run('sheets.vectorise', craftId, async () => {
      const sizeMm = opts.sizeMm ?? 300;
      const mmPerUnit = sizeMm / 1000;
      const byRegion: Record<string, Region> = Object.fromEntries((opts.regions ?? []).map((r) => [String(r.id), r]));
      const sources = opts.layers?.length
        ? opts.layers.map((l) => { const r = (l.regionId ? byRegion[String(l.regionId)] : undefined) ?? (opts.regions ?? [])[l.n - 1]; return { name: l.name, region: r, n: l.n }; })
        : (opts.regions ?? []).filter((r) => r.keep).map((r, i) => ({ name: r.name, region: r, n: i + 1 }));
      const order = opts.order ?? sources.map((x) => x.n);
      const data = [...sources].sort((a, b) => order.indexOf(a.n) - order.indexOf(b.n)).filter((s) => s.region).map(({ name, region: r, n }) => {
        const own = opts.sheetPoints?.(n);
        const paths = own?.length ? own : r!.cutPaths?.length ? r!.cutPaths : r!.paths?.length ? r!.paths : r!.box ? [[[r!.box.x1, r!.box.y1], [r!.box.x2, r!.box.y1], [r!.box.x2, r!.box.y2], [r!.box.x1, r!.box.y2]] as [number, number][]] : [];
        // y is 0-1000 of the photo's height: squeeze it to the photo's shape before scaling to mm
        const ky = 1 / (opts.aspect ?? 1);
        const laid = opts.pieceMm?.(n);
        const mm = laid?.length ? laid.map((points) => ({ points, area: 0, closed: true as const }))
          : scalePaths(paths.map((points) => ({ points: points.map(([x, y]) => [x, y * ky] as [number, number]), area: 0, closed: true as const })), mmPerUnit);
        const pts = mm.flatMap((p) => p.points), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const bbox = pts.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10, h: Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10 } : undefined;
        return { name, svg: pathsToSvg(mm), pathCount: mm.length, cutLengthMm: cutLength(mm), sizeMm, layer: n, op: opts.op?.(n) ?? 'cut' as const, ...(bbox ? { bbox } : {}) };
      }).filter((s) => s.pathCount > 0);
      const pathCount = data.reduce((a, s) => a + s.pathCount, 0);
      if (pathCount) return { result: { sheets, pathCount, sheetsData: data }, summary: `${data.length} sheets traced · ${pathCount} closed paths · ${data.reduce((a, s) => a + s.cutLengthMm, 0).toFixed(0)} mm of cut`, source: 'live' as const, costUsd: 0 };
      await tick(); return { result: { sheets, pathCount: 0, sheetsData: data }, summary: `${sheets} sheets traced and nested`, source: 'fixture' as const };
    });
  }
  // ── Assemble
  /** Placeholder: returns the code-derived steps it is given; the live job has Spark rewrite them from the ObjectSpec. */
  writeInstructions(craftId: string, draft: AssemblyStep[]) {
    return this.run('assemble.instructions', craftId, async () => { await tick(); return { result: draft, summary: `${draft.length} assembly steps` }; });
  }
  renderFinished(craftId: string, imageDataUrl?: string) {
    return this.run('assemble.render', craftId, async () => {
      const j = sendable(imageDataUrl) ? await post('/api/preview', { imageDataUrl }) : null;
      if (j?.image) return { result: { image: j.image as string }, summary: 'Photo of the finished piece', source: 'live' as const, costUsd: traceCost(j) };
      await tick(); return { result: { image: '' }, summary: 'Photo of the finished piece', source: 'fixture' as const };
    });
  }
}
