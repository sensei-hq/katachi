// Helpers every action shares: a deep copy to edit, and finding an item or a part (with its item) by id.
import type { CraftDoc, Id, ItemDoc, PartDoc } from '../../craft/types';
import { indexCraft } from '../../craft';

export const clone = <T>(x: T): T => structuredClone(x);
export const itemOf = (doc: CraftDoc, id: Id): ItemDoc | undefined => doc.items.find((i) => i.id === id);
export const partIn = (doc: CraftDoc, id: Id): { part: PartDoc; item: ItemDoc } | undefined => {
  const n = indexCraft(doc).get(id);
  return n?.kind === 'part' ? { part: n.node, item: n.item } : undefined;
};
/** let the page draw (a long run over 28 layers would otherwise freeze it for seconds); no-op outside a browser */
export const breathe = (): Promise<void> => (typeof window === 'undefined' ? Promise.resolve() : new Promise((r) => setTimeout(r, 0)));
