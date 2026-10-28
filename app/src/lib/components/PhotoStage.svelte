<script lang="ts">
// The captured photo with SAM mask overlays (state-supplied SVG paths in 0-1000 image coordinates).
// Presentation only: the photo is drawn inside the same SVG as the paths, so masks stay registered
// with the image at any crop. Without overlays it is just the photo.
import type { Tone } from '$lib/content/layers';
export interface StageOverlay { d: string; tone: Tone; opacity?: number; hatch?: boolean; outlineOnly?: boolean }
let { image, label, overlays = [], dim = false, clipped = false, stacked = false }: { image: string; label: string; overlays?: StageOverlay[]; dim?: boolean; clipped?: boolean; stacked?: boolean } = $props();
const toneClass: Record<Tone, string> = { muted: 'text-ink-soft', warn: 'text-warning', accent: 'text-accent', ok: 'text-success', ink: 'text-ink' };
const uid = `ps${Math.random().toString(36).slice(2, 8)}`;
</script>
<svg viewBox="0 0 1000 1000" class="w-full h-full block" role="img" aria-label={label} data-photo-stage>
  <defs>
    <pattern id="{uid}-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="18" stroke="currentColor" stroke-width="5" />
    </pattern>
  </defs>
  {#if clipped && overlays.length}
    <defs><clipPath id="{uid}-clip">{#each overlays as o, i (i)}<path d={o.d} />{/each}</clipPath>
    <pattern id="{uid}-checker" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" class="text-paper-mute" fill="currentColor" /><path d="M0 0h24v24H0zM24 24h24v24H24z" class="text-ink-soft" fill="currentColor" opacity="0.35" /></pattern></defs>
    <rect width="1000" height="1000" fill="url(#{uid}-checker)" />
    <image href={image} x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid slice" clip-path="url(#{uid}-clip)" />
    {#each overlays as o, i (i)}<g class={toneClass[o.tone]}><path d={o.d} fill="none" stroke="currentColor" stroke-width="3" /></g>{/each}
  {:else}
  <image href={image} x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid slice" opacity={dim || stacked ? 0.3 : 1} />
  {#each overlays as o, i (i)}
    <g class={toneClass[o.tone]} transform={stacked ? `translate(${i * 18} ${-i * 18})` : undefined}>
      {#if o.hatch}<path d={o.d} fill="url(#{uid}-hatch)" fill-opacity="0.5" stroke="currentColor" stroke-width="3" />
      {:else if o.outlineOnly}<path d={o.d} fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-width="3" />
      {:else}<path d={o.d} fill="currentColor" fill-opacity={o.opacity ?? 0.45} stroke="currentColor" stroke-width="3" />{/if}
    </g>
  {/each}
  {/if}
</svg>
