// The public site around the app (no invite needed): the story, the slides, the docs, the roadmap and the policies.
// One source for the words, so the slideshow, the story page and the deck say the same thing.

export const siteLinks = [
  { href: '/story', label: 'Story' },
  { href: '/slides', label: 'Slides' },
  { href: '/docs', label: 'Docs' },
  { href: '/roadmap', label: 'Roadmap' }
] as const;
export const policyLinks = [
  { href: '/terms-of-service', label: 'Terms of service' },
  { href: '/privacy-policy', label: 'Privacy policy' }
] as const;

/** the demo film, hosted with the site (a static file: no video platform) */
export const film = { src: '/film/katachi-demo.mp4', captions: '/film/katachi-demo.vtt', poster: '/story/film-poster.jpg' };
export const deckFile = '/katachi-deck.pptx';

export interface Example { id: string; n: number; kind: string; title: string; photo: string; result: string; resultAlt: string; steps: string[]; stats: { value: string; label: string }[]; say: string; layers?: { src: string; name: string }[] }
export const examples: Example[] = [
  { id: 'cat', n: 1, kind: 'A layered cut', title: 'The paper cat', photo: '/story/cat-photo.jpg', result: '/story/cat-exploded.jpg', resultAlt: 'The cat’s layers lifted apart in the app',
    steps: ['Background off', 'The stack said in the chat', 'Five layers built to it', 'Cut and stacked'],
    stats: [{ value: '5', label: 'layers, each with the outline' }, { value: '$0.022', label: 'in Meta model calls' }, { value: '~1 min', label: 'photo to cut queue' }],
    say: 'Katachi lifts the paper cat off the wall. Then I say how to stack it: a solid white base, black with the whiskers cut through, red, the white flowers and gold on top, every layer keeping the outline. It builds the five sheets to that plan.',
    layers: [{ src: '/story/cat-layer-1.jpg', name: 'White base' }, { src: '/story/cat-layer-2.jpg', name: 'Black cat' }, { src: '/story/cat-layer-3.jpg', name: 'Red leaves' }, { src: '/story/cat-layer-4.jpg', name: 'White flowers' }, { src: '/story/cat-layer-5.jpg', name: 'Gold outline' }] },
  { id: 'earrings', n: 2, kind: 'A collage of crafts', title: 'Earring charms', photo: '/story/earrings-photo.jpg', result: '/story/earrings-before-after.jpg', resultAlt: 'Two earring pairs before and after the clean-up',
    steps: ['Every earring found', 'Pairs matched by shape', 'Repeated holes evened out', 'Each pair one size'],
    stats: [{ value: '28', label: 'pieces found on the tray' }, { value: 'Pairs', label: 'matched by shape, each one size' }, { value: '$0.032', label: 'in Meta model calls' }],
    say: 'From one tray photo it finds the earrings, matches the pairs by shape and cuts each pair to one size, with repeated holes evened out.' },
  { id: 'bookmarks', n: 3, kind: 'A set', title: 'Five bookmarks, one photo', photo: '/story/bookmarks-photo.jpg', result: '/story/bookmarks-five.jpg', resultAlt: 'The five bookmarks rebuilt, upright and one size',
    steps: ['Perspective corrected', 'Turned upright', 'Hidden edges rebuilt', 'Made one size'],
    stats: [{ value: '5', label: 'matching pieces' }, { value: '$0.021', label: 'in Meta model calls' }],
    say: 'Five bookmarks, overlapping and shot at an angle. Katachi corrects the perspective, stands each one upright, rebuilds the hidden edges, and makes all five one size.' }
];

export const why = [
  { icon: 'i-solar:user-rounded-linear', title: 'My world', body: 'Simple shapes were easy. Turning a picture I loved into cut files took hours.' },
  { icon: 'i-solar:users-group-rounded-linear', title: 'Millions like me', body: 'Lasers and Cricuts sit idle: the design step is the barrier, not the machine.' },
  { icon: 'i-solar:stars-linear', title: 'Meta models, my domain', body: 'Build for Your World: Meta’s models applied to a craft I know first-hand.' }
];
export const flow = [
  { icon: 'i-solar:camera-linear', title: 'Snap', body: 'A photo, a sketch, or several views' },
  { icon: 'i-solar:layers-linear', title: 'Analyze', body: 'Background off, items and layers found' },
  { icon: 'i-solar:magic-stick-3-linear', title: 'Clean up', body: 'Upright, perspective, gaps, smoothing' },
  { icon: 'i-solar:scissors-linear', title: 'Cut', body: 'Sheets per device, SVG · DXF · G-code' },
  { icon: 'i-solar:widget-add-linear', title: 'Assemble', body: 'Step by step, in stacking order' }
];
export const architecture = [
  { title: 'In the browser', sub: 'SvelteKit · the craft model', points: ['The craft: items, parts, cuts', 'All geometry, in code', 'SVG · DXF · G-code out'] },
  { title: 'On the edge', sub: 'Cloudflare Worker', points: ['The API key stays here', 'A budget per request', 'Every call and its cost logged'] },
  { title: 'Meta models', sub: 'Meta Model API', points: ['Muse Spark 1.3: reads, sizes, plans, understands requests', 'SAM 3.1: outlines every piece'] }
];
export const actionGroups = [
  { icon: 'i-solar:layers-minimalistic-linear', title: 'Structure', list: 'merge · delete · split · group' },
  { icon: 'i-solar:pen-new-square-linear', title: 'Geometry', list: 'flip · mirror · rotate · smooth · weld' },
  { icon: 'i-solar:crop-minimalistic-linear', title: 'Whole item', list: 'straighten · perspective · fill hidden · same size' },
  { icon: 'i-solar:broom-linear', title: 'Clean-up', list: 'tidy · even out patterns · symmetry' }
];
export const status = {
  works: ['Layered art split into colour layers', 'Items found, upright, paired, one size', 'Clean-up: smoothing, specks, patterns', 'Cut files for lasers and Cricuts'],
  gaps: ['Shadows can add stray cut lines', 'Hidden fretwork is rebuilt solid', 'Real size is an estimate', '3D kits from blurry plans are rough']
};
export const roadmap = [
  { when: 'Now', span: 'Next few weeks', items: [
    { title: 'One clean cut line per piece', body: 'Tell the shadow under a piece’s edge from a real hole, so each piece has a single outline.' },
    { title: 'True millimetres', body: 'A card or ruler in the photo sets the real scale, instead of an estimate.' },
    { title: 'Cut on real machines', body: 'Every example cut and checked on a diode laser and a Cricut.' }] },
  { when: 'Next', span: 'This quarter', items: [
    { title: 'Imagine hidden detail', body: 'Muse Image redraws the fretwork a neighbour hid, instead of rebuilding it solid.' },
    { title: 'Send to the cutter', body: 'Straight to xTool, Glowforge and Cricut, with a materials and settings library.' }] },
  { when: 'Later', span: 'After', items: [
    { title: '3D into flat-pack', body: 'Photos of an object from several sides become parts with joints.' },
    { title: 'Share and remix', body: 'Save crafts to an account, share them, and remix other makers’ pieces.' },
    { title: 'Offline', body: 'Smaller on-device models for the steps that don’t need the cloud.' }] }
];

/** the slideshow (the same deck as /katachi-deck.pptx), with its voiceover as speaker notes */
export type Slide =
  | { kind: 'title'; title: string; lines: string[]; notes: string }
  | { kind: 'why'; title: string; notes: string }
  | { kind: 'flow'; title: string; notes: string }
  | { kind: 'example'; title: string; example: string; notes: string }
  | { kind: 'architecture'; title: string; notes: string }
  | { kind: 'actions'; title: string; notes: string }
  | { kind: 'status'; title: string; notes: string }
  | { kind: 'roadmap'; title: string; notes: string }
  | { kind: 'close'; title: string; lines: string[]; notes: string };
export const slides: Slide[] = [
  { kind: 'title', title: 'Katachi', lines: ['From a photo to pieces you can cut', 'Show it. Say it. Make it.'], notes: 'I’m Jerry. I own a desktop laser, and Katachi is the tool I wished I had: show it a photo you love, and get pieces you can cut. It’s a prototype, built this week on Meta’s models, and this film was made with Muse Code, generated voice included.' },
  { kind: 'why', title: 'Cutting is easy; designing the cut is hard', notes: 'When I got my laser, cutting simple shapes was easy. Turning a picture into cut files took hours of tracing and guessing. So I brought Meta’s models into a craft I know first-hand.' },
  { kind: 'flow', title: 'What it does: one photo in, cut-ready sheets out', notes: 'Snap a photo. Katachi finds the items and layers, cleans them up, lays out sheets for your machine, and guides assembly. You can say what you want or tap a button: the same actions, with one undo.' },
  { kind: 'example', title: 'Example 1 · A layered cut: the paper cat', example: 'cat', notes: 'Example one, a layered cut. I tell Katachi how to stack it: a solid white base, black with the whiskers cut through, then red, white flowers and gold, every layer keeping the outline. Five sheets, built to that plan. Two cents.' },
  { kind: 'example', title: 'Example 2 · A collage of crafts: earring charms', example: 'earrings', notes: 'Example two, a collage of crafts. From one tray photo it finds the earrings, matches the pairs by shape and cuts each pair to one size, with repeated holes evened out. About three cents.' },
  { kind: 'example', title: 'Example 3 · A set: five bookmarks, one photo', example: 'bookmarks', notes: 'Example three, a set. Five bookmarks, overlapping and shot at an angle. Katachi corrects the perspective, stands each one upright, rebuilds the hidden edges, and makes all five one size. Two cents.' },
  { kind: 'architecture', title: 'Architecture: models perceive, code measures', notes: 'Under the hood: the browser holds the craft and code does all the geometry. A Cloudflare worker keeps the key server-side. Muse Spark reads and plans; SAM 3.1 outlines. Models never emit coordinates.' },
  { kind: 'actions', title: 'One action set, for the chat and the buttons', notes: 'Every edit is one action with one contract, shared by the chat and the buttons. Simple phrases run instantly. Complex requests go to Muse Spark, which plans the steps as a single undoable change.' },
  { kind: 'status', title: 'A prototype with promise, not a product yet', notes: 'To be clear: this is a prototype, not a finished product. The core works, but traces still follow the photo, hidden fretwork is rebuilt solid, and real size is an estimate.' },
  { kind: 'roadmap', title: 'Roadmap: from prototype to maker’s tool', notes: 'Next: one clean cut line per piece, a reference card for true millimetres, and real cuts on a real machine. Then Muse Image for hidden detail, and jobs sent straight to the cutter. Later, 3D flat-pack.' },
  { kind: 'close', title: 'Build your world, one sheet at a time', lines: ['Three crafts, under eight cents of model calls.', 'katachi.sensei-hq.com'], notes: 'Three crafts, under eight cents of Meta model calls. The hard part, seeing what to cut, already works. Build your world, one sheet at a time, at katachi dot sensei-hq dot com.' }
];

/** Docs: using the app, page by page */
export const docs = [
  { id: 'start', title: 'Getting in', body: ['Katachi is invite-only while it is a hackathon demo. Enter your invite code on the home page and confirm the three notes (18 or over, never leave a laser unattended, no personal photos).'] },
  { id: 'snap', title: '1 · Snap', body: ['Upload a photo or take one: layered paper art, a tray of separate pieces (earrings, bookmarks, coasters), or several views of one object. A plain, even background works best.', 'Press Analyze. Muse Spark reads what the picture shows; SAM 3.1 outlines the subject and each item.'] },
  { id: 'layers', title: '2 · Layers', body: ['Items and their layers appear on the left, back to front. Every step shows in the chat on the right, with the model that did it and what it cost.', 'Views: All layers, This layer, Its sheet (as it will be cut) and Exploded (the stack lifted apart).'] },
  { id: 'cleanup', title: '3 · The automatic passes', body: ['After the layers: perspective correction (four-cornered items), straighten (each item upright on its own sheet), fill hidden parts (what a neighbour or a tassel covered), same size (pairs, or a set of one kind) and the clean-up (specks, repeated holes, symmetry, smoothing).', 'All of them are one undo each.'] },
  { id: 'chat', title: 'Say it', body: ['Plain phrases run at once: “delete layer 2”, “merge the swirl drop left and right”, “flip the fox bookmark”, “make 3 copies”, “undo”, “redo”.', 'Anything longer goes to Muse Spark, which plans the steps: “take the background out and find the five bookmarks again”, “clean it up”, “make them all the same size”.'] },
  { id: 'cut', title: '4 · Cut', body: ['Pick your machine (Cricut, xTool, Glowforge, or just the files) and how the parts go on sheets: one per sheet, pairs together, or fit to board.', 'Download each sheet as SVG or DXF, or all of them in one zip; or send them to the cut queue, which plays the run and writes G-code for lasers.'] },
  { id: 'assemble', title: '5 · Assemble', body: ['Step-by-step instructions in stacking order, naming the sheet each piece is on. Save the craft to find it again in your crafts.'] },
  { id: 'limits', title: 'Good to know', body: ['Outlines come from the photo: shadows can add stray lines, and hidden fretwork is rebuilt solid. Real size is Muse’s estimate; set it yourself on Layers. Check every sheet before you cut, and never leave a laser unattended.'] }
];

/** the policies (a hackathon demo, in plain words; not legal advice) */
export const updated = '2 November 2026';
export const terms = [
  { title: 'What this is', body: 'Katachi is an experimental demo built for the Meta AI Developer Hackathon. It is provided as is, without warranties of any kind, and may change, break or be taken down at any time.' },
  { title: 'Who can use it', body: 'You must be 18 or over and have an invite code. Codes are personal; don’t share them.' },
  { title: 'Your uploads', body: 'Only upload pictures you have the right to use. Don’t upload photos of people or anything personal. Uploads are sent to the Meta Model API to be analysed (see the privacy policy).' },
  { title: 'Cutting safely', body: 'Cut files are generated automatically and can be wrong. Check every sheet before cutting. Never leave a laser cutter unattended; Katachi’s monitoring is advisory and cannot prevent a fire. You are responsible for your machine, materials and workspace.' },
  { title: 'Fair use', body: 'Don’t try to bypass the invite gate or the usage limits, overload the service, or use it to make anything unlawful or infringing.' },
  { title: 'Liability', body: 'To the extent the law allows, the author is not liable for any loss or damage arising from using Katachi or its cut files.' },
  { title: 'Open source', body: 'The code is open source on GitHub (sensei-hq/katachi) under its own licence; these terms cover the hosted demo.' }
];
export const privacy = [
  { title: 'What we collect', body: 'Your invite code (as your session id), the pictures you upload, what you type in the chat, and a record of model calls (which model, how long, what it cost). No name, email or payment details.' },
  { title: 'Where it lives', body: 'Your crafts are saved in your own browser (local storage and IndexedDB). The server keeps a signed session cookie and usage counts for the budget; it does not keep your pictures.' },
  { title: 'Who processes it', body: 'Pictures and requests are sent to the Meta Model API (Muse Spark, SAM 3.1, Muse Image) to be analysed. During the hackathon the demo runs on free credits, so uploads may be used by Meta under its terms — that is why you are asked not to upload personal photos. The site runs on Cloudflare.' },
  { title: 'Cookies', body: 'One session cookie to keep you signed in, and your theme choice. No advertising or tracking cookies.' },
  { title: 'Your choices', body: 'Delete a craft from your crafts, or clear the site’s data in your browser to remove everything stored locally. Ask the author to remove your invite and usage records.' },
  { title: 'Contact', body: 'Questions: open an issue on github.com/sensei-hq/katachi.' }
];
