<script lang="ts">
import type { Snippet } from 'svelte';
// One entry of a vertical timeline: a leading icon box and the content beside it, joined to the next entry by a
// dotted connector (hidden on the last). Ported from Rokkit's learn app (apps/learn/src/lib/chat/IconTimeline),
// which keeps it local until it is promoted to @rokkit/ui.
let { icon, tone = 'bot', children, ...rest }: { icon?: Snippet | string; tone?: 'user' | 'bot' | 'think' | 'fail'; children?: Snippet; [key: `data-${string}`]: string | undefined } = $props();
</script>
<div data-icon-timeline data-tone={tone} {...rest}>
  <span data-icon-timeline-node>
    {#if typeof icon === 'function'}{@render icon()}
    {:else if icon}<span class="{icon} w-3.5 h-3.5" aria-hidden="true"></span>
    {:else}<span data-icon-timeline-dot></span>{/if}
  </span>
  {@render children?.()}
</div>
<style>
  [data-icon-timeline] { position: relative; padding-left: 36px; min-height: 27px; }
  [data-icon-timeline]::before {
    content: ''; position: absolute; left: 13px; top: 30px; bottom: -14px; width: 0;
    border-left: 1px dashed var(--ink-soft); opacity: 0.6;
  }
  /* the last entry has nothing below it to join (each entry sits in its own wrapper in the chat) */
  :global([data-chat-timeline] > :last-child) [data-icon-timeline]::before { display: none; }
  [data-icon-timeline-node] {
    position: absolute; left: 0; top: 0; width: 27px; height: 27px; display: grid; place-items: center;
    border-radius: 6px; border: 1px solid var(--paper-edge); background: var(--paper-soft); color: var(--ink-soft);
  }
  [data-tone='user'] [data-icon-timeline-node] { background: var(--paper-mute); color: var(--ink); }
  [data-tone='bot'] [data-icon-timeline-node] { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 30%, var(--paper-edge)); background: color-mix(in oklab, var(--accent) 6%, var(--paper-soft)); }
  [data-tone='think'] [data-icon-timeline-node] { color: var(--accent); border-style: dashed; }
  [data-tone='fail'] [data-icon-timeline-node] { color: var(--danger); }
  [data-icon-timeline-dot] { width: 4px; height: 4px; border-radius: 2px; background: currentColor; opacity: 0.6; }
</style>
