<script lang="ts">
import { enhance } from '$app/forms';
import { page } from '$app/state';
import KatachiMark from '$lib/components/KatachiMark.svelte';
import type { ActionData, PageData } from './$types';
// The owner's desk: approve a request (makes a code tied to that email, then a ready-to-send email), make a code
// for anyone, see each invite's sign-ins and spend, turn one off or extend it, and spot guessing.
let { data, form }: { data: PageData; form: ActionData } = $props();
const now = Date.now();
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const pending = $derived(data.requests.filter((r) => r.status === 'new'));
const spentAll = $derived(data.invites.reduce((s, i) => s + i.spent_usd, 0));
function mail(c: { code: string; email: string; expires_at: number }) {
  const site = page.url.origin;
  const body = [`Hi,`, ``, `Here's your invite to Katachi: ${c.code}`, ``, `Open ${site}, enter the code and tick the three boxes. It works until ${day(c.expires_at)}.`, ``, `Katachi turns a photo into pieces you can cut on a laser or a Cricut. It's a prototype, so tell me what breaks — just reply to this email.`, ``, `Jerry`];
  return `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('Your Katachi invite')}&body=${encodeURIComponent(body.join('\n'))}`;
}
const input = 'h-9 px-2.5 rounded-md border border-paper-edge bg-paper text-ink text-ui';
const btn = 'h-9 px-3 rounded-md text-ui font-medium';
</script>
<svelte:head><title>Katachi · Admin</title><meta name="robots" content="noindex" /></svelte:head>
<div class="min-h-dvh bg-paper text-ink font-sans text-body">
  <header class="h-14 flex items-center gap-2.5 px-4 md:px-10 hair-b bg-paper-soft">
    <span class="grid place-items-center w-8 h-8 rounded-md bg-brand-tile"><KatachiMark size={20} /></span>
    <span class="font-heading text-lede">Katachi · Admin</span>
    <span class="flex-1"></span>
    <span class="meta">{data.admin}</span>
  </header>
  <main class="mx-auto w-full max-w-[1180px] px-4 md:px-10 py-8 flex flex-col gap-10">
    {#if !data.ready}
      <p role="alert" class="text-danger">No database is bound to this worker yet. See docs/ops/invites.md: create the D1 database, then deploy.</p>
    {/if}
    {#if form?.error}<p role="alert" class="text-danger">{form.error}</p>{/if}
    {#if form?.created}
      <section aria-label="New invite" class="rounded-lg border border-accent bg-paper-soft p-5 flex flex-wrap items-center gap-4">
        <div class="flex flex-col gap-1">
          <p class="eyebrow">Invite made</p>
          <p class="font-mono text-title select-all" data-invite-code>{form.created.code}</p>
          <p class="text-ui text-ink-mute">for {form.created.email} · until {day(form.created.expires_at)} · cap {usd(form.created.cap_usd)}</p>
        </div>
        <span class="flex-1"></span>
        <!-- a mailto: link opens the mail app, it isn't a route -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="{btn} bg-accent text-paper grid place-items-center" href={mail(form.created)}>Email it</a>
      </section>
    {/if}

    <section aria-label="Requests" class="flex flex-col gap-3">
      <h2 class="panel-title">Requests <span class="text-ink-mute text-lede">· {pending.length} waiting</span></h2>
      {#if !pending.length}<p class="text-ui text-ink-mute">No requests waiting.</p>{/if}
      <ul class="flex flex-col gap-2">
        {#each pending as r (r.id)}
          <li id="request-{r.id}" class="rounded-lg border border-paper-edge bg-paper-soft p-4 flex flex-wrap gap-3 items-center">
            <div class="flex-1 min-w-[240px]"><p class="font-medium">{r.email}</p><p class="text-ui text-ink-mute">{r.note ?? '(no note)'} · {when(r.at)}</p></div>
            <form method="POST" action="?/create" use:enhance class="flex items-center gap-2">
              <input type="hidden" name="request" value={r.id} /><input type="hidden" name="email" value={r.email} />
              <label class="meta flex items-center gap-1">days <input class="{input} w-16" name="days" type="number" min="1" value="14" /></label>
              <label class="meta flex items-center gap-1">cap $ <input class="{input} w-20" name="cap" type="number" min="0.05" step="0.05" value="1" /></label>
              <button class="{btn} bg-accent text-paper">Approve</button>
            </form>
            <form method="POST" action="?/decline" use:enhance><input type="hidden" name="request" value={r.id} /><button class="{btn} border border-paper-edge">Decline</button></form>
          </li>
        {/each}
      </ul>
    </section>

    <section aria-label="New invite for anyone" class="flex flex-col gap-3">
      <h2 class="panel-title">Make an invite</h2>
      <form method="POST" action="?/create" use:enhance class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 meta">Email<input class="{input} w-64" name="email" type="email" required /></label>
        <label class="flex flex-col gap-1 meta">Label<input class="{input} w-48" name="label" placeholder="judges, a friend…" /></label>
        <label class="flex flex-col gap-1 meta">Days<input class="{input} w-20" name="days" type="number" min="1" value="14" /></label>
        <label class="flex flex-col gap-1 meta">Cap $<input class="{input} w-24" name="cap" type="number" min="0.05" step="0.05" value="1" /></label>
        <button class="{btn} bg-accent text-paper">Make code</button>
      </form>
    </section>

    <section aria-label="Invites" class="flex flex-col gap-3">
      <h2 class="panel-title">Invites <span class="text-ink-mute text-lede">· {data.invites.length} · {usd(spentAll)} spent</span></h2>
      <div class="overflow-x-auto">
        <table class="w-full text-ui">
          <thead><tr class="text-left meta">{#each ['Code', 'Email', 'Expires', 'Sign-ins', 'Failed', 'Last seen', 'Calls', 'Spent / cap', ''] as h (h)}<th class="py-2 pr-4 font-normal">{h}</th>{/each}</tr></thead>
          <tbody>
            {#each data.invites as i (i.code)}
              {@const live = i.active && i.expires_at > now}
              <tr class="hair-t {live ? '' : 'text-ink-mute'}" data-invite={i.code}>
                <td class="py-2 pr-4 font-mono">{i.code}</td>
                <td class="py-2 pr-4">{i.email}{#if i.label}<span class="meta"> · {i.label}</span>{/if}</td>
                <td class="py-2 pr-4">{i.expires_at > now ? day(i.expires_at) : `expired ${day(i.expires_at)}`}</td>
                <td class="py-2 pr-4 font-mono">{i.hits}</td>
                <td class="py-2 pr-4 font-mono">{i.fails}</td>
                <td class="py-2 pr-4">{when(i.last_hit)}</td>
                <td class="py-2 pr-4 font-mono">{i.calls}</td>
                <td class="py-2 pr-4 font-mono {i.spent_usd >= i.cap_usd ? 'text-danger' : ''}">{usd(i.spent_usd)} / {usd(i.cap_usd)}</td>
                <td class="py-2 flex gap-2 justify-end">
                  <form method="POST" action="?/extend" use:enhance><input type="hidden" name="code" value={i.code} /><input type="hidden" name="days" value="7" /><button class="{btn} border border-paper-edge">+7 days</button></form>
                  <form method="POST" action="?/toggle" use:enhance><input type="hidden" name="code" value={i.code} /><input type="hidden" name="active" value={i.active ? '0' : '1'} /><button class="{btn} border border-paper-edge">{i.active ? 'Turn off' : 'Turn on'}</button></form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    {#if data.stray.length}
      <section aria-label="Unknown codes" class="flex flex-col gap-3">
        <h2 class="panel-title">Attempts on unknown codes</h2>
        <ul class="text-ui font-mono flex flex-col gap-1">{#each data.stray as s, k (k)}<li>{when(s.at)} · {s.code || '(empty)'} · {s.ip_hash ?? '—'}</li>{/each}</ul>
      </section>
    {/if}
  </main>
</div>
