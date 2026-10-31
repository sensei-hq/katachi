// The app's version for the UI and /api/version: package.json's version (bumped with `bun run release`),
// the git commit and the build time. Compiled in as constants (vite `define`), so no runtime file reads.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

export function buildInfo() {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  let commit = process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? '';
  if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
  let dirty = false;
  try { dirty = execSync('git status --porcelain -- .', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0; } catch { /* not a git checkout */ }
  return { version, commit: dirty ? `${commit}+dev` : commit, builtAt: new Date().toISOString() };
}
export function buildDefine() {
  const b = buildInfo();
  return { __APP_VERSION__: JSON.stringify(b.version), __APP_COMMIT__: JSON.stringify(b.commit), __APP_BUILT_AT__: JSON.stringify(b.builtAt) };
}
