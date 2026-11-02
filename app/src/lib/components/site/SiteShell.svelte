<script lang="ts">
import { resolve } from '$app/paths';
import type { Snippet } from 'svelte';
import { page } from '$app/state';
import { ThemeSwitcherToggle } from '@rokkit/app';
import KatachiMark from '$lib/components/KatachiMark.svelte';
import { policyLinks, siteLinks } from '$lib/content/site';
import { versionLabel } from '$lib/content/version';
// The public pages' frame: the mark (home), the site links, the theme, and the policies in the footer.
let { children, wide = false }: { children: Snippet; wide?: boolean } = $props();
</script>
<div class="min-h-dvh bg-paper text-ink font-sans text-body flex flex-col">
  <header class="h-14 flex items-center gap-2.5 px-4 md:px-10 hair-b bg-paper-soft sticky top-0 z-10">
    <a href={resolve('/')} class="flex items-center gap-2.5" aria-label="Katachi home"><span class="grid place-items-center w-8 h-8 rounded-md bg-brand-tile"><KatachiMark size={20} /></span><span class="font-heading text-lede">Katachi</span></a>
    <span class="flex-1"></span>
    <nav aria-label="Site" class="flex items-center gap-1 md:gap-3">
      {#each siteLinks as l (l.href)}<a href={resolve(l.href)} class="px-2 py-1 rounded-md text-ui {page.url.pathname === l.href ? 'text-ink bg-paper' : 'text-ink-mute hover:text-ink'}" aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a>{/each}
    </nav>
    <ThemeSwitcherToggle variant="single" />
  </header>
  <main class="flex-1 mx-auto w-full {wide ? 'max-w-[1280px]' : 'max-w-[960px]'} px-4 md:px-10">{@render children()}</main>
  <footer class="hair-t px-4 md:px-10 py-5 meta flex flex-wrap gap-x-4 gap-y-1 justify-center">
    <span>Katachi · Meta AI Developer Hackathon 2026</span>
    {#each policyLinks as l (l.href)}<a href={resolve(l.href)} class="hover:text-ink">{l.label}</a>{/each}
    <a href="https://github.com/sensei-hq/katachi" class="hover:text-ink">GitHub</a>
    <span data-app-version>{versionLabel}</span>
  </footer>
</div>
