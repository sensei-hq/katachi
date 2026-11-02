<script lang="ts">
// The captured photo with mask overlays (state-supplied SVG paths in 0-1000 image coordinates).
// Presentation only: the photo is drawn inside the same SVG as the paths, so masks stay registered
// with the image at any crop. Without overlays it is just the photo.
// Outlines are hairlines: a layer in focus shows the photo's own pixels inside its mask (the rest dimmed), so
// the picture's sharp lines are never painted over by thick strokes or flat fills.
import type { Snippet } from 'svelte';
import type { Tone } from '$lib/content/layers';
export interface StageOverlay { d: string; tone: Tone; opacity?: number; hatch?: boolean; outlineOnly?: boolean; /** the layer's own colour (from the photo) instead of the tone */ colour?: string; /** show the photo itself inside this mask, the rest dimmed */ focus?: boolean; /** the whole sheet the layer is cut from (its enclosing shape) */ sheet?: string }
let { image, label, overlays = [], dim = false, clipped = false, stacked = false, spotlight = false, subject = '', subjectOpacity = 0.3, only = false, extra, onpointer }: {
  image: string; label: string; overlays?: StageOverlay[]; dim?: boolean; clipped?: boolean; stacked?: boolean;
  /** the background-removed outline: outside it the photo is gone (checkerboard), not just dimmed. Several shapes
   *  (separate items) are a union: each its own path, so overlapping items don't cancel out */ subject?: string | string[];
  /** how strongly the photo shows inside the subject, around the layer in focus */ subjectOpacity?: number;
  /** only the layer in focus is drawn (the rest of the photo is hidden) */ only?: boolean;
  /** every overlay in focus (small previews) */ spotlight?: boolean;
  /** drawn over the photo in 0-1000 × 0-1000 image coordinates (tool previews) */ extra?: Snippet;
  /** pointer on the photo, in the same 0-1000 image coordinates as the paths */ onpointer?: (kind: 'down' | 'move' | 'up', x: number, y: number, e: PointerEvent) => void;
} = $props();
const toneClass: Record<Tone, string> = { muted: 'text-ink-soft', warn: 'text-warning', accent: 'text-accent', ok: 'text-success', ink: 'text-ink' };
const uid = `ps${Math.random().toString(36).slice(2, 8)}`;
// Paths are in 0-1000 image coordinates on both axes; the photo keeps its own shape, so the drawing is
// 1000 × 1000/aspect and the paths are squeezed to match (no crop, masks stay registered on any photo).
let aspect = $state(1);
$effect(() => { const im = new Image(); im.onload = () => { if (im.naturalWidth && im.naturalHeight) aspect = im.naturalWidth / im.naturalHeight; }; im.src = image; });
const H = $derived(Math.round(1000 / aspect));
const fit = $derived(`scale(1 ${H / 1000})`);
const focused = $derived(overlays.filter((o) => spotlight || o.focus));
const subjects = $derived((Array.isArray(subject) ? subject : [subject]).filter(Boolean));
const line = (o: StageOverlay) => o.colour ?? 'currentColor';
let svg = $state<SVGSVGElement | null>(null);
function point(kind: 'down' | 'move' | 'up', e: PointerEvent) {
  if (!onpointer || !svg) return;
  const m = svg.getScreenCTM(); if (!m) return;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  if (kind === 'down') (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  onpointer(kind, Math.round(p.x * 10) / 10, Math.round(((p.y * 1000) / H) * 10) / 10, e);
}
</script>
<svg bind:this={svg} viewBox="0 0 1000 {H}" class="w-full h-full block {onpointer ? 'touch-none' : ''}" role="img" aria-label={label} data-photo-stage
  onpointerdown={onpointer ? (e) => point('down', e) : undefined} onpointermove={onpointer ? (e) => point('move', e) : undefined} onpointerup={onpointer ? (e) => point('up', e) : undefined}>
  <defs>
    <pattern id="{uid}-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="18" stroke="currentColor" stroke-width="2" />
    </pattern>
  </defs>
  {#if clipped && overlays.length}
    <defs><clipPath id="{uid}-clip">{#each overlays as o, i (i)}<path d={o.d} transform={fit} clip-rule="evenodd" />{/each}</clipPath>
    <pattern id="{uid}-checker" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" class="text-paper-mute" fill="currentColor" /><path d="M0 0h24v24H0zM24 24h24v24H24z" class="text-ink-soft" fill="currentColor" opacity="0.35" /></pattern></defs>
    <rect width="1000" height={H} fill="url(#{uid}-checker)" />
    <image href={image} x="0" y="0" width="1000" height={H} preserveAspectRatio="none" clip-path="url(#{uid}-clip)" />
    {#each overlays as o, i (i)}<g class={toneClass[o.tone]} transform={fit}><path d={o.d} fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></g>{/each}
  {:else if focused.length && !stacked}
    <!-- the layer in focus: the photo's own pixels inside its mask, everything else dimmed, hairline outlines -->
    <defs><clipPath id="{uid}-focus">{#each focused as o, i (i)}<path d={o.d} transform={fit} clip-rule="evenodd" />{/each}</clipPath>
      {#if subjects.length}<clipPath id="{uid}-subject">{#each subjects as d, i (i)}<path {d} transform={fit} clip-rule="evenodd" />{/each}</clipPath>{/if}
      <pattern id="{uid}-checker" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" class="text-paper-mute" fill="currentColor" /><path d="M0 0h24v24H0zM24 24h24v24H24z" class="text-ink-soft" fill="currentColor" opacity="0.35" /></pattern></defs>
    {#if subjects.length || only}<rect width="1000" height={H} fill="url(#{uid}-checker)" data-background-removed />{/if}
    {#if !only}<image href={image} x="0" y="0" width="1000" height={H} preserveAspectRatio="none" opacity={spotlight ? 0.08 : subjects.length ? subjectOpacity : 0.14} clip-path={subjects.length ? `url(#${uid}-subject)` : undefined} />{/if}
    <!-- the layer's whole sheet in its own colour: what gets cut, including what hides under the layers in front -->
    {#each only ? focused.filter((o) => o.sheet) : [] as o, i (i)}<path d={o.sheet} transform={fit} fill-rule="evenodd" fill={o.colour ?? 'currentColor'} fill-opacity="0.9" data-layer-sheet />{/each}
    <image href={image} x="0" y="0" width="1000" height={H} preserveAspectRatio="none" clip-path="url(#{uid}-focus)" />
    {#each spotlight || only ? [] : focused.filter((o) => o.sheet) as o, i (i)}<path d={o.sheet} transform={fit} fill="none" fill-rule="evenodd" class="text-accent" stroke="currentColor" stroke-width="1" stroke-dasharray="5 4" stroke-opacity="0.7" vector-effect="non-scaling-stroke" data-layer-sheet-outline />{/each}
    {#each spotlight ? [] : only ? overlays.filter((o) => o.focus) : overlays as o, i (i)}
      <!-- hairlines in theme ink (a black layer's own colour would vanish on a dark photo); the focus in accent -->
      <g class={o.focus || spotlight ? 'text-accent' : 'text-ink-mute'} transform={fit}>
        <path d={o.d} fill-rule="evenodd" fill="none" stroke="currentColor" stroke-width={o.focus || spotlight ? 1.25 : 0.75} stroke-opacity={o.focus || spotlight ? 0.95 : 0.45} stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </g>
    {/each}
  {:else}
  <image href={image} x="0" y="0" width="1000" height={H} preserveAspectRatio="none" opacity={dim || stacked ? 0.3 : 1} />
  {#each overlays as o, i (i)}
    <g class={toneClass[o.tone]} transform={`${stacked ? `translate(${i * 18} ${-i * 18}) ` : ''}${fit}`}>
      {#if o.hatch}<path d={o.d} fill-rule="evenodd" fill="url(#{uid}-hatch)" fill-opacity="0.5" stroke={line(o)} stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      {:else if o.outlineOnly}<path d={o.d} fill-rule="evenodd" fill={line(o)} fill-opacity="0.07" stroke={line(o)} stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      {:else}<path d={o.d} fill-rule="evenodd" fill={line(o)} fill-opacity={o.opacity ?? 0.35} stroke={line(o)} stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke" />{/if}
    </g>
  {/each}
  {/if}
  {#if extra}<g transform={fit}>{@render extra()}</g>{/if}
</svg>
