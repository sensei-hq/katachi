import { agentJobs, type AgentJobId } from '../content/agents';
import { copy, regions, layerSets, type Kind, type MakeAs } from '../content/layers';
import { fixtureParts, type Check, type Outline, type Part, type Region } from './layer-flow.svelte';
import type { AssemblyStep } from '../domain/assembly';
import { startFor, type Start } from '../content/journey';
import type { ImageBrief } from '../domain/schemas';
import type { Layer } from '../content/layers';

type Live<T> = { result: T; summary: string; source?: 'live' | 'fixture'; costUsd?: number };
async function post(route: string, body: unknown): Promise<any | null> {
  try {
    const r = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r || typeof r.json !== 'function') return null;
    const j = await r.json().catch(() => null);
    return (r as { ok?: boolean }).ok === false ? null : j;
  } catch { return null; }
}
const sendable = (u?: string) => Boolean(u && (u.startsWith('data:image/') || u.startsWith('http')));
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
export interface AgentTask { key: string; job: AgentJobId; craftId: string; status: 'running' | 'done' | 'placeholder' | 'failed'; summary: string; costUsd?: number; ms?: number }

const tick = () => new Promise<void>((r) => queueMicrotask(r));

/**
 * The only place the craft journey talks to Meta models and agents (presentation never does).
 * Each job runs through `run`, which records a task the screens render. Today every craft job is a
 * placeholder: it returns a fixture in the shape the live call will return, and is marked as such.
 * Wiring one means replacing its body with a fetch to the route in content/agents.ts.
 */
export class MuseAgents {
  tasks = $state<AgentTask[]>([]);
  /** told about every finished job (AppState posts it in the chat with its model, action and cost) */
  onFinish: ((t: AgentTask) => void) | null = null;

  private async run<T>(job: AgentJobId, craftId: string, work: () => Promise<Live<T>>): Promise<T> {
    const key = `${craftId}:${job}:${this.tasks.length}`;
    this.tasks = [...this.tasks, { key, job, craftId, status: 'running', summary: agentJobs[job].label }];
    const set = (patch: Partial<AgentTask>) => { this.tasks = this.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)); };
    const started = Date.now();
    const finish = (patch: Partial<AgentTask>) => { set({ ...patch, ms: Date.now() - started }); const t = this.tasks.find((x) => x.key === key); if (t) this.onFinish?.(t); };
    try {
      const { result, summary, source, costUsd } = await work();
      const live = source ? source === 'live' : agentJobs[job].status === 'live';
      finish({ status: live ? 'done' : 'placeholder', summary, costUsd: live ? (costUsd ?? agentJobs[job].estUsd) : agentJobs[job].estUsd });
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
  cutout(craftId: string, opts: { imageDataUrl?: string; subjectPrompt?: string } = {}) {
    const fallbackOutline: Outline = { shape: 'circle', sizeMm: 300 };
    const fallbackChecks = copy.cutout.checks.map((c) => ({ ...c })) as Check[];
    return this.run('shape.cutout', craftId, async () => {
      const j = sendable(opts.imageDataUrl) ? await post('/api/segment', { imageDataUrl: opts.imageDataUrl, prompt: opts.subjectPrompt ?? 'main subject' }) : null;
      const box = j?.boxes?.[0];
      if (box) {
        const w = Math.max(1, box.x2 - box.x1), h = Math.max(1, box.y2 - box.y1);
        const shape: Outline['shape'] = Math.abs(w - h) / Math.max(w, h) < 0.25 ? 'circle' : 'rect';
        const outline: Outline = { shape, sizeMm: 300 };
        const checks: Check[] = [{ status: 'pass', text: `Outline found · SAM 3.1 (${j.source ?? 'fixture'})` }, { status: 'pass', text: `Shape · ${shape}` }];
        const paths = ((j?.masks ?? []) as { paths?: [number, number][][] }[]).flatMap((m) => m.paths ?? []) as [number, number][][];
        const items = (j?.masks ?? []).length;
        return { result: { outline, checks, paths }, summary: items > 1 ? `Background removed · ${items} separate items traced` : `Background removed · ${shape} outline, Ø 300 mm`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      }
      await tick(); return { result: { outline: fallbackOutline, checks: fallbackChecks, paths: [] as [number, number][][] }, summary: `Background removed · ${fallbackOutline.shape} outline, Ø ${fallbackOutline.sizeMm} mm`, source: 'fixture' as const };
    });
  }
  segment(craftId: string, opts: { imageDataUrl?: string; briefRegions?: ImageBrief['regions']; brief?: ImageBrief | null } = {}) {
    const fallback: Region[] = regions.map((r) => ({ ...r }));
    return this.run('shape.segment', craftId, async () => {
      const j = sendable(opts.imageDataUrl) && opts.briefRegions?.length ? await post('/api/segment', { imageDataUrl: opts.imageDataUrl, regions: opts.briefRegions, ...(opts.brief?.arrangement === 'multiple-items' ? { multiple: true, subjectPrompt: opts.brief.subjectPrompt } : {}) }) : null;
      const live = (j?.regions ?? []) as { id: string; label: string; note?: string; areaPct?: number; keep?: boolean; ones?: number; paths?: [number, number][][]; box?: { x1: number; y1: number; x2: number; y2: number } }[];
      if (live.length) {
        const tones = ['warn', 'accent', 'ok', 'ink', 'muted'] as const;
        let found = live.map((r, i) => ({ id: r.id as Region['id'], name: r.label, pct: Math.round((r.areaPct ?? 0) * 10) / 10, note: r.note ?? '', tone: tones[i % tones.length], keep: r.keep ?? true, ...(r.ones ? { ones: r.ones } : {}), ...(r.paths?.length ? { paths: r.paths } : {}), ...(r.box ? { box: r.box } : {}) })) as Region[];
        found = await withPhotoColours(opts.imageDataUrl, found);
        return { result: found, summary: opts.brief?.arrangement === 'multiple-items' ? `${found.length} separate items found` : `${found.length} regions found`, source: j.source === 'live' ? 'live' as const : 'fixture' as const, costUsd: traceCost(j) };
      }
      await tick(); return { result: fallback, summary: `${fallback.length} regions found`, source: 'fixture' as const };
    });
  }
  // ── Layers
  planLayers(craftId: string, makeAs: MakeAs, opts: { imageDataUrl?: string; description?: string; regions?: Region[]; brief?: ImageBrief | null } = {}) {
    const set = layerSets[makeAs === 'wood' ? 'wood' : 'paper'];
    const fallback: Layer[] = [];
    return this.run('layers.plan', craftId, async () => {
      const kept = (opts.regions ?? []).filter((r) => (r as { on?: boolean }).on ?? r.keep);
      const material = makeAs === 'wood' ? '3 mm birch plywood' : makeAs === 'acrylic' ? '3 mm acrylic' : makeAs === 'paper' ? 'Cardstock' : opts.brief?.likelyMaterial === 'wood' ? '3 mm birch plywood' : opts.brief?.likelyMaterial === 'acrylic' ? '3 mm acrylic' : set.layers[0].material;
      // Several separate finished objects (bookmarks, earrings…): each item is its own cut, never a stack.
      if (opts.brief?.arrangement === 'multiple-items' && kept.length) {
        const total = kept.reduce((a, r) => a + Math.max(1, r.pct), 0) || 1;
        const layers: Layer[] = kept.map((r, i) => ({ n: i + 1, name: r.name, shapes: ['sky'], colour: r.colour ?? set.layers[i % set.layers.length].colour, visiblePct: Math.round((Math.max(1, r.pct) / total) * 1000) / 10, hiddenPct: 0, material, regionId: r.id }));
        return { result: layers, summary: `${layers.length} separate items · one cut each`, source: 'live' as const, costUsd: 0 };
      }
      const j = sendable(opts.imageDataUrl) ? await post('/api/convert', { imageDataUrl: opts.imageDataUrl, description: opts.description ?? 'layered craft from this photo', group: makeAs === 'wood' ? 'laser-cut' : 'cricut-paper' }) : null;
      const pieces = (j?.pieces ?? []) as { name: string; kind: string; note: string }[];
      const layerPieces = pieces.filter((x) => x.kind === 'layer' || j?.conversionClass === 'layered');
      if (layerPieces.length >= 2) {
        const shapes = ['sky', 'sun', 'far', 'ridge', 'hills', 'pines'] as const;
        const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
        const layers: Layer[] = layerPieces.map((piece, i) => {
          const name = piece.name.replace(/^Layer \d+ \((back|mid|front)\)\s*/i, '') || piece.name;
          const pt = tokens(name + ' ' + (piece.note ?? ''));
          const region = kept.map((r) => ({ r, score: tokens(r.name + ' ' + r.note).filter((w) => pt.includes(w)).length })).sort((a, b) => b.score - a.score)[0];
          const matched = region && region.score > 0 ? region.r : kept[i];
          const base = set.layers[i % set.layers.length];
          return { n: i + 1, name, shapes: [shapes[i % shapes.length]], colour: matched?.colour ?? base.colour, visiblePct: matched ? Math.round(matched.pct * 10) / 10 : Math.max(2, Math.round((100 / layerPieces.length) * 10) / 10), hiddenPct: i === layerPieces.length - 1 ? 0 : 40, material: base.material, ...(matched ? { regionId: matched.id } : {}) };
        });
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
  /** Spark turns a chat note into edit operations (merge, split, raise, recolour) on the layer it names. */
  applyRefinement(craftId: string, note: { step: string; layer?: string; text: string }) {
    return this.run('layers.refine', craftId, async () => { await tick(); return { result: { applied: false, ops: [] as string[] }, summary: `Noted “${note.text}”${note.layer ? ` for ${note.layer}` : ''} — saved with the craft` }; });
  }
  // ── Sheets
  /** Sheets: SAM mask paths (0-1000 image coords from /api/segment) scaled to mm and traced to closed SVG per kept region. */
  vectorise(craftId: string, sheets: number, opts: { regions?: Region[]; sizeMm?: number; layers?: Layer[] } = {}) {
    return this.run('sheets.vectorise', craftId, async () => {
      const { scalePaths, pathsToSvg, cutLength } = await import('../domain/vector');
      const sizeMm = opts.sizeMm ?? 300;
      const mmPerUnit = sizeMm / 1000;
      const byRegion: Record<string, Region> = Object.fromEntries((opts.regions ?? []).map((r) => [String(r.id), r]));
      const sources = opts.layers?.length
        ? opts.layers.map((l) => { const r = (l.regionId ? byRegion[String(l.regionId)] : undefined) ?? (opts.regions ?? [])[l.n - 1]; return { name: l.name, region: r }; })
        : (opts.regions ?? []).filter((r) => r.keep).map((r) => ({ name: r.name, region: r }));
      const data = sources.filter((s) => s.region).map(({ name, region: r }) => {
        const paths = r!.paths?.length ? r!.paths : r!.box ? [[[r!.box.x1, r!.box.y1], [r!.box.x2, r!.box.y1], [r!.box.x2, r!.box.y2], [r!.box.x1, r!.box.y2]] as [number, number][]] : [];
        const traced = paths.map((points) => ({ points, area: 0, closed: true as const }));
        const mm = scalePaths(traced, mmPerUnit);
        return { name, svg: pathsToSvg(mm), pathCount: mm.length, cutLengthMm: cutLength(mm), sizeMm };
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
