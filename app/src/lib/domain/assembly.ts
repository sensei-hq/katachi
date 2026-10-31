// Assembly instructions for a craft, derived in code from its layers or parts (PRD R-UX-6).
// The integrated build has Spark write these from the ObjectSpec; the shape of the output stays the same.
import type { Joinery, Kind, Layer, LayerSet } from '../content/layers';

export interface AssemblyStep { title: string; detail: string; /** the layer this step adds (stacked builds) */ layer?: number }

const pad = (n: number) => String(n).padStart(2, '0');
const joinText: Record<Joinery, string> = {
  finger: 'press the finger joints together and glue them',
  butt: 'butt the edges together with wood glue',
  tabs: 'push the tabs through their slots'
};

/** Stacked layers, back → front; joined parts for a 3D object. */
export function assemblySteps({ kind, layers, set, joinery, multiple = false }: { kind: Kind; layers: Layer[]; set: Pick<LayerSet, 'spacer' | 'mmPerLayer'> & { label: string }; joinery: Joinery; multiple?: boolean }): AssemblyStep[] {
  if (multiple) {
    const steps: AssemblyStep[] = [{ title: 'Cut each item separately', detail: `${[...new Set(layers.map((l) => l.itemName ?? l.name))].length} independent objects. Work one item at a time so pieces do not mix.` }];
    const groups = new Map<string, Layer[]>();
    for (const l of layers) { const k = l.itemName ?? l.name; groups.set(k, [...(groups.get(k) ?? []), l]); }
    for (const [item, ls] of groups) {
      if (ls.length === 1) steps.push({ layer: ls[0].n, title: `Cut ${item}`, detail: `One ${ls[0].material} sheet, outline from its own mask. Weed the inside pieces and lift it off whole.` });
      else {
        steps.push({ layer: ls[0].n, title: `Stack ${item}`, detail: `${ls.length} layers, back to front: ${ls.map((l) => l.name).join(' · ')}. Glue each on the registration pins before the next.` });
        for (const l of ls) steps.push({ layer: l.n, title: `Add ${l.name} (${item})`, detail: `One ${l.material} sheet from its own traced mask. Line it up and press down.` });
      }
    }
    steps.push({ title: 'Finish and attach', detail: 'Sand the edges, seal if you like, then add the bought parts (tassels, cords, findings) through the top hole.' });
    return steps;
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
