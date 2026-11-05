<!-- A saved chain: its steps, its example ask, and Run on the open craft (delete for the user's own). -->
<script lang="ts">
import { Button } from '@rokkit/ui';
import type { GalleryState } from '$lib/state/gallery.svelte';
let { gallery, chain }: { gallery: GalleryState; chain: GalleryState['chainList'][number] } = $props();
let copied = $state(false);
const say = $derived(chain.ask?.[0] ?? chain.label);
const copy = async () => {
  try { await navigator.clipboard.writeText(say); } catch { /* still there to read */ }
  copied = true;
  setTimeout(() => { copied = false; }, 1500);
};
</script>
<article data-chain-card={chain.id} class="rounded-md border border-paper-edge bg-paper-soft p-3 flex flex-col gap-2 min-w-0">
  <div class="flex items-center gap-2 min-w-0">
    <span class="{chain.icon} w-5 h-5 shrink-0 text-ink-soft" aria-hidden="true"></span>
    <h3 class="text-ui font-medium truncate">{chain.label}</h3>
    {#if !chain.builtin}<span class="meta text-ink-mute shrink-0">yours</span>{/if}
  </div>
  <p class="meta text-ink-mute leading-snug">{chain.steps.join(' → ')}</p>
  <button type="button" class="flex items-center gap-1.5 rounded-sm border border-paper-edge px-2 py-1.5 text-left text-ui text-ink-soft hover:text-ink w-full min-w-0" onclick={copy} title="Copy to the chat">
    <span class="i-solar:chat-round-dots-linear w-4 h-4 shrink-0" aria-hidden="true"></span>
    <span class="truncate">Say “{say}”</span>
    <span class="meta ml-auto shrink-0">{copied ? 'Copied' : 'Copy'}</span>
  </button>
  <div class="mt-auto flex items-center gap-2">
    <Button size="sm" variant="primary" icon="i-solar:play-linear" label="Run" disabled={!gallery.canRun} title={gallery.canRun ? `Run ${chain.label} on the open craft` : 'Open a craft to run chains'} onclick={() => void gallery.runChain(chain.id)} />
    {#if !chain.builtin}
      <Button size="sm" style="ghost" icon="i-solar:trash-bin-trash-linear" aria-label={`Delete ${chain.label}`} onclick={() => gallery.deleteChain(chain.id)} />
    {/if}
    {#if gallery.lastRun?.id === chain.id}<span class="meta text-ink-mute truncate">{gallery.lastRun?.summary}</span>{/if}
  </div>
</article>
