<script lang="ts">
import { Button } from '@rokkit/ui';
import type { Snippet } from 'svelte';
import type { ChatAction, Quote, TimelineMsg } from '$lib/state/conversation.svelte';
import KatachiChat from './KatachiChat.svelte';
// Studio (≥ md) right column: "Katachi · Muse on", then the assistant (page context above the chat).
let { messages, info = null, suggestions = [], quote = null, onAsk, voice = 'idle', onMicDown, onMicUp, onClose, onAction, onQuote, onQuoteLayer, onClearQuote }: {
  messages: TimelineMsg[]; onAction: (a: ChatAction) => void;
  info?: { title: string; body: Snippet } | null; suggestions?: (string | ChatAction)[]; quote?: Quote | null;
  onQuote?: (text: string) => void; onQuoteLayer?: (n: number) => void; onClearQuote?: () => void;
  onAsk: (text: string) => void; voice?: 'idle' | 'listening' | 'transcribing'; onMicDown: () => void; onMicUp: () => void; onClose: () => void;
} = $props();
</script>
<aside aria-label="Katachi chat" class="w-[360px] shrink-0 flex flex-col min-h-0 bg-paper border-l border-paper-edge">
  <header class="h-11 shrink-0 flex items-center gap-2 pl-4 pr-2 hair-b">
    <span class="eyebrow flex-1">Katachi</span>
    <span class="meta">Muse · on</span>
    <Button style="ghost" size="sm" icon="i-solar:close-circle-linear" aria-label="Close chat" onclick={onClose} />
  </header>
  <KatachiChat {messages} {info} {suggestions} {quote} {onAsk} {onAction} {onQuote} {onQuoteLayer} {onClearQuote} {voice} {onMicDown} {onMicUp} />
</aside>
