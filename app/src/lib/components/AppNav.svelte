<script lang="ts">
import { Button } from '@rokkit/ui';
import type { Section, SectionId } from '$lib/content/sections';
// Phone (< md) icon nav docked at the bottom: Home, the open craft's steps, and Katachi. The studio uses NavRail with the same list.
let { sections, current, chatOpen = false, onOpenChat }: { sections: Section[]; current: SectionId | ''; chatOpen?: boolean; onOpenChat: () => void } = $props();
</script>
<nav aria-label="Snap sections" class="min-h-14 flex items-center justify-around gap-0.5 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] bg-paper-soft hair-t">
  {#each sections as s (s.id)}
    {#if s.disabled}<Button icon={s.icon} title={`${s.label} — once the layers are ready`} aria-label={s.label} style="ghost" disabled />
    {:else}<Button target="" href={s.href} icon={s.icon} title={s.label} aria-label={s.label} aria-current={current === s.id ? 'page' : undefined}
      variant={current === s.id ? 'primary' : 'default'} style={current === s.id ? 'default' : 'ghost'} />{/if}
  {/each}
  <Button style={chatOpen ? 'default' : 'ghost'} variant={chatOpen ? 'primary' : 'default'} icon="i-solar:chat-round-line-linear" aria-label="Open Katachi chat" aria-pressed={chatOpen} onclick={onOpenChat} />
</nav>
