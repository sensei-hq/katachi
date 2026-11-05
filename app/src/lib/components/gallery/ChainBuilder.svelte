<!-- The chain builder: a name and an ordered list of actions, saved as one undoable step. Steps run on
  every layer (or the layers named, when the chain is said with them). -->
<script lang="ts">
import { Button } from '@rokkit/ui';
import type { GalleryState } from '$lib/state/gallery.svelte';
let { gallery }: { gallery: GalleryState } = $props();
let name = $state('');
let steps = $state<string[]>([]);
let saved = $state('');
const labelOf = (id: string) => gallery.actionOptions.find((o) => o.id === id)?.label ?? id;
const add = (id: string) => { if (id) steps = [...steps, id]; };
const move = (i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= steps.length) return;
  const next = [...steps];
  [next[i], next[j]] = [next[j], next[i]];
  steps = next;
};
const save = () => {
  const d = gallery.saveChain(name, steps);
  if (d) { saved = d.label; name = ''; steps = []; setTimeout(() => { saved = ''; }, 3000); }
};
</script>
<section aria-label="Save a new chain" class="rounded-md border border-paper-edge bg-paper-soft p-3 flex flex-col gap-2">
  <h3 class="text-ui font-medium">Save a new chain</h3>
  <label class="meta text-ink-mute flex flex-col gap-1">Name
    <input data-chain-name class="rounded-sm border border-paper-edge bg-paper px-2 py-1.5 text-ui text-ink" type="text" maxlength="60" placeholder="Evening shine" bind:value={name} />
  </label>
  <label class="meta text-ink-mute flex flex-col gap-1">Add a step
    <select data-chain-add class="rounded-sm border border-paper-edge bg-paper px-2 py-1.5 text-ui text-ink" onchange={(e) => { add(e.currentTarget.value); e.currentTarget.value = ''; }}>
      <option value="">Choose an action…</option>
      {#each gallery.actionOptions as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
    </select>
  </label>
  {#if steps.length}
    <ol class="flex flex-col gap-1">
      {#each steps as id, i (i)}
        <li class="flex items-center gap-1 rounded-sm bg-paper-mute px-2 py-1">
          <span class="meta text-ink-mute w-4 shrink-0">{i + 1}</span>
          <span class="text-ui truncate flex-1">{labelOf(id)}</span>
          <button type="button" class="grid place-items-center w-6 h-6 text-ink-soft hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label="Move earlier" onclick={() => move(i, -1)}><span class="i-solar:arrow-up-linear w-4 h-4" aria-hidden="true"></span></button>
          <button type="button" class="grid place-items-center w-6 h-6 text-ink-soft hover:text-ink disabled:opacity-30" disabled={i === steps.length - 1} aria-label="Move later" onclick={() => move(i, 1)}><span class="i-solar:arrow-down-linear w-4 h-4" aria-hidden="true"></span></button>
          <button type="button" class="grid place-items-center w-6 h-6 text-ink-soft hover:text-ink" aria-label={`Remove ${labelOf(id)}`} onclick={() => { steps = steps.filter((_, k) => k !== i); }}><span class="i-solar:close-circle-linear w-4 h-4" aria-hidden="true"></span></button>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="flex items-center gap-2">
    <Button data-chain-save size="sm" variant="primary" label="Save chain" disabled={!name.trim() || !steps.length} onclick={save} />
    {#if saved}<span class="meta text-ink-mute">Saved “{saved}” — say its name in the chat.</span>{/if}
  </div>
</section>
