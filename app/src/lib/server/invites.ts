// Invites in D1 (migrations/0001_invites.sql): each code tied to an email, with an expiry and a spend cap;
// every gate attempt and every live model call recorded against it; invite requests queued for /admin.
// Without the DB binding (local dev, tests) the gate falls back to the SNAP_INVITE_CODES secret.

/** the slice of Cloudflare D1 used here */
export interface Db {
  prepare(sql: string): { bind(...v: unknown[]): DbStmt } & DbStmt;
  batch?(stmts: DbStmt[]): Promise<unknown>;
}
export interface DbStmt {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Invite { code: string; email: string; label: string | null; expires_at: number; cap_usd: number; active: number; request_id: number | null; created_at: number }
export interface InviteRequest { id: number; email: string; note: string | null; at: number; status: 'new' | 'sent' | 'declined' }

const DAY = 86_400_000;
// no 0/O, 1/I/L: codes are read out of emails and typed by hand
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** a fresh code like K7MP-4X9R-T2QF */
export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export const normalCode = (c: string) => c.trim().toUpperCase();
export const normalEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e.trim());

/** why this invite can't be used now, or null when it can */
export function inviteProblem(inv: Invite | null, now: number, spentUsd = 0): string | null {
  if (!inv) return 'That invite code isn’t valid';
  if (!inv.active) return 'That invite has been turned off';
  if (inv.expires_at <= now) return 'That invite has expired — request a new one';
  if (spentUsd >= inv.cap_usd) return 'That invite has used its model budget';
  return null;
}

/** how long a session on this invite may last: a day, or up to its expiry */
export function sessionSeconds(inv: Pick<Invite, 'expires_at'>, now: number): number {
  return Math.max(60, Math.min(86_400, Math.floor((inv.expires_at - now) / 1000)));
}

export async function findInvite(db: Db, code: string): Promise<Invite | null> {
  return db.prepare('select * from invites where code = ?').bind(normalCode(code)).first<Invite>();
}

export async function spent(db: Db, code: string): Promise<number> {
  const r = await db.prepare('select coalesce(sum(cost_usd), 0) as usd from usage where code = ?').bind(code).first<{ usd: number }>();
  return Number(r?.usd ?? 0);
}

export async function createInvite(db: Db, o: { email: string; days?: number; capUsd?: number; label?: string; code?: string; requestId?: number }, now = Date.now()): Promise<Invite> {
  const inv: Invite = { code: normalCode(o.code || newCode()), email: normalEmail(o.email), label: o.label?.trim() || null, expires_at: now + Math.round((o.days ?? 14) * DAY),
    cap_usd: o.capUsd ?? 1, active: 1, request_id: o.requestId ?? null, created_at: now };
  await db.prepare('insert into invites (code, email, label, expires_at, cap_usd, active, request_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(inv.code, inv.email, inv.label, inv.expires_at, inv.cap_usd, inv.active, inv.request_id, inv.created_at).run();
  if (o.requestId) await db.prepare("update invite_requests set status = 'sent' where id = ?").bind(o.requestId).run();
  return inv;
}

export async function setActive(db: Db, code: string, active: boolean) {
  await db.prepare('update invites set active = ? where code = ?').bind(active ? 1 : 0, normalCode(code)).run();
}
export async function extend(db: Db, code: string, days: number, now = Date.now()) {
  // from now if it had lapsed, else from its current expiry
  await db.prepare('update invites set expires_at = max(expires_at, ?) + ? where code = ?').bind(now, Math.round(days * DAY), normalCode(code)).run();
}

export async function recordHit(db: Db, h: { code: string; ok: boolean; reason?: string | null; ipHash?: string | null; ua?: string | null }, now = Date.now()) {
  await db.prepare('insert into invite_hits (code, at, ok, reason, ip_hash, ua) values (?, ?, ?, ?, ?, ?)')
    .bind(normalCode(h.code).slice(0, 40), now, h.ok ? 1 : 0, h.reason ?? null, h.ipHash ?? null, (h.ua ?? '').slice(0, 200) || null).run();
}

export interface TraceCost { model?: string; purpose?: string; costUsd?: number }
/** the live model calls in an API reply's trace (fixture replies cost nothing) */
export function liveCosts(body: unknown): TraceCost[] {
  const b = body as { source?: string; trace?: TraceCost[] } | null;
  if (!b || b.source !== 'live' || !Array.isArray(b.trace)) return [];
  return b.trace.filter((t) => typeof t?.costUsd === 'number' && t.costUsd > 0);
}

export async function recordUsage(db: Db, code: string, path: string, costs: TraceCost[], now = Date.now()) {
  for (const c of costs)
    await db.prepare('insert into usage (code, at, path, model, purpose, cost_usd) values (?, ?, ?, ?, ?, ?)')
      .bind(code, now, path, String(c.model ?? 'unknown'), String(c.purpose ?? '').slice(0, 120) || null, Number(c.costUsd)).run();
}

export async function saveRequest(db: Db, r: { email: string; note?: string; ipHash?: string | null }, now = Date.now()): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
  if (!isEmail(r.email)) return { ok: false, reason: 'Enter a valid email' };
  const email = normalEmail(r.email);
  // three requests a day from one address or one network is plenty
  const recent = await db.prepare('select count(*) as n from invite_requests where at > ? and (email = ? or (ip_hash is not null and ip_hash = ?))').bind(now - DAY, email, r.ipHash ?? '').first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= 3) return { ok: false, reason: 'We already have your request — we’ll be in touch' };
  await db.prepare('insert into invite_requests (email, note, at, status, ip_hash) values (?, ?, ?, ?, ?)').bind(email, r.note?.trim().slice(0, 500) || null, now, 'new', r.ipHash ?? null).run();
  const row = await db.prepare('select max(id) as id from invite_requests where email = ?').bind(email).first<{ id: number }>();
  return { ok: true, id: Number(row?.id ?? 0) };
}

export async function setRequestStatus(db: Db, id: number, status: InviteRequest['status']) {
  await db.prepare('update invite_requests set status = ? where id = ?').bind(status, id).run();
}

export interface InviteRow extends Invite { hits: number; fails: number; last_hit: number | null; spent_usd: number; calls: number }
/** every invite with its hits and spend, newest first */
export async function listInvites(db: Db): Promise<InviteRow[]> {
  const r = await db.prepare(`select i.*,
      (select count(*) from invite_hits h where h.code = i.code and h.ok = 1) as hits,
      (select count(*) from invite_hits h where h.code = i.code and h.ok = 0) as fails,
      (select max(at) from invite_hits h where h.code = i.code) as last_hit,
      (select coalesce(sum(cost_usd), 0) from usage u where u.code = i.code) as spent_usd,
      (select count(*) from usage u where u.code = i.code) as calls
    from invites i order by i.created_at desc`).all<InviteRow>();
  return r.results;
}
export async function listRequests(db: Db, status?: InviteRequest['status']): Promise<InviteRequest[]> {
  const q = status ? db.prepare('select id, email, note, at, status from invite_requests where status = ? order by at desc').bind(status) : db.prepare('select id, email, note, at, status from invite_requests order by at desc limit 200');
  return (await q.all<InviteRequest>()).results;
}
/** failed attempts on codes that don't exist: guessing shows up here */
export async function strayHits(db: Db, limit = 50) {
  return (await db.prepare('select h.code, h.at, h.reason, h.ip_hash from invite_hits h left join invites i on i.code = h.code where i.code is null and h.ok = 0 order by h.at desc limit ?').bind(limit).all<{ code: string; at: number; reason: string; ip_hash: string }>()).results;
}

/** a short, salted hash of the caller's IP: enough to spot repeats, not to identify anyone */
export async function ipHash(ip: string | null | undefined, salt: string): Promise<string | null> {
  if (!ip) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(d).slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** the email text that tells you about a request (sent to hi@ via Cloudflare Email Routing) */
export function requestMail(r: { email: string; note?: string; id: number }, origin: string, from: string, to: string): string {
  const id = `<${crypto.randomUUID()}@${from.split('@')[1] ?? 'katachi'}>`;
  const body = [`${r.email} asked for a Katachi invite.`, '', r.note?.trim() ? `"${r.note.trim().slice(0, 500)}"` : '(no note)', '', `Approve it: ${origin}/admin#request-${r.id}`,
    `Or from the repo: bun run invite new ${r.email} --request ${r.id}`].join('\r\n');
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ');
  return [`From: Katachi <${from}>`, `To: ${to}`, `Reply-To: ${clean(r.email)}`, `Subject: Invite request: ${clean(r.email)}`, `Message-ID: ${id}`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
}
