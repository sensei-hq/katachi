import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import UnoCSS from '@unocss/vite';
import { buildDefine } from './build-info.js';
export default defineConfig({
  plugins: [UnoCSS(), sveltekit()],
  define: buildDefine(),
  test: { include: ['src/**/*.{test,spec}.{ts,js}'], environment: 'jsdom', coverage: { provider: 'v8', include: ['src/lib/domain/**','src/lib/devices/**','src/lib/state/**'], exclude: ['src/lib/state/photo.ts', 'src/lib/state/media-store.ts', 'src/lib/domain/layering.worker.ts', '**/*.spec.ts'], thresholds: { lines: 90, functions: 85 } } }
});
