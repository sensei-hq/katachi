<script lang="ts">
import type { Snippet } from 'svelte';
import { Button, ChatShell } from '@rokkit/ui';
import { oneThought, type ChatAction, type Quote, type TimelineMsg } from '$lib/state/conversation.svelte';
import TimelineEntry from '../chat/TimelineEntry.svelte';
import QuoteCard from '../chat/QuoteCard.svelte';
// The Katachi assistant on Rokkit ChatShell: a timeline of what you said and what Katachi thought, did and found
// (each step with its model calls), the step's suggestions inline after the last entry, and a quote card above
// the composer when a layer or a message is quoted. Everything you do on a craft step is said here.
let { messages, info = null, suggestions: suggestionList = [], quote = null, onAsk, onAction, onQuote, onQuoteLayer, onClearQuote, voice = 'idle', onMicDown, onMicUp }: {
  messages: TimelineMsg[]; info?: { title: string; body: Snippet } | null; suggestions?: (string | ChatAction)[]; quote?: Quote | null;
  onAsk: (text: string) => void; onAction: (a: ChatAction) => void; onQuote?: (text: string) => void; onQuoteLayer?: (n: number) => void; onClearQuote?: () => void;
  /** push-to-talk: listening while the mic is held, transcribing after */ voice?: 'idle' | 'listening' | 'transcribing';
  onMicDown?: () => void; onMicUp?: () => void;
} = $props();
const micUp = () => { if (voice === 'listening') onMicUp?.(); };
let value = $state('');
const send = (text: string) => { const t = text.trim(); if (!t) return; onAsk(t); value = ''; };
// one thought at a time while Katachi works; what it found stays
const shown = $derived(oneThought(messages));
const lastId = $derived(shown.at(-1)?.id);
</script>
{#if info}<section aria-label={info.title} class="shrink-0 max-h-[60%] overflow-auto px-4 py-3 hair-b">{@render info.body()}</section>{/if}
<div role="log" aria-label="Katachi conversation" class="flex-1 min-h-0 flex flex-col [&>[data-chat-shell]]:flex-1 [&_[data-chat-timeline]]:flex [&_[data-chat-timeline]]:flex-col [&_[data-chat-timeline]]:gap-3.5">
  <ChatShell messages={shown as never} bind:value placeholder={voice === 'listening' ? 'Listening… let go to send' : voice === 'transcribing' ? 'Transcribing with Muse Voice…' : quote ? 'What should change?' : 'Ask Katachi…'} onsubmit={send}>
    {#snippet message(m)}
      <div>
        <TimelineEntry m={m as TimelineMsg} {onAction} {onQuote} {onQuoteLayer} />
        {#if m.id === lastId && suggestionList.length}
          <div role="group" aria-label="Suggestions" class="flex flex-wrap gap-1.5 pl-9 mt-2.5">
            {#each suggestionList as s (typeof s === 'string' ? s : s.label)}
              {#if typeof s === 'string'}<Button size="sm" style="outline" label={s} onclick={() => send(s)} />
              {:else}<Button size="sm" variant="primary" iconRight="i-solar:arrow-right-linear" label={s.label} onclick={() => onAction(s)} />{/if}
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}
    {#snippet suggestions()}
      {#if quote}<QuoteCard {quote} onRemove={onClearQuote} />{/if}
    {/snippet}
    {#snippet toolbar()}
      <span class="flex justify-end gap-1">
        {#if onMicDown}<Button style={voice === 'idle' ? 'ghost' : undefined} variant={voice === 'listening' ? 'primary' : undefined} size="sm" icon={voice === 'transcribing' ? 'i-solar:hourglass-linear' : voice === 'listening' ? 'i-solar:microphone-3-bold' : 'i-solar:microphone-3-linear'}
          aria-label={voice === 'listening' ? 'Listening: let go to send' : voice === 'transcribing' ? 'Transcribing' : 'Hold to talk'} aria-pressed={voice === 'listening'} disabled={voice === 'transcribing'} data-voice={voice}
          onpointerdown={(e: PointerEvent) => { e.preventDefault(); onMicDown?.(); }} onpointerup={micUp} onpointerleave={micUp} onpointercancel={micUp}
          onkeydown={(e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && voice === 'idle') { e.preventDefault(); onMicDown?.(); } }} onkeyup={(e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') micUp(); }} />{/if}
        <Button variant="primary" size="sm" icon="i-solar:arrow-up-linear" aria-label="Send" disabled={!value.trim()} onclick={() => send(value)} />
      </span>
    {/snippet}
  </ChatShell>
</div>
