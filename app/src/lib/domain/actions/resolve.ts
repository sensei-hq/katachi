// What a request names → ids (design/14 §4). The chat, the buttons and recipes all resolve through here. Numbers
// and names are the screen's rows (rowsOf): a separate item's engraving is its own row, so its id is the op's.
import { rowsOf } from '../craft';
import type { CraftDoc, Id } from '../craft/types';
import type { Ref, Scope } from './types';

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'layer', 'layers', 'cut', 'left', 'right', 'engraving'].includes(w));

/** rows (part ids, or op ids for engraving rows) — or their items, for item actions — back to front */
export function resolve(doc: CraftDoc, refs: Ref[], scope: Scope, selected: Id[] = []): Id[] {
  const rows = rowsOf(doc), out: Id[] = [];
  const idOf = (r: (typeof rows)[number]) => (scope === 'item' ? r.item.id : r.op?.id ?? r.part.id);
  const add = (ids: Id[]) => { for (const id of ids) if (!out.includes(id)) out.push(id); };
  const rowFor = (id: Id) => rows.find((r) => r.part.id === id || r.op?.id === id);
  for (const r of refs) {
    if ('all' in r) add(scope === 'part' ? rows.filter((x) => !x.op).map(idOf) : doc.items.map((i) => i.id));
    else if ('selected' in r) add(selected.flatMap((id) => (doc.items.some((i) => i.id === id) ? (scope === 'item' ? [id] : rows.filter((x) => x.item.id === id && !x.op).map(idOf)) : rowFor(id) ? [scope === 'item' ? rowFor(id)!.item.id : id] : [])));
    else if ('id' in r) add(doc.items.some((i) => i.id === r.id) ? (scope === 'item' ? [r.id] : rows.filter((x) => x.item.id === r.id && !x.op).map(idOf)) : rowFor(r.id) ? [scope === 'item' ? rowFor(r.id)!.item.id : r.id] : []);
    else if ('n' in r) { const x = rows[r.n - 1]; if (x) add([idOf(x)]); }
    else if ('item' in r) {
      const t = r.item.toLowerCase(), it = doc.items.filter((i) => i.name.toLowerCase() === t);
      const hit = it.length ? it : doc.items.filter((i) => words(i.name).length && words(i.name).every((w) => t.includes(w)));
      add(scope === 'item' ? hit.map((i) => i.id) : rows.filter((x) => hit.includes(x.item) && !x.op).map(idOf));
    }
    else if ('name' in r) {
      const t = r.name.toLowerCase();
      // a whole name said wins over shared words ("the swirl drop left"); an engraving row only when said
      const whole = rows.filter((x) => t.includes(x.name.toLowerCase()) || (!x.op && (t.includes(x.part.name.toLowerCase()) || t.includes(x.item.name.toLowerCase()))));
      const some = whole.length ? whole : rows.filter((x) => !x.op && words(x.part.name).length && words(x.part.name).every((w) => t.includes(w)));
      add(some.map(idOf));
    }
    else if ('role' in r) add(rows.filter((x) => x.role === (r.role === 'score' ? 'engrave' : r.role)).map(idOf));
    else if ('empty' in r) add(rows.filter((x) => Math.round(x.shows) <= 0).map(idOf));
  }
  return out;
}
