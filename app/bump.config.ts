import { defineConfig } from 'bumpp';

// `bun run bump` (in app/), or `bun run bump --patch|--minor|--major` (sensei convention): pick the level, bump package.json, commit "release: vX.Y.Z" and tag it.
// Pushing stays a separate, deliberate step: `git push --follow-tags`.
export default defineConfig({
  files: ['package.json'],
  commit: 'release: v%s',
  tag: 'v%s',
  push: false,
  all: false
});
