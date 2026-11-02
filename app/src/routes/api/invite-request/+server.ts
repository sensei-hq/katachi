import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { ipHash, isEmail, requestMail, saveRequest } from '$lib/server/invites';
import { sessionSecret } from '$lib/server/session';

// "Request an invite" (public): saved for /admin, and an email to the request inbox (INVITE_NOTIFY_TO, through
// Cloudflare Email Routing's send_email binding). A filled hidden field means a bot: say thanks, keep nothing.
export async function POST({ request, platform, url, getClientAddress }) {
  const b = await request.json().catch(() => ({}));
  const email = String(b?.email ?? ''), note = String(b?.note ?? '');
  if (b?.website) return json({ ok: true });
  if (!isEmail(email)) return json({ ok: false, reason: 'Enter a valid email' }, { status: 400 });
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false, reason: 'Requests aren’t open yet — email hi@sensei-hq.com' }, { status: 503 });
  let ip: string | null = null;
  try { ip = request.headers.get('cf-connecting-ip') ?? getClientAddress(); } catch { /* none in tests */ }
  const saved = await saveRequest(db, { email, note, ipHash: await ipHash(ip, sessionSecret() ?? 'katachi') });
  if (!saved.ok) return json(saved, { status: 429 });
  const mailer = platform?.env?.EMAIL, to = env.INVITE_NOTIFY_TO, from = env.INVITE_NOTIFY_FROM;
  if (mailer && to && from) {
    try {
      const { EmailMessage } = await import(/* @vite-ignore */ 'cloudflare:email' as string);
      await mailer.send(new EmailMessage(from, to, requestMail({ email, note, id: saved.id }, url.origin, from, to)));
    } catch (e) {
      console.error('invite request email failed', e); // the request is saved either way; /admin shows it
    }
  }
  return json({ ok: true });
}
