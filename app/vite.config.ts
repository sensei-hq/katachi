import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import UnoCSS from '@unocss/vite';
import { buildDefine } from './build-info.js';
export default defineConfig({
  plugins: [UnoCSS(), sveltekit()],
  define: buildDefine(),
  optimizeDeps: { exclude: ['@rokkit/app', '@rokkit/ui', '@rokkit/states', '@rokkit/actions'] }
});
