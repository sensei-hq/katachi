// Every action, registered once (design/14): the stack's own (structure), whole-item analysis, and the geometry
// actions (task T3).
import { register } from '../registry';
import { registerComposites } from '../composites';
import { structureActions } from './structure';
import { analysisActions } from './analysis';
import { addHole } from './add-hole';
import { align } from './align';
import { bridge } from './bridge';
import { distribute } from './distribute';
import { flip } from './flip';
import { mirror } from './mirror';
import { offset } from './offset';
import { quantity } from './quantity';
import { rotate } from './rotate';
import { simplify } from './simplify';
import { smooth } from './smooth';
import { weld } from './weld';
import { cleanupActions } from './cleanup';
import { rectify } from './rectify';
import { sameSize } from './samesize';
import { shadowActions } from './deshadow';

export const geometryActions = [flip, mirror, rotate, quantity, smooth, simplify, offset, weld, bridge, addHole, align, distribute];
let done = false;
export function registerAll() { if (done) return; done = true; for (const a of [...structureActions, ...analysisActions, ...geometryActions, ...cleanupActions, ...shadowActions, rectify, sameSize]) register(a as never); registerComposites(); }
