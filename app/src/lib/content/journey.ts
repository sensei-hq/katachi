// The craft journey (docs/design/07-ux-journey-review.md §1, design/10–11): capture, then the craft's own steps, the same names everywhere —
// the phone step strip, the studio step tabs, Katachi's step messages and a saved craft's progress.
// Each step owns one or more routes; the first route is where its tab links.
import type { CaptureMode, CaptureSource } from './capture';
import type { Kind } from './layers';

export type JourneyId = 'capture' | 'layers' | 'cut' | 'assemble';
export interface JourneyStep { id: JourneyId; label: string; path: string; routes: readonly string[]; hint: string }

export const journey: readonly JourneyStep[] = [
  { id: 'capture', label: 'Capture', path: '/capture', routes: ['/capture'], hint: 'Snap, upload or sketch it' },
  // Analyze lands on Layers: the background, the items and their layers are worked out there, live
  { id: 'layers', label: 'Layers', path: '/make/layers', routes: ['/make/layers', '/make/reference', '/make/gaps', '/make/views'], hint: 'The items in it, each split into layers' },
  // the sheets: preview each one, then cut them one at a time (a virtual run until a device is connected)
  { id: 'cut', label: 'Cut', path: '/make/output', routes: ['/make/output'], hint: 'Preview each sheet, then cut it' },
  { id: 'assemble', label: 'Assemble', path: '/make/assemble', routes: ['/make/assemble'], hint: 'Put it together, then save' }
];

/** The journey step a path belongs to, or null outside the craft flow. */
export function journeyStepFor(path: string): JourneyStep | null {
  return journey.find((s) => s.routes.includes(path)) ?? null;
}

const routeNames: Record<string, string> = {
  '/make/reference': 'changes', '/make/layers': 'items & layers', '/make/gaps': 'gaps', '/make/views': 'parts & joins'
};

/** Phone strip: "02 / 04 · Layers · items & layers", the next step's name and where back goes. */
export function journeyStrip(path: string, kind: Kind = 'flat'): { n: number; total: number; label: string; sub: string; next: string | null } | null {
  const s = journeyStepFor(path);
  if (!s) return null;
  const i = journey.indexOf(s);
  const next = journey[i + 1];
  return { n: i + 1, total: journey.length, label: s.label, sub: routeNames[path] ?? '', next: next ? (next.id === 'layers' && kind === '3d' ? 'parts & joins' : next.label.toLowerCase()) : null };
}

/** The step's tab target for this craft: 3D crafts open Layers on their parts & joins. */
export function journeyPath(step: JourneyStep, kind: Kind): string {
  return step.id === 'layers' && kind === '3d' ? '/make/views' : step.path;
}

/** How far a craft got, as a journey step index (0 = Capture … 3 = Assemble) from the saved project. */
export function journeyIndexOf(path: string): number {
  const s = journeyStepFor(path);
  return s ? journey.indexOf(s) : 0;
}

// ── Starting a craft (Home): four starting points; typed or spoken intent picks one.
export type StartId = 'flat' | '3d' | 'ref' | 'sketch';
export interface Start { id: StartId; label: string; hint: string; icon: string; kind: Kind; mode: CaptureMode; source: CaptureSource; say: string }
export const starts: readonly Start[] = [
  { id: 'flat', label: 'Layered picture', hint: 'A photo or artwork, cut into layers that stack for depth', icon: 'i-solar:layers-linear', kind: 'flat', mode: 'single', source: 'upload',
    say: 'A layered picture. Snap or upload the image and I’ll split it into layers you can cut.' },
  { id: '3d', label: '3D object', hint: 'A real object rebuilt from flat parts joined together', icon: 'i-solar:box-linear', kind: '3d', mode: 'multi', source: 'camera',
    say: 'A 3D object. Take a few pictures from different sides — any number, in any order; I’ll work out which side each shows and unfold it into parts with joints.' },
  { id: 'ref', label: 'Remix a picture', hint: 'Start from something you like and tell Katachi what to change', icon: 'i-solar:magic-stick-2-linear', kind: 'ref', mode: 'single', source: 'upload',
    say: 'A remix. Show me the picture, then tell me what to change.' },
  { id: 'sketch', label: 'Sketch it', hint: 'Draw it yourself; Katachi cleans it up and splits it', icon: 'i-solar:pen-new-square-linear', kind: 'flat', mode: 'single', source: 'sketch',
    say: 'Sketch it right here — a rough drawing is fine. I’ll find the shapes and turn them into layers.' }
];

/** Typed or spoken intent → a starting point (keywords until Spark classifies it; R-CV-5). */
export function startFor(text: string): Start {
  const t = text.toLowerCase();
  const pick = (id: StartId) => starts.find((s) => s.id === id)!;
  if (/\b(sketch|draw|doodle)\b/.test(t)) return pick('sketch');
  if (/\b(3d|box|birdhouse|house|object|holder|stand|lamp|model|six sides|6 sides)\b/.test(t)) return pick('3d');
  if (/\b(remix|change|like this|reference|but with|instead)\b/.test(t)) return pick('ref');
  return pick('flat');
}

/** The landing's How it works band: what happens at each step and which Muse model does it. */
export const howItWorks: readonly { title: string; body: string; models: readonly string[] }[] = [
  { title: 'Say what you’re making', body: 'Talk or type. Katachi asks only what it needs.', models: ['Voice Transcribe', 'Muse Spark'] },
  { title: 'Snap, upload or sketch', body: 'One photo for a picture, six sides for an object.', models: ['Muse Spark'] },
  { title: 'Analyze: items and layers', body: 'The background goes, each item is found and split into layers — live, in the chat.', models: ['SAM 3.1', 'Muse Spark'] },
  { title: 'Cut the sheets', body: 'Sized sheets for your laser or Cricut, one at a time.', models: ['your device'] },
  { title: 'Assemble and keep it', body: 'Step-by-step instructions, saved with the craft.', models: ['Muse Spark'] }
];
