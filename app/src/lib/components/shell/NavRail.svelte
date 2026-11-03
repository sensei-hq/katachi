<script lang="ts">
import { resolve } from '$app/paths';
import { Button } from '@rokkit/ui';
import { ThemeSwitcherToggle } from '@rokkit/app';
import KatachiMark from '../KatachiMark.svelte';
import type { Section, Tool } from '$lib/content/sections';
import { appVersion, versionLabel } from '$lib/content/version';
// Studio (≥ md) rail: Home (start + your crafts) and the tools; when a craft is open, its thumbnail and its steps
// (Layers · Cut · cut queue · Assemble) join as a group. Phone layouts use AppNav with the same lists.
let { sections, craft = null, tools = [], current, chatOpen, onToggleChat }: {
  sections: Section[]; craft?: { name: string; image: string; href: string; steps: Section[] } | null; tools?: Tool[]; current: string; chatOpen: boolean; onToggleChat: () => void;
} = $props();
</script>
{#snippet item(s: Section)}
  {#if s.disabled}<span title={`${s.label} — once the layers are ready`}><Button icon={s.icon} aria-label={s.label} style="ghost" disabled /></span>
  {:else}<span class="relative inline-grid"><Button target="" href={s.href} icon={s.icon} title={s.badge ? `${s.label} · ${s.badge} waiting` : s.label} aria-label={s.badge ? `${s.label}, ${s.badge} waiting` : s.label} aria-current={current === s.id ? 'page' : undefined}
    variant={current === s.id ? 'primary' : 'default'} style={current === s.id ? 'default' : 'ghost'} />{#if s.badge}<span class="absolute -top-1 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-accent text-on-primary font-mono text-[10px] leading-[18px] text-center pointer-events-none {s.pulse ? 'animate-ping-once' : ''}" data-badge aria-hidden="true">{s.badge}</span>{/if}</span>{/if}
{/snippet}
<nav aria-label="Studio sections" class="w-14 shrink-0 flex flex-col items-center gap-1.5 py-3 bg-paper-soft border-r border-paper-edge">
  <a href={resolve('/')} aria-label="About Katachi" class="mb-2 grid place-items-center w-10 h-10 rounded-md bg-brand-tile"><KatachiMark size={26} /></a>
  {#each sections.filter((s) => s.id === 'workshop') as s (s.id)}{@render item(s)}{/each}
  {#if craft}
    <!-- the open craft: its picture, then its steps -->
    <section aria-label="Current craft" class="flex flex-col items-center gap-1.5 mt-1 pt-2 border-t border-paper-edge">
      <a href={resolve(craft.href as '/workshop')} title={craft.name} aria-label={`Current craft: ${craft.name}`} class="block w-9 h-9 rounded-md overflow-hidden border border-paper-edge bg-paper-mute">
        {#if craft.image}<img src={craft.image} alt="" class="w-full h-full object-cover" />{:else}<span class="grid place-items-center w-full h-full i-solar:layers-linear text-ink-soft"></span>{/if}
      </a>
      <!-- the cut queue sits between Cut and Assemble: you cut the sheets, then put the pieces together -->
      {#each craft.steps as s (s.id)}
        {#if s.id === 'assemble'}{#each sections.filter((q) => q.id === 'queue') as q (q.id)}{@render item(q)}{/each}{/if}
        {@render item(s)}
      {/each}
    </section>
  {/if}
  {#each sections.filter((s) => s.id !== 'workshop' && (!craft || s.id !== 'queue')) as s (s.id)}<span class="mt-1">{@render item(s)}</span>{/each}
  <span class="w-5 h-px my-1.5 bg-paper-edge"></span>
  <Button style={chatOpen ? 'default' : 'ghost'} variant={chatOpen ? 'primary' : 'default'} icon="i-solar:chat-round-line-linear" title="Toggle Katachi chat" aria-label="Toggle Katachi chat" aria-pressed={chatOpen} onclick={onToggleChat} />
  <span class="flex-1"></span>
  {#each tools as t (t.id)}
    <Button target="" href={t.href} icon={t.icon} title={t.label} aria-label={t.label} aria-current={current === t.id ? 'page' : undefined}
      variant={current === t.id ? 'primary' : 'default'} style={current === t.id ? 'default' : 'ghost'} />
  {/each}
  <ThemeSwitcherToggle variant="single" />
  <a href={resolve('/settings')} class="mt-1 text-[10px] leading-none text-ink-faint hover:text-ink-mute" title={versionLabel} data-app-version>v{appVersion}</a>
</nav>
