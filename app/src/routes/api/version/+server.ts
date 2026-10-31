import { json } from '@sveltejs/kit';
import { appBuiltAt, appCommit, appVersion } from '$lib/content/version';
/** Which build is deployed (public): `curl https://katachi.sensei-hq.com/api/version` */
export function GET() { return json({ version: appVersion, commit: appCommit, builtAt: appBuiltAt }); }
