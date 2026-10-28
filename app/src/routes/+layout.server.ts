import type { LayoutServerLoad } from './$types';

/** The signed session id is the user_id (invite code); the client binds its storage namespace to it. */
export const load: LayoutServerLoad = ({ locals }) => ({ userId: locals.session?.id ?? null });
