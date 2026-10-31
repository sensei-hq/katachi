// How many of an item to make (design/14 §6): a count, not copies to edit.
import type { CraftDoc, Id, ItemDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';

export interface QuantityOpts { qty: number }

const clone = <T>(x: T): T => structuredClone(x);
const itemOf = (doc: CraftDoc, id: Id): ItemDoc | undefined => doc.items.find((i) => i.id === id);

export const quantity: ActionDef<QuantityOpts> = {
  id: 'quantity', label: 'Quantity', icon: 'i-solar:hashtag-circle-linear', scope: 'item', arity: 'one', kind: 'code',
  hint: 'How many of an item to make (the cut plan places it that many times).',
  schema: { type: 'object', properties: { qty: { type: 'integer', minimum: 1, maximum: 99 } } },
  defaults: { qty: 2 },
  // a count, not a size ("make 40 mm tall" is resize)
  says: [/\bmake\s+(?<qty>\d+)\b(?!\s*(?:mm|cm|in|inch|%|°|degrees?))(?:\s+of\s+(?:it|them|the))?/i, /\b(?<qty>\d+)\s+copies\b/i],
  can: (doc, { targets, opts }) => {
    if (targets.length !== 1 || !itemOf(doc, targets[0])) return 'Pick one item to count';
    const qty = Number(opts.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return 'How many, 1 to 99';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const it = itemOf(doc, targets[0])!;
    return { items: [{ ...clone(it), qty: Number(opts.qty) }], summary: `Making ${Number(opts.qty)} of ${it.name}` };
  },
};
