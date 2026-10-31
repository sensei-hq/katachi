// Flip an item over in place (design/14 §6): a frame flag, the geometry untouched.
import type { CraftDoc, Id, ItemDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';

export type FlipAxis = 'x' | 'y';
export interface FlipOpts { axis: FlipAxis }

/** chat words → axis (says captures horizontal/vertical; the schema constrains to x/y) */
export function flipAxis(axis: string): FlipAxis | null {
  if (axis === 'x' || axis === 'horizontal') return 'x';
  if (axis === 'y' || axis === 'vertical') return 'y';
  return null;
}

const clone = <T>(x: T): T => structuredClone(x);
const itemOf = (doc: CraftDoc, id: Id): ItemDoc | undefined => doc.items.find((i) => i.id === id);

export const flip: ActionDef<FlipOpts> = {
  id: 'flip', label: 'Flip', icon: 'i-solar:flip-horizontal-linear', scope: 'item', arity: 'one', kind: 'code',
  hint: 'Turn an item over in place (cut from the back, iron-on vinyl).',
  schema: { type: 'object', properties: { axis: { type: 'string', enum: ['x', 'y'] } } },
  defaults: { axis: 'x' },
  says: [/\bflip\b.*\b(?<axis>horizontal|vertical)(?:ly)?\b/i, /\bflip\b/i],
  can: (doc, { targets, opts }) => {
    if (targets.length !== 1 || !itemOf(doc, targets[0])) return 'Pick one item to flip';
    if (!flipAxis(opts.axis)) return 'Flip which way: horizontal or vertical';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const it = itemOf(doc, targets[0])!;
    const axis = flipAxis(opts.axis)!;
    const next: ItemDoc = { ...clone(it), frame: { ...clone(it.frame) } };
    // absent = off: toggling off deletes the flag, so flipping twice is the original
    if (axis === 'x') {
      if (next.frame.flipX) delete next.frame.flipX; else next.frame.flipX = true;
    } else if (next.frame.flipY) delete next.frame.flipY; else next.frame.flipY = true;
    return { items: [next], summary: `Flipped the ${it.name} ${axis === 'x' ? 'left-to-right' : 'top-to-bottom'} (cut face down)` };
  },
};
