/// <reference types="@sveltejs/kit" />
declare global {
  namespace App { interface Locals { session: { id: string } | null } }
  /** package.json version, git commit and build time, compiled in by vite (build-info.js) */
  const __APP_VERSION__: string;
  const __APP_COMMIT__: string;
  const __APP_BUILT_AT__: string;
}
export {};
