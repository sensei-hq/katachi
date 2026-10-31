<script lang="ts">
import { vibe } from '@rokkit/states';
import { Button, Card, List, Toggle } from '@rokkit/ui';
import { ThemeSwitcherToggle } from '@rokkit/app';
import { ADAPTERS } from '$lib/devices/registry';
import type { DeviceId } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { appVersion, appCommit, versionDetail } from '$lib/content/version';
// Settings (docs/design/07 G19): my machines with status and a default (Sheets sends there), the adapters
// Katachi supports, and the workspace (density, theme).
const app = useApp();
$effect(() => app.setScreen('Settings', 'devices · workspace'));
const machines = $derived(app.devices.filter((d) => d.id !== 'file'));
const densities = [{ label: 'Comfortable', value: 'comfortable' }, { label: 'Compact', value: 'compact' }];
const adapters = Object.values(ADAPTERS).map((a) => ({ label: a.label, value: a.id, kind: a.kind }));
const tone = (s: string) => (s === 'offline' ? 'text-ink-faint' : 'text-success');
</script>
<svelte:head><title>Katachi · Settings</title></svelte:head>
<div class="mx-auto w-full max-w-[960px] px-4 py-5 md:px-8 md:py-8 flex flex-col gap-8">
  <section aria-label="My devices" class="flex flex-col gap-3">
    <div class="flex items-end justify-between gap-3">
      <div><h2 class="panel-title">My devices</h2><p class="text-ui text-ink-mute mt-1">Sheets sends to your default device. You can switch per craft.</p></div>
      <Button style="outline" size="sm" icon="i-solar:add-circle-linear" label="Add a device" disabled title="Pairing over Web Serial or your network arrives in Phase 2" />
    </div>
    <div role="radiogroup" aria-label="Default device" class="grid gap-3 md:grid-cols-3">
      {#each machines as d (d.id)}
        {@const on = app.defaultDevice === d.id}
        <button type="button" role="radio" aria-checked={on} onclick={() => app.setDefaultDevice(d.id as DeviceId)}
          class="text-left flex flex-col gap-2 rounded-lg border p-4 cursor-pointer transition-colors {on ? 'border-accent bg-paper-soft' : 'border-paper-edge bg-paper-soft hover:border-ink-soft'}">
          <span class="flex items-center gap-2">
            <span class="w-4 h-4 rounded-full border grid place-items-center {on ? 'border-accent' : 'border-ink-soft'}" aria-hidden="true">{#if on}<span class="w-2 h-2 rounded-full bg-accent"></span>{/if}</span>
            <span class="flex-1 text-body text-ink font-medium">{d.label}</span>
            <span class="meta {tone(d.status)}">{d.status}</span>
          </span>
          <span class="text-ui text-ink-mute">{d.kind} · {d.bed}</span>
          <span class="meta">{d.format}</span>
          {#if on}<span class="eyebrow text-accent">Default</span>{/if}
        </button>
      {/each}
    </div>
    <p class="text-ui text-ink-faint">Status is shown for the demo machines; live status comes with device pairing (Phase 2).</p>
  </section>

  <section aria-label="Supported" class="flex flex-col gap-2">
    <h2 class="panel-title">Supported adapters</h2>
    <p class="text-ui text-ink-mute">One design, many machines: each adapter turns a craft's sheets into that machine's files.</p>
    <Card><List items={adapters}>{#snippet itemContent(proxy)}<span class="flex-1">{proxy.label}</span><span class="meta">{proxy.get('kind')}</span>{/snippet}</List></Card>
  </section>

  <section aria-label="Workspace" class="flex flex-col gap-3">
    <h2 class="panel-title">Workspace</h2>
    <p class="eyebrow">Density</p>
    <Toggle options={densities} value={vibe.density} showLabels onchange={(v) => app.setDensity(v as 'comfortable' | 'compact')} />
    <p class="eyebrow">Theme</p>
    <ThemeSwitcherToggle variant="triad" />
  </section>

  <section aria-label="About" class="flex flex-col gap-2">
    <h2 class="panel-title">About</h2>
    <p class="text-ui">Katachi <strong data-app-version>v{appVersion}</strong> <span class="meta">· build {appCommit}</span></p>
    <p class="meta">{versionDetail()}</p>
  </section>
</div>
