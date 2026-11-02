import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const presentation = ['src/lib/components', 'src/routes'];
// Illustrations draw stand-ins for photographs (wood, mug, card); raw colour is the subject there, not UI chrome.
const illustrations = 'src/lib/components/illustrations';

const rawColour = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/;
const inlineColourStyle = /style="[^"]*\b(?:color|background|border(?:-[a-z]+)?|outline|fill|stroke)\s*:/;
const emojiIcon = /[\u{1F300}-\u{1FAFF}☀-➿]/u;

const failures = { fetch: [], colour: [], style: [], emoji: [], state: [], link: [], workerGlobal: [], agents: [] };
// Rokkit Button renders target="_self" by default; SvelteKit treats any target as external and reloads
// the page (wiping AppState). Every Button link must pass target="".
const buttonLink = /<Button\b[^\n]*\bhref=/;
// Pages read the shared AppState (useApp()); only the snap layout constructs state.
const stateOwner = 'src/routes/+layout.svelte';
const newState = /new [A-Z][A-Za-z]*State\(/;
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(svelte|ts)$/.test(n) || /\.spec\.ts$/.test(n) || p.includes('+server') || /\.server\.ts$/.test(n)) continue;
    const t = readFileSync(p, 'utf8');
    if (/fetch\(|\$lib\/server/.test(t)) failures.fetch.push(p);
    if (p.startsWith('src/routes') && p !== stateOwner && newState.test(t)) failures.state.push(p);
    // Models and agents are reached only through AppState methods (MuseAgents lives in lib/state).
    if (/\.muse\.|state\/muse|FileReader|getContext\('2d'\)\.drawImage/.test(t) && !p.includes('SketchPad')) failures.agents.push(p);
    if (!n.endsWith('.svelte') || p.startsWith(illustrations)) continue;
    t.split('\n').forEach((line, i) => {
      const at = `${p}:${i + 1}`;
      if (rawColour.test(line)) failures.colour.push(at);
      if (inlineColourStyle.test(line)) failures.style.push(at);
      if (emojiIcon.test(line)) failures.emoji.push(at);
      if (buttonLink.test(line) && !/target=""/.test(line)) failures.link.push(at);
    });
  }
}
presentation.forEach(walk);

// Cloudflare Workers forbid random values, timers and I/O in global scope: the whole Worker fails to start (error 1101).
// Server modules may only do these inside a function. Top-level statements are the lines that start at column 0.
const serverFiles = ['src/hooks.server.ts'];
(function collect(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) collect(p);
    else if (/\.ts$/.test(n) && !/\.spec\.ts$/.test(n) && (p.startsWith('src/lib/server') || n === '+server.ts')) serverFiles.push(p);
  }
})('src');
const workerGlobal = /\b(randomUUID|getRandomValues|Math\.random|setTimeout|setInterval|fetch)\s*\(/;
for (const p of serverFiles) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (/^(const|let|var|export (const|let))\b/.test(line) && !/=>|function/.test(line) && workerGlobal.test(line)) failures.workerGlobal.push(`${p}:${i + 1}`);
  });
}

const messages = {
  fetch: 'fetch/server import in presentation',
  colour: 'raw colour literal outside src/lib/components/illustrations (use a named token)',
  style: 'inline colour style (use token utilities: bg-paper, text-ink-mute, border-paper-edge…)',
  emoji: 'emoji used as an icon (use a Solar icon class)',
  state: 'page constructs its own state (read the shared AppState via useApp())',
  link: 'Rokkit Button link without target="" (its default target="_self" makes SvelteKit reload the page)',
  workerGlobal: 'random value, timer or fetch in a server module\'s global scope (Workers refuse to start: error 1101)',
  agents: 'presentation reaches a model/agent or does media I/O itself (call an AppState method; MuseAgents and file reading live in lib/state)'
};
let failed = false;
for (const [k, list] of Object.entries(failures)) {
  if (!list.length) continue;
  failed = true;
  console.error(`Architecture violation — ${messages[k]}:\n  ${list.join('\n  ')}`);
}
if (failed) process.exit(1);
console.log('arch ok: presentation has no fetch/server imports, raw colours, inline colour styles or emoji icons');
