import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createInvite, extend, findInvite, inviteProblem, ipHash, listInvites, listRequests, liveCosts, newCode, recordHit, recordUsage, requestMail, saveRequest, sessionSeconds, setActive, spent, strayHits, type Db } from './invites';

// vite can't bundle node:sqlite, so load it at run time
const { DatabaseSync } = createRequire(join(process.cwd(), 'package.json'))('node:sqlite') as typeof import('node:sqlite');
// D1's API over node:sqlite, with the real migration applied
function d1(): Db {
  const s = new DatabaseSync(':memory:');
  s.exec(readFileSync(join(process.cwd(), 'migrations/0001_invites.sql'), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => (s.prepare(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: s.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => s.prepare(sql).run(...(args as never[]))
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as Db;
}
const DAY = 86_400_000, T0 = Date.UTC(2026, 10, 2);

describe('invites in D1', () => {
  let db: Db;
  beforeEach(() => { db = d1(); });

  it('makes typeable codes: three groups of four, no 0/O/1/I/L', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(new Set(Array.from({ length: 200 }, newCode)).size).toBe(200);
  });

  it('an invite is tied to an email, expires, and is found whatever the case typed', async () => {
    const inv = await createInvite(db, { email: ' Ana@Example.com ', days: 14, capUsd: 0.5, label: 'judges' }, T0);
    expect(inv.email).toBe('ana@example.com');
    expect(inv.expires_at).toBe(T0 + 14 * DAY);
    expect((await findInvite(db, inv.code.toLowerCase()))?.cap_usd).toBe(0.5);
    expect(inviteProblem(await findInvite(db, inv.code), T0 + DAY)).toBeNull();
    expect(inviteProblem(await findInvite(db, inv.code), T0 + 15 * DAY)).toMatch(/expired/);
    expect(inviteProblem(null, T0)).toMatch(/isn’t valid/);
  });

  it('an email is optional: a shared code for the judges carries only its label', async () => {
    const inv = await createInvite(db, { label: 'judges', days: 30, capUsd: 10 }, T0);
    expect(inv.email).toBe('');
    const row = await findInvite(db, inv.code);
    expect([row?.email, row?.label, row?.cap_usd]).toEqual(['', 'judges', 10]);
    expect(inviteProblem(row, T0 + DAY)).toBeNull();
    expect((await listInvites(db))[0].label).toBe('judges');
  });
  it('keeps a chosen code (moving the secret one over)', async () => {
    await createInvite(db, { email: 'jerry@x.com', code: 'k7mp-4x9r-t2qf' }, T0);
    expect(await findInvite(db, 'K7MP-4X9R-T2QF')).not.toBeNull();
  });

  it('turned off, extended, and the session never outlives the invite', async () => {
    const inv = await createInvite(db, { email: 'a@b.co', days: 2 }, T0);
    expect(sessionSeconds(inv, T0)).toBe(86_400);
    expect(sessionSeconds(inv, T0 + 2 * DAY - 3_600_000)).toBe(3_600);
    await setActive(db, inv.code, false);
    expect(inviteProblem(await findInvite(db, inv.code), T0)).toMatch(/turned off/);
    await setActive(db, inv.code, true);
    await extend(db, inv.code, 7, T0 + 10 * DAY); // lapsed: counts from now
    expect((await findInvite(db, inv.code))?.expires_at).toBe(T0 + 17 * DAY);
  });

  it('live model spend is logged per invite and the cap stops it', async () => {
    const inv = await createInvite(db, { email: 'a@b.co', capUsd: 0.05 }, T0);
    const reply = { source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_image', costUsd: 0.03 }, { model: 'sam-3.1', purpose: 'items', costUsd: 0.0025 }, { model: 'code', costUsd: 0 }] };
    expect(liveCosts(reply)).toHaveLength(2);
    expect(liveCosts({ ...reply, source: 'fixture' })).toEqual([]);
    expect(liveCosts(null)).toEqual([]);
    await recordUsage(db, inv.code, '/api/scene', liveCosts(reply), T0);
    expect(await spent(db, inv.code)).toBeCloseTo(0.0325);
    expect(inviteProblem(inv, T0, await spent(db, inv.code))).toBeNull();
    await recordUsage(db, inv.code, '/api/segment', liveCosts(reply), T0);
    expect(inviteProblem(inv, T0, await spent(db, inv.code))).toMatch(/budget/);
  });

  it('hits and spend roll up per invite; guesses on unknown codes show apart', async () => {
    const inv = await createInvite(db, { email: 'a@b.co' }, T0);
    await recordHit(db, { code: inv.code, ok: true, ipHash: 'aa' }, T0 + 1);
    await recordHit(db, { code: inv.code, ok: true }, T0 + 2);
    await recordHit(db, { code: inv.code, ok: false, reason: 'Confirm you are 18 or over' }, T0 + 3);
    await recordHit(db, { code: 'GUESS-1234', ok: false, reason: 'That invite code isn’t valid', ipHash: 'bb' }, T0 + 4);
    await recordUsage(db, inv.code, '/api/scene', [{ model: 'muse-spark-1.3', costUsd: 0.02 }], T0);
    const [row] = await listInvites(db);
    expect([row.hits, row.fails, row.last_hit, row.calls]).toEqual([2, 1, T0 + 3, 1]);
    expect(row.spent_usd).toBeCloseTo(0.02);
    expect((await strayHits(db)).map((h) => h.code)).toEqual(['GUESS-1234']);
  });

  it('requests: saved, limited to three a day, and approving one marks it sent', async () => {
    expect(await saveRequest(db, { email: 'nope' }, T0)).toEqual({ ok: false, reason: 'Enter a valid email' });
    const first = await saveRequest(db, { email: 'Maker@Ex.com', note: 'earrings', ipHash: 'ip1' }, T0);
    expect(first.ok).toBe(true);
    await saveRequest(db, { email: 'other1@ex.com', ipHash: 'ip1' }, T0 + 1);
    await saveRequest(db, { email: 'other2@ex.com', ipHash: 'ip1' }, T0 + 2);
    expect((await saveRequest(db, { email: 'other3@ex.com', ipHash: 'ip1' }, T0 + 3)).ok).toBe(false);
    expect((await saveRequest(db, { email: 'other3@ex.com', ipHash: 'ip1' }, T0 + 2 * DAY)).ok).toBe(true);
    const id = first.ok ? first.id : 0;
    await createInvite(db, { email: 'maker@ex.com', requestId: id }, T0 + 10);
    const waiting = await listRequests(db, 'new');
    expect(waiting.map((r) => r.email)).not.toContain('maker@ex.com');
    expect((await listInvites(db))[0].request_id).toBe(id);
  });

  it('the request email reaches the inbox with a reply-to the requester, and no header injection', () => {
    const m = requestMail({ email: 'ana@ex.com\r\nBcc: x@evil.com', note: 'hi', id: 7 }, 'https://katachi.sensei-hq.com', 'katachi@sensei-hq.com', 'hi@sensei-hq.com');
    const head = m.split('\r\n\r\n')[0];
    expect(head).toContain('To: hi@sensei-hq.com');
    expect(head).not.toMatch(/^Bcc:/m);
    expect(m).toContain('https://katachi.sensei-hq.com/admin#request-7');
  });

  it('hashes IPs short and salted', async () => {
    const a = await ipHash('1.2.3.4', 's1');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await ipHash('1.2.3.4', 's2')).not.toBe(a);
    expect(await ipHash(null, 's1')).toBeNull();
  });
});
