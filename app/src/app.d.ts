/// <reference types="@sveltejs/kit" />
import type { Db } from '$lib/server/invites';
declare global {
  namespace App {
    interface Locals { session: { id: string } | null; admin?: string }
    /** Cloudflare bindings (wrangler.jsonc): DB = D1 invites, EMAIL = send_email to the request inbox */
    interface Platform {
      env?: { DB?: Db; EMAIL?: { send(message: unknown): Promise<void> } };
      ctx?: { waitUntil(p: Promise<unknown>): void };
    }
  }
  /** package.json version, git commit and build time, compiled in by vite (build-info.js) */
  const __APP_VERSION__: string;
  const __APP_COMMIT__: string;
  const __APP_BUILT_AT__: string;
}
export {};
