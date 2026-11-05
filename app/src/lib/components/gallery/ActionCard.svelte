<!-- One action in the gallery: what it does, what it does it to, and what to say. The before/after is the
  action really run on the demo craft (state-supplied SVG paths, layer colours from the demo). -->
<script lang="ts">
import type { ActionDef } from '$lib/domain/actions/types';
import type { ActionDemo } from '$lib/domain/actions/demo';
let { def, demo }: { def: ActionDef; demo: ActionDemo | undefined } = $props();
let copied = $state(false);
const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable: the words are still there to read */ }
  copied = true;
  setTimeout(() => { copied = false; }, 1500);
};
</script>
<article data-action-card={def.id} class="rounded-md border border-paper-edge bg-paper-soft p-3 flex flex-col gap-2 min-w-0">
  <div class="flex items-center gap-2 min-w-0">
    <span class="{def.icon} w-5 h-5 shrink-0 text-ink-soft" aria-hidden="true"></span>
    <h3 class="text-ui font-medium truncate">{def.label}</h3>
    <span class="meta text-ink-mute ml-auto shrink-0">{def.scope === 'item' ? 'items' : 'layers'}</span>
  </div>
  <p class="text-ink-mute text-ui leading-snug">{def.hint}</p>
  {#if !demo}
    <p class="meta text-ink-mute">Preparing the demo…</p>
  {:else if demo.note}
    <p class="meta text-ink-mute rounded-sm bg-paper-mute px-2 py-1.5">{demo.note}</p>
  {:else}
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5" aria-label="Before and after">
      <svg viewBox={demo.viewBox} class="w-full h-24 rounded-sm bg-paper-mute" role="img" aria-label="Before">
        {#each demo.before as s, i (i)}<path d={s.d} fill={s.colour} fill-opacity="0.25" stroke={s.colour} stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />{/each}
      </svg>
      <span class="i-solar:arrow-right-linear w-4 h-4 text-ink-soft" aria-hidden="true"></span>
      <svg viewBox={demo.viewBox} class="w-full h-24 rounded-sm bg-paper-mute" role="img" aria-label="After">
        {#each demo.after as s, i (i)}<path d={s.d} fill={s.colour} fill-opacity="0.25" stroke={s.colour} stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />{/each}
      </svg>
    </div>
    <p class="meta text-ink truncate" title={demo.summary}>{demo.summary}</p>
    {#if demo.badges.length}
      <p class="flex flex-wrap gap-1">{#each demo.badges as b (b)}<span class="meta rounded-sm bg-paper-mute text-ink-soft px-1.5 py-0.5">{b}</span>{/each}</p>
    {/if}
  {/if}
  {#if def.ask[0]}
    <button type="button" class="mt-auto flex items-center gap-1.5 rounded-sm border border-paper-edge px-2 py-1.5 text-left text-ui text-ink-soft hover:text-ink w-full min-w-0" onclick={() => void copy(def.ask[0])} title="Copy to the chat">
      <span class="i-solar:chat-round-dots-linear w-4 h-4 shrink-0" aria-hidden="true"></span>
      <span class="truncate">Say “{def.ask[0]}”</span>
      <span class="meta ml-auto shrink-0">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  {/if}
</article>
