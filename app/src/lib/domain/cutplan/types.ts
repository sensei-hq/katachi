// The hand-off from the craft to the machine (design/15 §5): a cut profile turns a craft into sheets.
import type { Pt } from '../geo/types';
import type { Id, OpKind } from '../craft/types';
import type { DeviceId } from '../../content/layers';

export interface CutProfile {
  id: string; label: string;
  device: DeviceId; machine: 'laser' | 'blade';
  material: string;
  board: { wMm: number; hMm: number };
  marginMm: number; spacingMm: number; kerfMm: number;
  settings: Record<OpKind, { feed: number; power: number; passes: number }>;
  layout: 'one-part-per-sheet' | 'one-item-per-sheet' | 'groups-together' | 'given' | 'nest';
}
export interface Placement { partId: Id; itemId: Id; at: [number, number]; rotateDeg: number; flipX?: boolean }
export interface Pass { opId: Id; partId: Id; kind: OpKind; shapesMm: Pt[][] }
export interface Sheet {
  id: string; n: number;
  material: string; colour: string;
  board: { wMm: number; hMm: number };
  /** the used area (what today's queue calls sheetMm) */
  sizeMm: [number, number];
  placements: Placement[];
  /** machine order on this sheet: engravings, then scores, then inner cuts, then outlines */
  passes: Pass[];
  /** Assemble: which item / stack position this sheet is for */
  forStep?: { itemId: Id; z?: number };
  name: string;
  /** cut problems found after planning (holes too small for the kerf) */
  warnings?: string[];
}
export interface CutPlan { craftId: Id; profileId: string; craftRev: number; sheets: Sheet[] }
