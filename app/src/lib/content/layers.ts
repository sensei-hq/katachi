// Image → layers flow: copy and fixture data only (no markup). Flow, copy and state model follow the
// design mock; the example subject is the app's own "Mountain sunset", drawn in code by
// components/illustrations/LayeredScene.svelte. (The mock's reference photos are third-party listings
// and never ship.) Stages follow docs/design/01-image-pipeline.md.

export type LayerSetId = 'paper' | 'wood';
export type LayerShape = 'sky' | 'sun' | 'far' | 'ridge' | 'hills' | 'pines';
/** One cut layer: one or more shapes (islands) in one colour and material. A merged layer keeps its parts so Split can restore them. */
export interface Layer { n: number; name: string; shapes: LayerShape[]; colour: string; visiblePct: number; hiddenPct: number; material: string; flag?: string; parts?: Layer[]; /** the SAM region this layer was built from (its traced paths + photo colour) */ regionId?: string; /** owning item in a multiple-items photo (bookmarks etc.) */ itemName?: string; /** the layer's sliders (detail 1 blocky … 5 fine, weight -3 … +3) once moved */ tune?: { detail: number; weight: number }; /** separate items: cut through, or engraved (engraving runs first) */ role?: 'cut' | 'engrave'; /** a sheet read from a cut plan (3D kits): its index in the plan */ planSheet?: number; /** the item's frame is flipped over (e2e hook only; views don't mirror yet) */ flipped?: boolean }
/** a layer's name without a model's own numbering ("Layer 4 - Gold Vine Skeleton" → "Gold Vine Skeleton"): the
 *  stack order is the position, so the name never carries a number */
export function cleanLayerName(name: string): string { return name.replace(/^\s*layer\s*\d+\s*(\((back|mid|front)\))?\s*[-–—:·.)]?\s*/i, '').trim() || name; }
export interface LayerSet {
  label: string; project: string; headline: string; device: string; spacer: string; mmPerLayer: number;
  /** layers that carry the stack under the "smart" gap rule (doc 01 · S6) */
  structural: number[];
  layers: Layer[];
}

type Row = [name: string, shape: LayerShape, colour: string, visiblePct: number, hiddenPct: number, material: string, flag?: string];
const build = (rows: Row[]): Layer[] => rows.map(([name, shape, colour, visiblePct, hiddenPct, material, flag], i) => ({ n: i + 1, name, shapes: [shape], colour, visiblePct, hiddenPct, material, ...(flag ? { flag } : {}) }));

export const layerSets: Record<LayerSetId, LayerSet> = {
  paper: {
    label: 'Paper layers', project: 'Mountain sunset', headline: '6 sheets of cardstock, colour-matched',
    device: 'Cricut Maker or diode laser at 8% · 12 × 12 in', spacer: '1.5 mm foam dots between layers for depth', mmPerLayer: 1.8,
    structural: [1, 5, 6],
    layers: build([
      ['Sky', 'sky', '#F2B880', 22.0, 78.0, 'Apricot cardstock'],
      ['Sun', 'sun', '#F7DFA8', 2.4, 0.6, 'Butter cardstock'],
      ['Far peaks', 'far', '#9AA9B8', 14.6, 61.2, 'Slate blue'],
      ['Snow ridge', 'ridge', '#E6E2D8', 9.8, 52.4, 'Cream cardstock', 'Thin ridge line under 1 mm in two places'],
      ['Hills', 'hills', '#7C8C5E', 21.5, 30.1, 'Sage'],
      ['Front pines', 'pines', '#2F3F2E', 29.7, 0.0, 'Black-green']
    ])
  },
  wood: {
    label: 'Laser wood + paint', project: 'Mountain sunset', headline: '5 layers of 3 mm birch, stain + paint',
    device: 'xTool S1 · 300 × 300 mm · paint before glue-up', spacer: 'Glued flush · 3 mm per layer, 15 mm deep', mmPerLayer: 3,
    structural: [1, 5],
    layers: build([
      ['Back panel', 'sky', '#8A6A4F', 24.4, 75.6, '3 mm birch · walnut stain'],
      ['Sun', 'sun', '#D9A066', 2.4, 0.6, '3 mm birch · ochre paint'],
      ['Mountains', 'far', '#A07E5E', 24.4, 58.0, '3 mm birch · mid stain'],
      ['Hills', 'hills', '#6F5640', 21.5, 30.1, '3 mm birch · dark stain'],
      ['Front pines', 'pines', '#3B2E24', 27.3, 0.0, '3 mm birch · ebony stain']
    ])
  }
};

export type RegionId = 'frame' | 'sky' | 'sun' | 'mountains' | 'trees';
export type Tone = 'muted' | 'warn' | 'accent' | 'ok' | 'ink';
/** tone is a semantic colour role, never a raw colour */
export const regions: { id: RegionId; name: string; pct: number; note: string; tone: Tone; keep: boolean }[] = [
  { id: 'frame', name: 'Frame ring', pct: 12.6, note: 'Embroidery hoop · looks bought', tone: 'muted', keep: false },
  { id: 'sky', name: 'Sky', pct: 21.4, note: 'Flat apricot · back layer', tone: 'warn', keep: true },
  { id: 'sun', name: 'Sun', pct: 2.4, note: 'Small disc · could raise on a spacer', tone: 'accent', keep: true },
  { id: 'mountains', name: 'Mountains', pct: 24.4, note: 'Peaks and a snow ridge · 2 tones', tone: 'ok', keep: true },
  { id: 'trees', name: 'Hills and pines', pct: 39.2, note: '2 depths of green', tone: 'ink', keep: true }
];

export const steps = [
  { id: 'import', label: 'Import', path: '/make/import' },
  { id: 'cutout', label: 'Cutout', path: '/make/cutout' },
  { id: 'segment', label: 'Segment', path: '/make/segment' },
  { id: 'layers', label: 'Layers', path: '/make/layers' },
  { id: 'gaps', label: 'Gaps', path: '/make/gaps' },
  { id: 'output', label: 'Output', path: '/make/output' },
  { id: 'assemble', label: 'Assemble', path: '/make/assemble' }
] as const;
export type StepId = (typeof steps)[number]['id'];

export type Kind = 'flat' | '3d' | 'ref';
export const kinds: { id: Kind; label: string; hint: string; next: string }[] = [
  { id: 'flat', label: 'Flat · layered art', hint: 'Paper, wood or acrylic layers stacked for depth. One photo is enough.', next: '/make/cutout' },
  { id: '3d', label: '3D object · 6 views', hint: 'A real object to rebuild in parts. I will ask for front, back, sides, top and bottom.', next: '/make/views' },
  { id: 'ref', label: 'Reference + changes', hint: 'Use this as the starting point and tell me what to change.', next: '/make/reference' }
];

/** D1 · "make it as" (the image itself comes in through Capture). */
export type MakeAs = 'auto' | 'paper' | 'wood' | 'acrylic';
export const makeAs: { id: MakeAs; label: string }[] = [
  { id: 'auto', label: 'Let Katachi pick' }, { id: 'paper', label: 'Paper layers' }, { id: 'wood', label: 'Laser wood' }, { id: 'acrylic', label: 'Acrylic' }
];
export type SegmentView = 'masks' | 'cutout' | 'original';
export type RefineTool = 'pick' | 'box' | 'brush-add' | 'brush-erase';
export const refineTools: { id: RefineTool; label: string }[] = [
  { id: 'pick', label: 'Click to pick' }, { id: 'box', label: 'Box' }, { id: 'brush-add', label: 'Brush +' }, { id: 'brush-erase', label: 'Brush −' }
];

export type GapChoice = 'extend' | 'leave' | 'imagine' | 'draw';
export const gapChoices: { id: GapChoice; label: string; hint: string; tag: string }[] = [
  { id: 'extend', label: 'Extend behind', hint: 'One solid sheet — sturdy, uses more paper', tag: 'default' },
  { id: 'leave', label: 'Leave it open', hint: 'Cut only what shows, plus a 3 mm glue lip', tag: '−60% paper' },
  { id: 'imagine', label: 'Let Katachi imagine it', hint: 'Inpaint what peeks through if you shift layers', tag: '≈ $0.01' },
  { id: 'draw', label: "I'll draw it", hint: 'Open this layer in the editor', tag: '' }
];

export type GapRule = 'extend' | 'smart' | 'leave';
export const gapRules: { id: GapRule; label: string; hint: string }[] = [
  { id: 'extend', label: 'Extend every layer', hint: 'Solid sheets, strongest stack' },
  { id: 'smart', label: "Katachi's mix", hint: 'Solid where it carries weight, open elsewhere' },
  { id: 'leave', label: 'Leave all open', hint: 'Least material, needs a backing board' }
];

export type ViewId = 'front' | 'right' | 'back' | 'left' | 'top' | 'base';
export const views: { id: ViewId; label: string }[] = [
  { id: 'front', label: 'Front' }, { id: 'right', label: 'Right' }, { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' }, { id: 'top', label: 'Top' }, { id: 'base', label: 'Base' }
];

export type Joinery = 'finger' | 'butt' | 'tabs';
export const joinery: { id: Joinery; label: string }[] = [{ id: 'finger', label: 'Finger joints' }, { id: 'butt', label: 'Butt + glue' }, { id: 'tabs', label: 'Tabs' }];

export const changes = [
  { n: 1, label: 'Sun → crescent moon', where: 'L2 sun' },
  { n: 2, label: 'Small cabin on the hills', where: 'L5 hills' },
  { n: 3, label: 'Scale to Ø 300 mm', where: 'all layers' }
];

export type DeviceId = 'cricut' | 'xtool' | 'glowforge' | 'file';
export const devices: { id: DeviceId; label: string; adapter: string; status: string; format: string; settings: string; time: string; cta: string; bed?: string; kind?: string }[] = [
  { id: 'cricut', label: 'Cricut Maker 3', adapter: 'blade · cricut-svg · design-space', status: 'paired', bed: '12 × 12 in mat', kind: 'Blade cutter', format: 'SVG · one mat per layer', settings: 'Medium cardstock · 2 passes', time: '≈ 22 min', cta: 'Send' },
  { id: 'xtool', label: 'xTool S1 laser', adapter: 'laser · svg-colour-ops · lan-http', status: 'online', bed: '300 × 300 mm', kind: 'Diode laser', format: 'SVG · cut + score', settings: '10 W · 8% power · 300 mm/s', time: '≈ 12 min', cta: 'Cut' },
  { id: 'glowforge', label: 'Glowforge Pro', adapter: 'laser · svg · cloud', status: 'offline', bed: '495 × 279 mm', kind: 'CO₂ laser', format: 'SVG · Proofgrade', settings: 'Uncertified cardstock', time: '≈ 16 min', cta: 'Queue' },
  { id: 'file', label: 'Just the files', adapter: 'export · download', status: '', format: 'SVG · DXF · PDF', settings: '—', time: '—', cta: 'Export files' }
];

/** Katachi's guidance as each step opens (chat), with suggestions for the composer. */
export const guide: Record<StepId, { text: string; chips: string[] }> = {
  import: { text: 'Looks like layered paper art in a round hoop. I’ll lift it off the wall, then split it into the parts you’d cut.', chips: ['It’s 3D', 'Change it first'] },
  cutout: { text: 'Background removed and the outline found: a circle, about Ø 300 mm. Check the edge, then I’ll find the objects.', chips: ['Erase the shadow', 'It’s square, not round'] },
  segment: { text: 'I found 5 regions. Which should become parts? The hoop looks bought, so I left it out — toggle any region, or click the image to add one.', chips: ['Keep the hoop', 'Raise the sun on a spacer', 'Split the mountains'] },
  layers: { text: 'Six colour groups, back to front. Pick a layer to see what shows and what hides behind the ones in front.', chips: ['Merge sun and sky', 'Split the hills'] },
  gaps: { text: 'Most back layers are hidden behind the ones in front. I’d keep the sky and the front two solid as the structure and open the rest.', chips: ['Do that', 'Imagine the hidden parts'] },
  output: { text: 'Sheets are ready, each with 3 registration holes so the stack lines up on pins. Pick a device to send to.', chips: ['Just the files', 'How long will it take?'] },
  assemble: { text: 'Here’s how it goes together, one step at a time. Tick each step off, then save the craft so you can find it again.', chips: ['What glue should I use?', 'Make the steps shorter'] }
};

export const copy = {
  import: {
    title: 'New from an image', sub: 'import · upload or snap', file: 'mountain-sunset.png', fileMeta: '2048 × 2048 · from Photos',
    what: 'What is it?',
    agent: 'Looks like layered paper art in a round hoop. I’ll lift it off the wall, then split it into the parts you’d cut.',
    change: 'Change it first', next: 'Find the outline',
    makeAs: 'Make it as',
    privacy: 'Images never leave your workspace without asking. Analysis runs on Muse; cut paths are computed locally.'
  },
  cutout: {
    sub: 'cutout · background removed', original: 'Original', cutout: 'Cutout',
    checks: [
      { status: 'pass', text: 'Wall removed · SAM 3.1' },
      { status: 'pass', text: 'Outline · circle, 2% off round · Ø 300 mm?' },
      { status: 'warn', text: 'Shadow on the lower edge · erase?' }
    ],
    touch: 'Touch up edge', next: 'Find the objects'
  },
  segment: { sub: 'segment · 5 regions', agent: 'I found 5 regions. Which should become parts? The hoop looks bought — I left it out.', next: 'Separate into layers', background: 'Wall and shadow' },
  layers: { sub: 'layers · colour groups', order: 'Back → front', next: 'Fill the gaps' },
  gaps: {
    sub: 'gaps · what sits behind',
    agent: 'Most of the back layers are hidden behind the ones in front. The photo can’t show what’s there — how should I fill it?',
    all: 'Use this for all layers', rule: 'Rule for all layers', next: 'Stack & cut'
  },
  output: {
    sub: 'output · sheets ready', export: 'Export files',
    rows: [['Registration', '3 pin holes per sheet'], ['Stack', 'Ø 300 · back → front']] as [string, string][],
    assembly: ['Glue sheet 01 to a backing board.', 'Foam dots (1.5 mm) on each sheet, back to front.', 'Seat the sun on a double spacer.']
  },
  views: { title: 'Birdhouse', sub: 'parts & joins · 6 sides', shutter: 'Take this view', done: 'All 6 views captured', allIn: 'All sides in. I can unfold it into flat parts now.' },
  reference: {
    title: 'Mountain sunset · remix', sub: 'reference + changes',
    ask: 'Swap the sun for a crescent moon, add a small cabin on the hills, and make it 30 cm.',
    reply: 'Keeping your layer order. Only two layers change:', next: 'See layers'
  }
};
