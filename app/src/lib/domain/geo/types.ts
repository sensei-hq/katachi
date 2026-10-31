// Shared geometry types (design/14, 15). Pure data: no Svelte, no DOM. Units are whatever the owner says
// (an item's frame px, or mm on a sheet); every function in geo/ is unit-agnostic.
import type { Pt } from '../toolpath';
export type { Pt };

/** one segment from the previous point: a straight line, or a cubic Bézier (two control points) */
export type Seg = { k: 'L'; to: Pt } | { k: 'C'; c1: Pt; c2: Pt; to: Pt };
/** a loop (closed: an outline or a hole) or an open stroke (engraved lines) */
export interface Path { start: Pt; segs: Seg[]; closed: boolean }
/** a shape: its paths, filled even-odd (outer loops + holes); open paths are strokes */
export interface Geometry { paths: Path[] }
export interface Box { x: number; y: number; w: number; h: number }

/** polyline helpers' shape (what tracing produces today): closed loops of points */
export type Loops = Pt[][];
