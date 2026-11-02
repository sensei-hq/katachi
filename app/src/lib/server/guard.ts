// Server-only guard (R-PL-2/4/5/7): invite codes, signed sessions, the public paths, the budget.

/** Invite codes come only from the SNAP_INVITE_CODES secret — nothing built in. */
export function inviteCodes(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((c) => c.trim()).filter(Boolean);
}

export function checkInvite(code: string, attested18: boolean, validCodes: string[]): { ok: boolean; reason?: string } {
  if (!code.trim()) return { ok: false, reason: 'Enter your invite code' };
  if (!attested18) return { ok: false, reason: 'Confirm you are 18 or over' };
  if (!validCodes.includes(code.trim())) return { ok: false, reason: 'That invite code isn’t valid' };
  return { ok: true };
}

// Session cookie value: "<id>.<HMAC-SHA256(id) base64url>" — Web Crypto, so it runs on Workers.
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
async function mac(id: string, secret: string) { return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(id))); }

export async function signSession(id: string, secret: string): Promise<string> { return `${id}.${await mac(id, secret)}`; }

/** The session id when the token is ours and untouched; otherwise null. */
export async function verifySession(token: string | undefined, secret: string): Promise<string | null> {
  const dot = token?.lastIndexOf('.') ?? -1;
  if (!token || dot <= 0) return null;
  const id = token.slice(0, dot), sig = token.slice(dot + 1);
  const expected = await mac(id, secret);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}

/** Reachable without a session: the gate page, its API, the static shell and the public site. */
export function isPublicPath(path: string): boolean {
  return path === '/' || path === '/api/gate' || path === '/api/invite-request' || path === '/api/version' || path.startsWith('/_app/') || /^\/(favicon\.svg|manifest\.webmanifest|service-worker\.js|robots\.txt|katachi-deck\.pptx)$/.test(path)
    // the public site: the story, the slides, the docs, the roadmap, the policies, and their images and film
    || /^\/(story|slides|docs|roadmap|terms-of-service|privacy-policy)\/?$/.test(path) || /^\/(story|film|samples)\/[\w.-]+$/.test(path);
}
export class BudgetGuard {
  spentSession = 0; spentDay = 0;
  constructor(private sessionCap = 1, private dayCap = 10, private killSwitch = false) {}
  get blocked() { return this.killSwitch; }
  get tripped() { return this.killSwitch || this.spentSession >= this.sessionCap || this.spentDay >= this.dayCap; }
  charge(usd: number) { this.spentSession += usd; this.spentDay += usd; }
  static async withRetry<T>(fn: () => Promise<T>, max = 3, baseMs = 250): Promise<T> {
    let last: unknown;
    for (let i = 0; i < max; i++) {
      try { return await fn(); } catch (e) {
        last = e; const status = (e as { status?: number })?.status;
        if (status !== 429 && status !== 503) throw e;
        if (i < max - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
      }
    }
    throw last;
  }
}
