import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { checkInvite, inviteCodes, signSession } from '$lib/server/guard';
import { findInvite, inviteProblem, ipHash, normalCode, recordHit, sessionSeconds, spent } from '$lib/server/invites';
import { SESSION_COOKIE, sessionSecret } from '$lib/server/session';

// The gate: an invite from the DB (on, unexpired, under its cap; the session ends at its expiry), or a code still
// kept in the SNAP_INVITE_CODES secret. Every attempt is recorded against the code typed.
export async function POST({ request, cookies, platform, getClientAddress }) {
  const secret = sessionSecret();
  if (!secret) return json({ ok: false, reason: 'The gate isn’t set up yet' }, { status: 503 });
  const { code, attested18 } = await request.json().catch(() => ({}));
  const typed = normalCode(String(code ?? ''));
  const db = platform?.env?.DB;
  const legacy = inviteCodes(env.SNAP_INVITE_CODES).map(normalCode);
  const now = Date.now();
  let maxAge = 86_400, reason: string | null = null;
  const basic = checkInvite(typed, Boolean(attested18), [typed]);
  if (!basic.ok) reason = basic.reason ?? 'That invite code isn’t valid';
  else if (!legacy.includes(typed)) {
    const inv = db ? await findInvite(db, typed) : null;
    reason = inviteProblem(inv, now, inv && db ? await spent(db, inv.code) : 0);
    if (inv && !reason) maxAge = sessionSeconds(inv, now);
  }
  if (db && typed) {
    let ip: string | null = null;
    try { ip = request.headers.get('cf-connecting-ip') ?? getClientAddress(); } catch { /* no address in tests */ }
    await recordHit(db, { code: typed, ok: !reason, reason, ipHash: await ipHash(ip, secret), ua: request.headers.get('user-agent') }).catch(() => {});
  }
  if (reason) return json({ ok: false, reason }, { status: 403 });
  cookies.set(SESSION_COOKIE, await signSession(typed, secret), { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge });
  return json({ ok: true, user_id: typed });
}
