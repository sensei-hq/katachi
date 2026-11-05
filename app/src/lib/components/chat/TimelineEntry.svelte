<script lang="ts">
import { Button } from '@rokkit/ui';
import IconTimeline from './IconTimeline.svelte';
import ThinkingDots from './ThinkingDots.svelte';
import QuoteCard from './QuoteCard.svelte';
import LayerSwatch from '../illustrations/LayerSwatch.svelte';
import type { ChatAction, ModelCall, TimelineMsg } from '$lib/state/conversation.svelte';
// One row of the Katachi timeline: what you said (with what you quoted), what Katachi said, or a step Katachi is
// taking — thinking (dots), working (spinner), done (check) — with the model calls it made, their cost and time.
let { m, onAction, onQuote, onQuoteLayer }: { m: TimelineMsg; onAction: (a: ChatAction) => void; onQuote?: (text: string) => void; onQuoteLayer?: (n: number) => void } = $props();
const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
const step = $derived(m.data?.step);
const stepIcon = $derived(step?.status === 'done' ? 'i-solar:check-circle-linear' : step?.status === 'failed' ? 'i-solar:danger-triangle-linear' : 'i-solar:refresh-linear animate-spin');
const layerNo = (label: string) => Number(label.match(/^(\d+)\s·/)?.[1] ?? 0);
</script>
{#snippet calls(list: ModelCall[])}
  {#each list as call, i (i)}
    <span data-model-call class="flex items-center gap-1.5 meta">
      <span class="{call.status === 'failed' ? 'i-solar:danger-triangle-linear text-danger' : 'i-solar:cpu-bolt-linear text-accent'} w-3 h-3 shrink-0" aria-hidden="true"></span>
      <span class="text-ink-mute">{call.model}</span><span>· {call.status === 'placeholder' ? 'est. ' : ''}{usd(call.costUsd)} · {call.ms} ms{call.status === 'placeholder' ? ' · placeholder' : ''}</span>
    </span>
  {/each}
{/snippet}
{#snippet actionButtons(list: ChatAction[])}
  <div class="flex flex-wrap gap-1.5 mt-2">
    {#each list as a (a.label)}
      {#if a.href}<Button target="" href={a.href} size="sm" style="outline" label={a.label} />
      {:else}<Button size="sm" style="outline" label={a.label} onclick={() => onAction(a)} />{/if}
    {/each}
  </div>
{/snippet}
{#snippet quoteButton()}
  {#if onQuote}<button type="button" class="absolute right-0 top-0 opacity-0 group-hover:opacity-100 focus:opacity-100 grid place-items-center w-7 h-7 rounded-sm text-ink-soft hover:text-ink" aria-label="Quote this in your reply" title="Quote this in your reply" onclick={() => onQuote?.(m.text)}><span class="i-solar:reply-linear w-4 h-4" aria-hidden="true"></span></button>{/if}
{/snippet}
{#if m.role === 'user'}
  <IconTimeline icon="i-solar:user-linear" tone="user" data-timeline-entry="user">
    <p class="eyebrow h-[27px] flex items-center">You</p>
    <div class="flex flex-col gap-1.5">
      {#if m.data?.quote}<QuoteCard quote={m.data.quote} />{/if}
      <p class="text-ui text-ink">{m.text}</p>
    </div>
  </IconTimeline>
{:else if step}
  <IconTimeline icon={step.status === 'thinking' ? dots : stepIcon} tone={step.status === 'failed' ? 'fail' : step.status === 'done' ? 'bot' : 'think'} data-timeline-entry="step" data-step-status={step.status}>
    <div class="group relative pr-7" aria-live={step.status === 'done' ? undefined : 'polite'}>
      <p class="min-h-[27px] flex items-center gap-2 text-ui text-ink {step.status === 'done' ? '' : 'font-medium'}">{step.title}{#if step.status === 'thinking'}<span class="meta">thinking</span>{:else if step.status === 'working'}<ThinkingDots />{/if}</p>
      {#if step.detail}<p class="text-ui text-ink-mute">{step.detail}</p>{/if}
      {#if step.swatches?.length}
        <div role="group" aria-label="Layers found" class="flex flex-wrap gap-1 mt-1.5">
          {#each step.swatches as s, i (i)}
            <button type="button" class="flex items-center gap-1.5 rounded-sm border border-paper-edge bg-paper px-1.5 py-0.5 text-ui text-ink-mute hover:text-ink hover:border-ink-soft" title="Quote this layer in the chat" onclick={() => onQuoteLayer?.(s.n ?? layerNo(s.label))}><LayerSwatch colour={s.hex} size="sm" />{s.label}</button>
          {/each}
        </div>
      {/if}
      {#if step.calls.length}<div class="flex flex-col gap-0.5 mt-1">{@render calls(step.calls)}</div>{/if}
      {#if m.data?.actions?.length}{@render actionButtons(m.data.actions)}{/if}
      {@render quoteButton()}
    </div>
  </IconTimeline>
{:else if m.data?.call}
  <IconTimeline icon="i-solar:cpu-bolt-linear" data-timeline-entry="call">
    <p class="min-h-[27px] flex items-center text-ui text-ink-mute">{m.data.call.action}</p>
    {@render calls([m.data.call])}
  </IconTimeline>
{:else}
  <IconTimeline icon="i-solar:magic-stick-2-linear" data-timeline-entry="katachi">
    <div class="group relative pr-7">
      <p class="eyebrow h-[27px] flex items-center">Katachi</p>
      <p class="text-ui text-ink">{m.text}</p>
      {#if m.data?.actions?.length}{@render actionButtons(m.data.actions)}{/if}
      {@render quoteButton()}
    </div>
  </IconTimeline>
{/if}
{#snippet dots()}<ThinkingDots />{/snippet}
