import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { checkInvite, inviteCodes, signSession } from '$lib/server/guard';
import { SESSION_COOKIE, sessionSecret } from '$lib/server/session';

export async function POST({ request, cookies }) {
  const secret = sessionSecret();
  if (!secret) return json({ ok: false, reason: 'The gate isn’t set up yet' }, { status: 503 });
  const { code, attested18 } = await request.json().catch(() => ({}));
  const r = checkInvite(String(code ?? ''), Boolean(attested18), inviteCodes(env.SNAP_INVITE_CODES));
  if (!r.ok) return json({ ok: false, reason: r.reason }, { status: 403 });
  const userId = String(code ?? '').trim();
  cookies.set(SESSION_COOKIE, await signSession(userId, secret), { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 86400 });
  return json({ ok: true, user_id: userId });
}
