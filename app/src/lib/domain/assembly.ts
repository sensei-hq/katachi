// Assembly instructions for a craft, derived in code from its layers or parts (PRD R-UX-6).
// The integrated build has Spark write these from the ObjectSpec; the shape of the output stays the same.
import type { Joinery, Kind, Layer, LayerSet } from '../content/layers';

export interface AssemblyStep { title: string; detail: string; /** the layer this step adds (stacked builds) */ layer?: number; /** the pair or set it belongs to */ group?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const joinText: Record<Joinery, string> = {
  finger: 'press the finger joints together and glue them',
  butt: 'butt the edges together with wood glue',
  tabs: 'push the tabs through their slots'
};

/** Stacked layers, back → front; joined parts for a 3D object. */
export function assemblySteps({ kind, layers, set, joinery, multiple = false, sheetsOf, kit, groups: sets = [] }: { kind: Kind; layers: Layer[]; set: Pick<LayerSet, 'spacer' | 'mmPerLayer'> & { label: string }; joinery: Joinery; multiple?: boolean;
  /** the cut plan's sheet numbers holding each item (by item name), when there is a plan */
  sheetsOf?: (item: string) => number[];
  /** a kit read from its cut plan: its sheets, with how many pieces each holds */
  kit?: { name: string; pieces: number }[];
  /** separate items that belong together (earring pairs, a set of bookmarks), by item name */
  groups?: { name: string; kind: 'pair' | 'set'; items: string[] }[] }): AssemblyStep[] {
  const on = (item: string) => { const ns = sheetsOf?.(item) ?? []; return ns.length ? ` · sheet${ns.length > 1 ? 's' : ''} ${ns.map(pad).join(', ')}` : ''; };
  if (multiple) {
    const steps: AssemblyStep[] = [{ title: 'Cut each item separately', detail: `${[...new Set(layers.map((l) => l.itemName ?? l.name))].length} independent objects. Work one item at a time so pieces do not mix.` }];
    const groups = new Map<string, Layer[]>();
    for (const l of layers) { const k = l.itemName ?? l.name; groups.set(k, [...(groups.get(k) ?? []), l]); }
    // pairs and sets first, their members side by side; then the items on their own
    const inSet = new Map<string, { name: string; kind: 'pair' | 'set'; items: string[]; at: number }>();
    sets.filter((g) => g.items.filter((i) => groups.has(i)).length > 1).forEach((g, at) => { for (const i of g.items) if (groups.has(i)) inSet.set(i, { ...g, items: g.items.filter((x) => groups.has(x)), at }); });
    const order = [...groups.keys()].sort((a, b) => (inSet.get(a)?.at ?? Infinity) - (inSet.get(b)?.at ?? Infinity) || (inSet.get(a)?.items.indexOf(a) ?? 0) - (inSet.get(b)?.items.indexOf(b) ?? 0));
    if (inSet.size) {
      const pairs = sets.filter((g) => g.kind === 'pair' && g.items.filter((i) => groups.has(i)).length > 1).length, kits = new Set([...inSet.values()].map((g) => g.name)).size - pairs;
      steps[0].detail += ` ${[pairs ? `${pairs} pair${pairs > 1 ? 's' : ''}` : '', kits > 0 ? `${kits} set${kits > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')}: keep each together as it comes off the sheet.`;
    }
    for (const item of order) {
      const ls = groups.get(item)!, g = inSet.get(item);
      if (g && ls.length === 1) {
        const others = g.items.filter((x) => x !== item), first = g.items[0] === item;
        steps.push({ layer: ls[0].n, group: g.name, title: `${g.name} · ${item}${on(item)}`, detail: g.kind === 'pair'
          ? `${first ? 'One' : 'The other'} of the pair with ${others.join(', ')}: the same size, cut on the same sheet. Weed it and lay it beside its partner so the two stay together.`
          : `Part of the set (${g.items.length}, all one size) with ${others.length > 3 ? `${others.slice(0, 3).join(', ')} and ${others.length - 3} more` : others.join(', ')}. Weed it and keep the set together.` });
        continue;
      }
      if (ls.length === 1) steps.push({ layer: ls[0].n, title: `Cut ${item}${on(item)}`, detail: `One ${ls[0].material} sheet, outline from its own mask. Weed the inside pieces and lift it off whole.` });
      else {
        steps.push({ layer: ls[0].n, title: `${g ? `${g.name} · ` : ''}Stack ${item}${on(item)}`, detail: `${ls.length} layers, back to front: ${ls.map((l) => l.name).join(' · ')}. Glue each on the registration pins before the next.` });
        for (const l of ls) steps.push({ layer: l.n, title: `Add ${l.name} (${item})`, detail: `One ${l.material} sheet from its own traced mask. Line it up and press down.` });
      }
    }
    steps.push({ title: 'Finish and attach', detail: 'Sand the edges, seal if you like, then add the bought parts (tassels, cords, findings) through the top hole.' });
    return steps;
  }
  if (kind === '3d' && kit?.length) {
    const pieces = kit.reduce((a, k) => a + k.pieces, 0);
    return [
      { title: 'Cut the kit sheets in order', detail: `${kit.length} sheets, about ${pieces} pieces. Engraving first on each sheet, then the cut. Keep each sheet's pieces together and label the backs with the sheet name.` },
      ...kit.map((k) => ({ title: `Sheet ${k.name} · press out its pieces`, detail: `About ${k.pieces} piece${k.pieces === 1 ? '' : 's'}. Push them out from the back, clear the waste from the holes, and lay them out in the order they sat on the sheet.` })),
      { title: 'Dry-fit before gluing', detail: 'Follow the kit’s own build order. Check each joint closes; sand a tight tab rather than forcing it.' },
      { title: 'Glue up and finish', detail: 'A little wood glue on each joint, wipe off what squeezes out, and let it set. Add the lights or the bought parts last.' }
    ];
  }
  if (kind === '3d') {
    return [
      { title: 'Dry-fit every part', detail: 'Lay out the floor, front, back, two sides and two roof panels. Check that each joint closes before you glue anything.' },
      { title: 'Front and back on the floor', detail: `Stand the front and back on the floor and ${joinText[joinery]}.` },
      { title: 'Add the sides', detail: `Slide both sides between the front and back; ${joinText[joinery]}. Check it is square.` },
      { title: 'Fit the roof', detail: 'Rest the two roof panels on the 45° edges so they meet at the ridge, then glue the ridge line.' },
      { title: 'Clamp and let it set', detail: joinery === 'tabs' ? 'Tabs hold on their own. Add a drop of glue at each one for a permanent build.' : 'Clamp or tape it for 30 minutes and wipe off any glue that squeezed out.' }
    ];
  }
  const paper = set.label.toLowerCase().includes('paper');
  const steps: AssemblyStep[] = [{ title: 'Lay out the sheets back to front', detail: `${layers.length} sheets, numbered ${pad(1)}–${pad(layers.length)}. Check each against the layer list before gluing.` }];
  layers.forEach((l, i) => {
    if (i === 0) steps.push({ layer: l.n, title: `Sheet ${pad(l.n)} · ${l.name} is the back`, detail: paper ? 'Glue it to a backing board, flush with the edge. Push the registration pins through its holes.' : 'Lay it face up on the bench with the registration pins through its holes.' });
    else steps.push({ layer: l.n, title: `Add sheet ${pad(l.n)} · ${l.name}`, detail: `${set.spacer}. Line it up on the pins and press it down.` });
  });
  steps.push({ title: 'Press and finish', detail: paper ? 'Put a flat weight on it for 30 minutes, then pull the pins. Frame it or hang it.' : 'Clamp it flat until the glue sets, pull the pins, then seal it.' });
  return steps;
}
