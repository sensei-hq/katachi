// Cut-queue adapter (task T2): a planned sheet becomes what the queue runs today, unchanged.
import type { NewQueueItem } from '../../state/queue.svelte';
import { sheetD } from '../toolpath';
import type { CraftDoc } from '../craft/types';
import type { CutProfile, Sheet } from './types';

/** a sheet as today's queue item: one op per sheet, passes in machine order */
export function toQueueInput(sheet: Sheet, craft: CraftDoc, profile: CutProfile): NewQueueItem {
  const shapes = sheet.passes.flatMap((p) => p.shapesMm);
  return {
    craftId: craft.id,
    craftName: craft.name,
    layer: sheet.n,
    name: sheet.name,
    material: sheet.material,
    op: sheet.passes.every((p) => p.kind !== 'cut') ? 'engrave' : 'cut',
    colour: sheet.colour,
    machine: profile.machine === 'laser' ? 'laser' : 'paper',
    // the thumbnail draws it in 0-1000 of the sheet (CutSheet), like every sheet preview
    cut: sheetD(shapes, sheet.sizeMm),
    shapes,
    sheetMm: sheet.sizeMm,
  };
}
