import { readFileSync } from 'node:fs';

/** A valid invite code for the e2e run: SNAP_INVITE_CODES from the environment or app/.env (never hardcoded). */
export function inviteCode(): string {
  const raw = process.env.SNAP_INVITE_CODES ?? readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/^SNAP_INVITE_CODES=(.*)$/m)?.[1] ?? '';
  const code = raw.split(',').map((c) => c.trim()).find(Boolean);
  if (!code) throw new Error('Set SNAP_INVITE_CODES (app/.env) for the e2e run');
  return code;
}

/** Every invite code configured for the demo (each code is one user_id). */
export function inviteCodes(): string[] {
  const raw = process.env.SNAP_INVITE_CODES ?? readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/^SNAP_INVITE_CODES=(.*)$/m)?.[1] ?? '';
  return raw.split(',').map((c) => c.trim()).filter(Boolean);
}

/** True when the dev server can make live Muse calls. */
export function hasMetaKey(): boolean {
  if (process.env.META_API_KEY) return true;
  try { return /^META_API_KEY=\S+/m.test(readFileSync(new URL('../../.env', import.meta.url), 'utf8')); } catch { return false; }
}
