// The craft's state (design/15 §3): one plain document, wrapped. Screens read these getters and change the craft
// only through actions (design/14); measurements are derived from the document, never stored twice.
import { indexCraft, layersOf, prune, type CraftDoc, type GroupDoc, type Id, type ItemDoc, type OpDoc, type PartDoc } from '../../domain/craft';
import { bbox } from '../../domain/geo';

export function emptyCraft(id: Id, name = '', at = 0): CraftDoc {
  return { v: 2, id, name, kind: 'layered', createdAt: at, updatedAt: at, rev: 0, items: [], groups: [], sources: [], history: { done: [], undone: [] } };
}

export class CraftState {
  // raw, not deeply reactive: the doc is never changed in place (load and commit replace it whole), and a craft's
  // geometry is tens of thousands of points that must not each become a proxy
  doc = $state.raw<CraftDoc>(emptyCraft(''));
  readonly index = $derived(indexCraft(this.doc));
  /** wrappers are cached by id, so a screen keeps the same object across changes */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a wrapper cache, never rendered
  private items$ = new Map<Id, ItemState>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a wrapper cache, never rendered
  private parts$ = new Map<Id, PartState>();
  constructor(private clock: () => number = () => Date.now()) {}

  /** open a craft (replaces everything; the history comes with it) */
  load(doc: CraftDoc) { this.doc = { ...doc, rev: doc.rev + 1 }; this.items$.clear(); this.parts$.clear(); }
  /** the document as saved */
  /** the document as saved (immutable: callers copy before changing anything) */
  toJSON(): CraftDoc { return this.doc; }
  /** the one place a changed document lands (actions call this): links pruned, rev and time moved on */
  commit(next: CraftDoc) { this.doc = { ...prune(next), rev: this.doc.rev + 1, updatedAt: this.clock() }; }

  get id() { return this.doc.id; }
  get items(): ItemState[] { return this.doc.items.map((i) => this.item(i.id)!); }
  get groups(): GroupDoc[] { return this.doc.groups; }
  /** what the screen lists as layers: each item's parts, back to front */
  get layers(): PartState[] { return layersOf(this.doc).map(({ part }) => this.part(part.id)!); }
  get separateItems() { return this.doc.items.length > 1; }
  item(id: Id): ItemState | undefined {
    if (this.index.get(id)?.kind !== 'item') return undefined;
    let s = this.items$.get(id); if (!s) { s = new ItemState(this, id); this.items$.set(id, s); }
    return s;
  }
  part(id: Id): PartState | undefined {
    if (this.index.get(id)?.kind !== 'part') return undefined;
    let s = this.parts$.get(id); if (!s) { s = new PartState(this, id); this.parts$.set(id, s); }
    return s;
  }
}

export class ItemState {
  constructor(private craft: CraftState, readonly id: Id) {}
  get doc(): ItemDoc { const n = this.craft.index.get(this.id); if (n?.kind !== 'item') throw new Error(`item ${this.id} is gone`); return n.node; }
  get name() { return this.doc.name; }
  get parts(): PartState[] { return [...this.doc.parts].sort((a, b) => a.z - b.z).map((p) => this.craft.part(p.id)!); }
  /** the item as cut, in mm (its frame at its scale) */
  get sizeMm() { const f = this.doc.frame; return { wMm: Math.round((f.size[0] / f.pxPerMm) * 10) / 10, hMm: Math.round((f.size[1] / f.pxPerMm) * 10) / 10 }; }
  get turnDeg() { return this.doc.frame.fromSource.rotateDeg; }
  get flipped() { return Boolean(this.doc.frame.flipX || this.doc.frame.flipY); }
  get qty() { return this.doc.qty ?? 1; }
  /** the pair or set it belongs to */
  get group(): GroupDoc | undefined { return this.craft.doc.groups.find((g) => g.items.includes(this.id)); }
}

export class PartState {
  constructor(private craft: CraftState, readonly id: Id) {}
  private get node() { const n = this.craft.index.get(this.id); if (n?.kind !== 'part') throw new Error(`part ${this.id} is gone`); return n; }
  get doc(): PartDoc { return this.node.node; }
  get item(): ItemState { return this.craft.item(this.node.item.id)!; }
  get name() { return this.doc.name; }
  get colour() { return this.doc.colour; }
  get material() { return this.doc.material; }
  get z() { return this.doc.z; }
  get cut(): OpDoc | undefined { return this.doc.ops.find((o) => o.kind === 'cut'); }
  get engravings(): OpDoc[] { return this.doc.ops.filter((o) => o.kind !== 'cut'); }
  /** cut through, or engraved only (a part with no cut is an engraving pass on its own) */
  get role(): 'cut' | 'engrave' { return this.cut ? 'cut' : 'engrave'; }
  get visiblePct() { return this.doc.measured?.visiblePct ?? 0; }
  /** the part's bounds in mm, in its item's frame */
  get boundsMm() { const g = this.cut?.geometry ?? this.doc.ops[0]?.geometry; const b = g ? bbox(g) : null; const k = this.item.doc.frame.pxPerMm; return b ? { x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k } : null; }
}
