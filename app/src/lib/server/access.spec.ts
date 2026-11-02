import { describe, it, expect, beforeEach } from 'vitest';
import { adminEmail, isAdminPath, resetAccessCache } from './access';

// a real RS256 token, signed the way Cloudflare Access signs Cf-Access-Jwt-Assertion
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function setup() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
  const sign = async (claims: Record<string, unknown>, kid = 'k1') => {
    const h = enc({ alg: 'RS256', kid }), p = enc(claims);
    const s = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${h}.${p}`))).toString('base64url');
    return `${h}.${p}.${s}`;
  };
  let calls = 0;
  const fetchFn = (async (url: string) => { calls++; expect(url).toBe('https://sensei.cloudflareaccess.com/cdn-cgi/access/certs'); return new Response(JSON.stringify({ keys: [jwk] })); }) as unknown as typeof fetch;
  return { sign, fetchFn, calls: () => calls };
}
const cfg = { teamDomain: 'sensei.cloudflareaccess.com', aud: 'AUD123', emails: 'jerry.thomas@senecaglobal.com, hi@sensei-hq.com' };
const now = 1_793_600_000_000, exp = now / 1000 + 600;

describe('/admin: the owner only', () => {
  beforeEach(() => resetAccessCache());
  it('covers the page and its API, nothing else', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/api/admin/invites')).toBe(true);
    expect(isAdminPath('/administer')).toBe(false);
    expect(isAdminPath('/workshop')).toBe(false);
  });
  it('lets in a valid token for an allowed email', async () => {
    const t = await setup();
    expect(await adminEmail(await t.sign({ aud: ['AUD123'], email: 'Jerry.Thomas@senecaglobal.com', exp }), cfg, t.fetchFn, now)).toBe('jerry.thomas@senecaglobal.com');
  });
  it('refuses: another email, another app, expired, forged, unknown key, no token, no config', async () => {
    const t = await setup();
    expect(await adminEmail(await t.sign({ aud: ['AUD123'], email: 'someone@else.com', exp }), cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(await t.sign({ aud: ['OTHER'], email: 'hi@sensei-hq.com', exp }), cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(await t.sign({ aud: 'AUD123', email: 'hi@sensei-hq.com', exp: now / 1000 - 1 }), cfg, t.fetchFn, now)).toBeNull();
    const good = await t.sign({ aud: 'AUD123', email: 'hi@sensei-hq.com', exp });
    const [h, , s] = good.split('.');
    expect(await adminEmail(`${h}.${enc({ aud: 'AUD123', email: 'hi@sensei-hq.com', exp: exp + 9999 })}.${s}`, cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(await t.sign({ aud: 'AUD123', email: 'hi@sensei-hq.com', exp }, 'k2'), cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(null, cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(good, { ...cfg, aud: '' }, t.fetchFn, now)).toBeNull();
    expect(await adminEmail('not.a.jwt', cfg, t.fetchFn, now)).toBeNull();
    expect(await adminEmail(good, cfg, t.fetchFn, now)).toBe('hi@sensei-hq.com');
  });
  it('takes either app’s tag when /admin and /api/admin are two Access apps', async () => {
    const t = await setup(), two = { ...cfg, aud: 'AUD-PAGE, AUD123' };
    expect(await adminEmail(await t.sign({ aud: ['AUD123'], email: 'hi@sensei-hq.com', exp }), two, t.fetchFn, now)).toBe('hi@sensei-hq.com');
    expect(await adminEmail(await t.sign({ aud: ['AUD-PAGE'], email: 'hi@sensei-hq.com', exp }), two, t.fetchFn, now)).toBe('hi@sensei-hq.com');
    expect(await adminEmail(await t.sign({ aud: ['AUD-OTHER'], email: 'hi@sensei-hq.com', exp }), two, t.fetchFn, now)).toBeNull();
  });
  it('fetches the team keys once an hour, not per request', async () => {
    const t = await setup();
    const tok = await t.sign({ aud: 'AUD123', email: 'hi@sensei-hq.com', exp });
    await adminEmail(tok, cfg, t.fetchFn, now); await adminEmail(tok, cfg, t.fetchFn, now + 1000);
    expect(t.calls()).toBe(1);
  });
});
