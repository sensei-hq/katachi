// /admin is for the owner only. Cloudflare Access sits in front of /admin* and /api/admin* and lets through only the
// allowed email; this checks again in the worker: the Cf-Access-Jwt-Assertion token must be signed by the team's
// keys, carry the app's audience tag, be unexpired and name an allowed email. Without that config the deployed
// site refuses /admin outright (fail closed); only the local dev server opens it.

export interface AccessConfig { teamDomain?: string; aud?: string; emails?: string }
type Jwk = JsonWebKey & { kid?: string };
let certs: { url: string; keys: Jwk[]; at: number } | null = null;

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const part = (s: string) => JSON.parse(new TextDecoder().decode(b64(s)));

export const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
export const accessConfigured = (c: AccessConfig) => Boolean(c.teamDomain && c.aud && c.emails);
export const allowedEmails = (raw?: string) => (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

async function keys(teamDomain: string, fetchFn: typeof fetch, now: number): Promise<Jwk[]> {
  const url = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/cdn-cgi/access/certs`;
  if (certs && certs.url === url && now - certs.at < 3_600_000) return certs.keys;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`Access certs ${r.status}`);
  certs = { url, keys: ((await r.json()) as { keys: Jwk[] }).keys, at: now };
  return certs.keys;
}

/** the admin's email when the request carries a valid Access token for this app; otherwise null */
export async function adminEmail(token: string | null, c: AccessConfig, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  if (!token || !accessConfigured(c)) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const head = part(h), claims = part(p);
    if (head.alg !== 'RS256') return null;
    const aud: string[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    // one Access app per path is fine: CF_ACCESS_AUD may list each app's tag, comma-separated
    const ours = c.aud!.split(',').map((a) => a.trim()).filter(Boolean);
    if (!aud.some((a) => ours.includes(a)) || typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    const email = String(claims.email ?? '').toLowerCase();
    if (!allowedEmails(c.emails).includes(email)) return null;
    const jwk = (await keys(c.teamDomain!, fetchFn, now)).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? email : null;
  } catch {
    return null;
  }
}

/** for tests: forget the cached keys */
export function resetAccessCache() { certs = null; }
