<script lang="ts">
import PhotoStage from '../PhotoStage.svelte';
import LayerSwatch from '../illustrations/LayerSwatch.svelte';
import type { Quote } from '$lib/state/conversation.svelte';
// A quoted layer (with a small preview of its mask on the photo) or an earlier message, above the composer
// while you type and inside your message in the timeline once sent.
let { quote, onRemove }: { quote: Quote; onRemove?: () => void } = $props();
</script>
<div data-quote-card class="flex items-center gap-2 rounded-md border border-paper-edge border-l-3 border-l-accent bg-paper-soft pl-2 pr-1 py-1.5 text-ui min-w-0">
  {#if quote.kind === 'layer'}
    <span class="w-9 h-9 shrink-0 rounded-sm overflow-hidden bg-paper-mute" aria-hidden="true">
      {#if quote.image && quote.d}<PhotoStage image={quote.image} label="" overlays={[{ d: quote.d, tone: 'ink', colour: quote.colour, opacity: 0.9 }]} spotlight />{:else if quote.colour}<span class="grid place-items-center h-full"><LayerSwatch colour={quote.colour} /></span>{/if}
    </span>
  {:else}<span class="i-solar:chat-square-like-linear w-4 h-4 shrink-0 text-ink-soft" aria-hidden="true"></span>{/if}
  <span class="flex-1 min-w-0"><span class="block meta text-ink truncate">{quote.label}</span>{#if quote.text}<span class="block text-ink-mute line-clamp-2">{quote.text}</span>{/if}</span>
  {#if onRemove}<button type="button" class="shrink-0 grid place-items-center w-7 h-7 rounded-sm text-ink-soft hover:text-ink" aria-label="Remove the quote" onclick={onRemove}><span class="i-solar:close-circle-linear w-4 h-4" aria-hidden="true"></span></button>{/if}
</div>
