<script lang="ts">
// One traced sheet: the closed mm paths (state-supplied, from domain/vector) drawn to cut scale proportions.
let { svg, sizeMm = 300, label, op = 'cut', bbox }: { svg: string; sizeMm?: number; label: string; /** engraved passes are filled, cuts are lines */ op?: 'cut' | 'engrave'; /** the piece's bounds (mm): the view frames the piece and its size is shown */ bbox?: { x: number; y: number; w: number; h: number } } = $props();
const pad = $derived(bbox ? Math.max(bbox.w, bbox.h) * 0.08 : 0);
const view = $derived(bbox ? `${bbox.x - pad} ${bbox.y - pad} ${bbox.w + 2 * pad} ${bbox.h + 2 * pad}` : `0 0 ${sizeMm} ${sizeMm}`);
const unit = $derived(bbox ? Math.max(bbox.w, bbox.h) : sizeMm);
</script>
<svg viewBox={view} class="w-full h-full block" role="img" aria-label={label} data-sheet-svg>
  {#if op === 'engrave'}<path d={svg} fill-rule="evenodd" class="text-ink-mute" fill="currentColor" fill-opacity="0.55" stroke="none" data-engrave />
  {:else}<path d={svg} fill-rule="evenodd" class="text-accent" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width={Math.max(0.3, unit / 220)} />{/if}
  {#if bbox}<text x={bbox.x + bbox.w / 2} y={bbox.y + bbox.h + pad * 0.8} text-anchor="middle" font-size={unit / 16} class="text-ink-soft" fill="currentColor" font-family="var(--font-mono, monospace)">{Math.round(bbox.w)} × {Math.round(bbox.h)} mm</text>{/if}
</svg>
