<script lang="ts">
// One sheet of the cut plan, as the machine sees it: engravings filled, scores dashed, cuts as lines, framed on
// the used area of the board (state-supplied paths in sheet mm).
let { passes, view, label }: { passes: { kind: string; d: string }[]; view: { x: number; y: number; w: number; h: number }; label: string } = $props();
const unit = $derived(Math.max(view.w, view.h));
const pad = $derived(unit * 0.06);
</script>
<svg viewBox="{view.x - pad} {view.y - pad} {view.w + 2 * pad} {view.h + 2 * pad}" class="w-full h-full block" role="img" aria-label={label} data-sheet-svg data-plan-sheet>
  {#each passes as p, i (i)}
    {#if p.kind === 'engrave'}<path d={p.d} fill-rule="evenodd" class="text-ink-mute" fill="currentColor" fill-opacity="0.55" stroke="none" data-engrave />
    {:else if p.kind === 'score'}<path d={p.d} fill="none" class="text-ink-soft" stroke="currentColor" stroke-dasharray={unit / 80} stroke-width={Math.max(0.3, unit / 260)} />
    {:else}<path d={p.d} fill-rule="evenodd" class="text-accent" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width={Math.max(0.3, unit / 220)} />{/if}
  {/each}
</svg>
