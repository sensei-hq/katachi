import { json, redirect, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { legacyPath } from '$lib/content/routes';
import { adminEmail, accessConfigured, isAdminPath } from '$lib/server/access';
import { inviteCodes, isPublicPath, verifySession } from '$lib/server/guard';
import { findInvite, inviteProblem, liveCosts, normalCode, recordUsage, spent } from '$lib/server/invites';
import { SESSION_COOKIE, sessionSecret } from '$lib/server/session';

// 1. old /snap links move to the root routes; 2. /admin: the owner only (Cloudflare Access, checked again here);
// 3. the gate: no valid signed session on a live invite → no pages and no API; 4. live model spend logged per invite.
export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const moved = legacyPath(path);
  if (moved) redirect(308, moved + event.url.search);
  const db = event.platform?.env?.DB;

  if (isAdminPath(path)) {
    const access = { teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD, emails: env.ADMIN_EMAILS };
    const email = accessConfigured(access) ? await adminEmail(event.request.headers.get('cf-access-jwt-assertion'), access) : dev ? 'dev@localhost' : null;
    if (!email) return path.startsWith('/api/') ? json({ ok: false, reason: 'Not allowed' }, { status: 403 }) : new Response('Not allowed', { status: 403 });
    event.locals.admin = email;
    event.locals.session = null;
    return resolve(event);
  }

  const secret = sessionSecret();
  const id = secret ? await verifySession(event.cookies.get(SESSION_COOKIE), secret) : null;
  // the invite behind the session must still be live: on, unexpired, under its cap (codes still only in the
  // SNAP_INVITE_CODES secret keep working until they are moved into the DB)
  if (id && db && !isPublicPath(path) && !inviteCodes(env.SNAP_INVITE_CODES).map(normalCode).includes(id)) {
    const inv = await findInvite(db, id);
    const why = inviteProblem(inv, Date.now(), inv ? await spent(db, inv.code) : 0);
    if (why) {
      event.cookies.delete(SESSION_COOKIE, { path: '/' });
      if (path.startsWith('/api/')) return json({ ok: false, reason: why }, { status: 401 });
      redirect(303, `/?why=${encodeURIComponent(why)}`);
    }
  }
  event.locals.session = id ? { id } : null;
  if (!id && !isPublicPath(path)) {
    if (path.startsWith('/api/')) return json({ ok: false, reason: 'Enter through the gate first' }, { status: 401 });
    redirect(303, '/');
  }
  const res = await resolve(event);
  if (id && db && path.startsWith('/api/') && event.request.method === 'POST' && res.headers.get('content-type')?.includes('application/json')) {
    const log = res.clone().json().then((body) => recordUsage(db, id!, path, liveCosts(body))).catch(() => {});
    if (event.platform?.ctx?.waitUntil) event.platform.ctx.waitUntil(log); else await log;
  }
  return res;
};
