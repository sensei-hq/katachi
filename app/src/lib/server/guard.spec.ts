import { describe, it, expect } from 'vitest';
import { checkInvite, BudgetGuard, inviteCodes, isPublicPath, signSession, verifySession } from './guard';
describe('invite + budget guard (R-PL-2/4/7)', () => {
  it('accepts seeded invite, rejects wrong code and missing attestation', () => {
    expect(checkInvite('DEMO-JUDGES', true, ['DEMO-JUDGES']).ok).toBe(true);
    expect(checkInvite('NOPE', true, ['DEMO-JUDGES']).ok).toBe(false);
    expect(checkInvite('DEMO-JUDGES', false, ['DEMO-JUDGES']).ok).toBe(false);
  });
  it('trips at cap and kill switch blocks everything', () => {
    const g = new BudgetGuard(1, 10);
    g.charge(0.6); expect(g.tripped).toBe(false);
    g.charge(0.5); expect(g.tripped).toBe(true);
    const k = new BudgetGuard(1, 10, true); expect(k.blocked).toBe(true);
  });
  it('retries 429 with backoff then succeeds', async () => {
    let n = 0;
    const r = await BudgetGuard.withRetry(async () => { n++; if (n < 3) throw Object.assign(new Error('rate'), { status: 429 }); return 'ok'; }, 3, 1);
    expect(r).toBe('ok'); expect(n).toBe(3);
  });
  it('invite codes come only from the secret — no built-in defaults', () => {
    expect(inviteCodes(undefined)).toEqual([]);
    expect(inviteCodes(' A-1 , B-2,,')).toEqual(['A-1', 'B-2']);
    expect(checkInvite('DEMO-JUDGES', true, inviteCodes(undefined)).ok).toBe(false);
  });
  it('says which part is wrong', () => {
    expect(checkInvite('  ', true, ['A']).reason).toBe('Enter your invite code');
    expect(checkInvite('A', false, ['A']).reason).toBe('Confirm you are 18 or over');
    expect(checkInvite('B', true, ['A']).reason).toBe('That invite code isn’t valid');
  });
  it('a signed session verifies; tampering, another secret or garbage do not', async () => {
    const t = await signSession('abc', 's1');
    expect(await verifySession(t, 's1')).toBe('abc');
    expect(await verifySession(t.replace('abc', 'abd'), 's1')).toBeNull();
    expect(await verifySession(t, 's2')).toBeNull();
    expect(await verifySession('garbage', 's1')).toBeNull();
    expect(await verifySession(undefined, 's1')).toBeNull();
  });
  it('only the gate, its API and static files are public', () => {
    for (const p of ['/', '/api/gate', '/api/version', '/_app/immutable/x.js', '/favicon.svg', '/manifest.webmanifest', '/service-worker.js']) expect(isPublicPath(p)).toBe(true);
    for (const p of ['/workshop', '/make/layers', '/api/scene', '/capture']) expect(isPublicPath(p)).toBe(false);
    for (const p of ['/story', '/slides', '/docs', '/roadmap', '/terms-of-service', '/privacy-policy', '/story/cat-photo.jpg', '/film/katachi-demo.mp4', '/katachi-deck.pptx', '/samples/katachi-sample-cat.jpg']) expect(isPublicPath(p)).toBe(true);
    for (const p of ['/story/../workshop', '/film/x/y.mp4', '/storyline', '/samples/../admin']) expect(isPublicPath(p)).toBe(false);
  });
});
