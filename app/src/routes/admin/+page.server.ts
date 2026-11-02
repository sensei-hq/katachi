import { fail } from '@sveltejs/kit';
import { createInvite, extend, isEmail, listInvites, listRequests, setActive, setRequestStatus, strayHits, type Db } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

// /admin (owner only — hooks.server.ts checks the Cloudflare Access token): the request queue, every invite with
// its hits and spend, and stray attempts on codes that don't exist.
const dbOf = (platform: App.Platform | undefined): Db | null => platform?.env?.DB ?? null;

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = dbOf(platform);
  if (!db) return { admin: locals.admin, ready: false as const, requests: [], invites: [], stray: [] };
  const [requests, invites, stray] = await Promise.all([listRequests(db), listInvites(db), strayHits(db)]);
  return { admin: locals.admin, ready: true as const, requests, invites, stray };
};

const num = (v: FormDataEntryValue | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const actions: Actions = {
  create: async ({ request, platform }) => {
    const db = dbOf(platform); if (!db) return fail(503, { error: 'No database bound' });
    const f = await request.formData();
    const email = String(f.get('email') ?? '');
    if (!isEmail(email)) return fail(400, { error: 'Enter a valid email' });
    const requestId = Number(f.get('request')) || undefined;
    try {
      const inv = await createInvite(db, { email, days: num(f.get('days'), 14), capUsd: num(f.get('cap'), 1), label: String(f.get('label') ?? ''), requestId });
      return { created: inv };
    } catch (e) {
      return fail(400, { error: `Couldn’t create it: ${(e as Error).message}` });
    }
  },
  decline: async ({ request, platform }) => {
    const db = dbOf(platform); if (!db) return fail(503, { error: 'No database bound' });
    await setRequestStatus(db, Number((await request.formData()).get('request')), 'declined');
  },
  toggle: async ({ request, platform }) => {
    const db = dbOf(platform); if (!db) return fail(503, { error: 'No database bound' });
    const f = await request.formData();
    await setActive(db, String(f.get('code')), f.get('active') === '1');
  },
  extend: async ({ request, platform }) => {
    const db = dbOf(platform); if (!db) return fail(503, { error: 'No database bound' });
    const f = await request.formData();
    await extend(db, String(f.get('code')), num(f.get('days'), 7));
  }
};
