#!/usr/bin/env node
// Invites, from your machine only (docs/ops/invites.md). Talks to the D1 database through wrangler with your own
// Cloudflare login, so nothing here is reachable from the site.
//
//   bun run invite setup                     once: create the DB, bind it, migrate (requests then show in /admin)
//   bun run invite new ana@x.com             a fresh code for 14 days, $1 of model calls (options: --days --cap --label --request)
//   bun run invite list                      every invite: sign-ins, failed tries, calls, spend
//   bun run invite usage <code>              that invite's model calls
//   bun run invite requests                  requests waiting
//   bun run invite decline <request id>
//   bun run invite off <code> | on <code> | extend <code> <days>
//   add --local to any of them to use the local dev database instead of the deployed one; --config <file> for another wrangler config
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DB = 'katachi';
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => i > 0 && !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && argv[i - 1] !== '--local'));
const where = argv.includes('--local') ? '--local' : '--remote';
const config = flag('config') ? ['-c', flag('config')] : [];
const DAY = 86_400_000;

const wrangler = (args, opts = {}) => execFileSync('bunx', ['wrangler', ...args], { encoding: 'utf8', stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'inherit'] });
const q = (s) => (s == null || s === '' ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const n = (v, d) => { const x = Number(v ?? d); if (!Number.isFinite(x) || x <= 0) die(`not a positive number: ${v}`); return x; };
function die(m) { console.error(m); process.exit(1); }
function sql(command) {
  // the DB binding is written by setup: without it there is nothing to talk to
  if (!config.length && !/"d1_databases"/.test(readFileSync('wrangler.jsonc', 'utf8'))) die('No invites database yet. Run this once first: bun run invite setup');
  const out = wrangler(['d1', 'execute', DB, where, ...config, '--json', '--command', command]);
  const res = JSON.parse(out);
  return (Array.isArray(res) ? res : [res]).flatMap((r) => r.results ?? []);
}
function code() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const s = Array.from(randomBytes(12), (b) => A[b % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const usd = (x) => `$${Number(x).toFixed(4)}`;

function bind(file, id, notify) {
  const c = JSON.parse(readFileSync(file, 'utf8'));
  c.d1_databases = [{ binding: 'DB', database_name: DB, database_id: id, migrations_dir: 'migrations' }];
  if (notify) c.send_email = [{ name: 'EMAIL', destination_address: notify }];
  if (notify) c.vars = { ...(c.vars ?? {}), INVITE_NOTIFY_TO: notify, INVITE_NOTIFY_FROM: flag('from', `katachi@${notify.split('@')[1]}`) };
  writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
}

switch (cmd) {
  case 'setup': {
    let id = flag('id');
    if (!id) {
      const out = wrangler(['d1', 'create', DB]);
      id = out.match(/"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/)?.[1];
      if (!id) die(`Couldn't read the database id from:\n${out}\nRun again with --id <id>.`);
    }
    const notify = flag('notify');
    for (const f of ['wrangler.jsonc', 'wrangler.sveltekit.jsonc']) bind(f, id, notify);
    wrangler(['d1', 'migrations', 'apply', DB, where, ...config], { inherit: true });
    console.log(`\nD1 "${DB}" (${id}) is bound as DB in wrangler.jsonc${notify ? `, and requests email ${notify}` : ''}. Deploy to switch the gate over.`);
    break;
  }
  case 'new': {
    const email = (flag('email') ?? pos[0])?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) die('Usage: bun run invite new <email>   (optional: --days 14 --cap 1 --label <text>)');
    const now = Date.now(), c = (flag('code') ?? code()).toUpperCase(), exp = now + Math.round(n(flag('days'), 14) * DAY), req = flag('request');
    sql(`insert into invites (code, email, label, expires_at, cap_usd, active, request_id, created_at) values (${q(c)}, ${q(email)}, ${q(flag('label'))}, ${exp}, ${n(flag('cap'), 1)}, 1, ${req ? n(req) : 'null'}, ${now});`
      + (req ? ` update invite_requests set status = 'sent' where id = ${n(req)};` : ''));
    console.log(`${c}\n  for ${email} · until ${day(exp)} · cap $${n(flag('cap'), 1)}`);
    break;
  }
  case 'list': {
    const rows = sql(`select i.code, i.email, i.label, i.expires_at, i.cap_usd, i.active,
      (select count(*) from invite_hits h where h.code = i.code and h.ok = 1) as hits,
      (select count(*) from invite_hits h where h.code = i.code and h.ok = 0) as fails,
      (select max(at) from invite_hits h where h.code = i.code) as last,
      (select count(*) from usage u where u.code = i.code) as calls,
      (select coalesce(sum(cost_usd), 0) from usage u where u.code = i.code) as spent
      from invites i order by i.created_at desc`);
    console.table(rows.map((r) => ({ code: r.code, email: r.email, label: r.label ?? '', expires: day(r.expires_at), on: r.active ? (r.expires_at > Date.now() ? 'yes' : 'expired') : 'off',
      'sign-ins': r.hits, failed: r.fails, 'last seen': r.last ? new Date(r.last).toISOString().slice(0, 16).replace('T', ' ') : '', calls: r.calls, spent: `${usd(r.spent)} / $${r.cap_usd}` })));
    break;
  }
  case 'usage': {
    const c = pos[0]?.toUpperCase() ?? die('usage <code>');
    console.table(sql(`select datetime(at / 1000, 'unixepoch') as at, path, model, purpose, cost_usd from usage where code = ${q(c)} order by at desc limit 200`));
    break;
  }
  case 'requests':
    console.table(sql(`select id, email, note, datetime(at / 1000, 'unixepoch') as at, status from invite_requests where status = 'new' order by at desc`));
    break;
  case 'decline':
    sql(`update invite_requests set status = 'declined' where id = ${n(pos[0])}`); console.log('declined');
    break;
  case 'off': case 'on':
    sql(`update invites set active = ${cmd === 'on' ? 1 : 0} where code = ${q(pos[0]?.toUpperCase())}`); console.log(`${pos[0]} ${cmd}`);
    break;
  case 'extend':
    sql(`update invites set expires_at = max(expires_at, ${Date.now()}) + ${Math.round(n(pos[1], 7) * DAY)} where code = ${q(pos[0]?.toUpperCase())}`); console.log(`${pos[0]} +${n(pos[1], 7)} days`);
    break;
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
