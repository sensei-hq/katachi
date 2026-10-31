// Fit to board (task T4): bottom-left fill on an occupancy grid, on outlines not boxes. Pure, mm in/mm out.
import type { Pt } from '../geo/types';

export interface NestInput {
  partId: string; itemId: string;
  /** outline + holes, bbox min at the origin */
  loopsMm: Pt[][];
  material: string; colour: string;
  qty: number;
  groupId?: string; keepTogether?: boolean;
}
export interface NestPlacement {
  partId: string; itemId: string; at: [number, number]; rotateDeg: number;
  /** set when the part fits no rotation on an empty board (its footprint, for the warning) */
  oversize?: { wMm: number; hMm: number };
}
export interface NestSheet { material: string; colour: string; placements: NestPlacement[] }
export interface NestResult { sheets: NestSheet[] }
export interface NestOpts { marginMm: number; spacingMm: number; allowRotate?: boolean }

/** grid cell: 1 mm, or 0.5 mm on small boards where 1 mm cells would be too coarse */
export function nestCellMm(board: { wMm: number; hMm: number }): number {
  return Math.min(board.wMm, board.hMm) <= 100 ? 0.5 : 1;
}

/** footprint extent of loops (loop, not spread: footprints can hold tens of thousands of points) */
function extentOf(loops: Pt[][]): { wMm: number; hMm: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const l of loops) for (const [x, y] of l) {
    if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y;
  }
  return x2 < x1 ? { wMm: 0, hMm: 0 } : { wMm: x2 - x1, hMm: y2 - y1 };
}

/** rotate loops about the origin, then shift the bbox min back to the origin */
export function rotatedLoops(loops: Pt[][], rotateDeg: number): Pt[][] {
  const r = (rotateDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const turned = loops.map((l) => l.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt));
  let x1 = Infinity, y1 = Infinity;
  for (const l of turned) for (const [x, y] of l) {
    if (x < x1) x1 = x; if (y < y1) y1 = y;
  }
  if (x1 === Infinity) return turned;
  return turned.map((l) => l.map(([x, y]) => [x - x1, y - y1] as Pt));
}

export interface Raster { cols: number; rows: number; cells: [number, number][] }

/** occupancy cells over [-dil, w + dil); holes stay empty, edges dilate into and out of the part.
 * Scanline fill over an active edge table, then exact edge distance through a spatial hash for the
 * unfilled cells only: the same cells as per-cell even-odd + distance, in O(rows × active + cells). */
export function rasterize(loops: Pt[][], cellMm: number, dilMm: number): Raster {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, n = 0;
  for (const l of loops) {
    n += l.length;
    for (const [x, y] of l) {
      if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y;
    }
  }
  if (!n) return { cols: 0, rows: 0, cells: [] };
  const w = x2 - x1, h = y2 - y1;
  const cols = Math.max(1, Math.ceil((w + 2 * dilMm) / cellMm)), rows = Math.max(1, Math.ceil((h + 2 * dilMm) / cellMm));
  // edges into flat arrays (an edge straddles the scanline exactly when ymin <= y < ymax)
  const ax = new Float64Array(n), ay = new Float64Array(n), bx = new Float64Array(n), by = new Float64Array(n);
  const elo = new Float64Array(n), ehi = new Float64Array(n);
  let e = 0;
  for (const l of loops) {
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const xi = l[i][0], yi = l[i][1], xj = l[j][0], yj = l[j][1];
      ax[e] = xi; ay[e] = yi; bx[e] = xj; by[e] = yj;
      elo[e] = yi < yj ? yi : yj; ehi[e] = yi < yj ? yj : yi;
      e++;
    }
  }
  // fill: per row, the straddling edges' crossings sorted, then one sweep (odd crossings right of x = inside)
  const filled = new Uint8Array(cols * rows);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => elo[a] - elo[b]);
  const active: number[] = [];
  const cross = new Float64Array(n);
  let p = 0;
  for (let j = 0; j < rows; j++) {
    const y = (j + 0.5) * cellMm - dilMm;
    while (p < n && elo[order[p]] <= y) active.push(order[p++]);
    for (let k = active.length - 1; k >= 0; k--) {
      if (ehi[active[k]] <= y) { active[k] = active[active.length - 1]; active.pop(); }
    }
    let m = 0;
    for (const ei of active) cross[m++] = ((bx[ei] - ax[ei]) * (y - ay[ei])) / (by[ei] - ay[ei]) + ax[ei];
    const cut = cross.subarray(0, m);
    cut.sort();
    let k = 0;
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cellMm - dilMm;
      while (k < m && cut[k] <= x) k++;
      if ((m - k) % 2 === 1) filled[j * cols + i] = 1;
    }
  }
  // dilate: each edge into the hash cells along its length (radius R covers every centre within dil),
  // then unfilled cells check only their own hash cell with the exact point-segment distance
  const s = Math.max(cellMm, dilMm), R = Math.ceil(dilMm / s) + 1;
  const hx0 = Math.floor(Math.min(x1, -dilMm) / s) - R - 1, hy0 = Math.floor(Math.min(y1, -dilMm) / s) - R - 1;
  const hx1 = Math.ceil(Math.max(x2, w + dilMm) / s) + R + 1, hy1 = Math.ceil(Math.max(y2, h + dilMm) / s) + R + 1;
  const hcols = hx1 - hx0 + 1, hrows = hy1 - hy0 + 1;
  const hash: (number[] | undefined)[] = new Array(hcols * hrows);
  for (let ei = 0; ei < n; ei++) {
    const ex = bx[ei] - ax[ei], ey = by[ei] - ay[ei];
    const steps = Math.max(1, Math.ceil(Math.hypot(ex, ey) / s));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, gx = Math.floor((ax[ei] + t * ex) / s), gy = Math.floor((ay[ei] + t * ey) / s);
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          const X = gx + ox - hx0, Y = gy + oy - hy0;
          if (X < 0 || Y < 0 || X >= hcols || Y >= hrows) continue;
          const idx = Y * hcols + X;
          (hash[idx] ??= []).push(ei);
        }
      }
    }
  }
  const seen = new Int32Array(n);
  let stamp = 0;
  const cells: [number, number][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (filled[j * cols + i]) { cells.push([i, j]); continue; }
      const x = (i + 0.5) * cellMm - dilMm, y = (j + 0.5) * cellMm - dilMm;
      const X = Math.floor(x / s) - hx0, Y = Math.floor(y / s) - hy0;
      const bucket = X >= 0 && Y >= 0 && X < hcols && Y < hrows ? hash[Y * hcols + X] : undefined;
      stamp++;
      let near = false;
      if (bucket) {
        for (const ei of bucket) {
          if (seen[ei] === stamp) continue;
          seen[ei] = stamp;
          const dx = bx[ei] - ax[ei], dy = by[ei] - ay[ei], l2 = dx * dx + dy * dy;
          let d: number;
          if (l2 === 0) d = Math.hypot(x - ax[ei], y - ay[ei]);
          else {
            const t = Math.min(1, Math.max(0, ((x - ax[ei]) * dx + (y - ay[ei]) * dy) / l2));
            d = Math.hypot(x - (ax[ei] + t * dx), y - (ay[ei] + t * dy));
          }
          if (d <= dilMm) { near = true; break; }
        }
      }
      if (near) cells.push([i, j]);
    }
  }
  return { cols, rows, cells };
}

interface Copy { partId: string; itemId: string; loopsMm: Pt[][]; area: number; unit: string | null; copy: number }

interface Board { grid: Uint8Array; cols: number; rows: number; placements: NestPlacement[] }

/** pack parts onto as few boards as possible; a sheet never mixes materials */
export function nestOnBoards(parts: NestInput[], board: { wMm: number; hMm: number }, opts: NestOpts): NestResult {
  const { marginMm: m, spacingMm } = opts;
  const cell = nestCellMm(board), dil = spacingMm / 2;
  const cols = Math.floor((board.wMm - 2 * m) / cell), rows = Math.floor((board.hMm - 2 * m) / cell);
  const rotations = opts.allowRotate ? [0, 45, 90, 135, 180, 225, 270, 315] : [0, 90, 180, 270];
  const colourOf = new Map<string, string>();
  for (const p of parts) if (!colourOf.has(p.material)) colourOf.set(p.material, p.colour);

  // expand qty; a kept-together group's copies form one atomic unit per copy index
  const copies: Copy[] = [];
  for (const p of parts) {
    const { wMm, hMm } = extentOf(p.loopsMm);
    const area = wMm * hMm;
    for (let c = 0; c < Math.max(0, Math.floor(p.qty)); c++) {
      copies.push({ partId: p.partId, itemId: p.itemId, loopsMm: p.loopsMm, area, unit: p.keepTogether && p.groupId ? `${p.groupId}#${c}` : null, copy: c });
    }
  }
  const units = new Map<string, Copy[]>();
  for (const c of copies) {
    const k = c.unit ?? `~${c.partId}#${c.copy}`;
    if (!units.has(k)) units.set(k, []);
    units.get(k)!.push(c);
  }
  const ordered = [...units.values()].map((u) => [...u].sort((a, b) => b.area - a.area || (a.partId < b.partId ? -1 : 1) || a.copy - b.copy));
  ordered.sort((a, b) => {
    const aa = a.reduce((s, c) => s + c.area, 0), bb = b.reduce((s, c) => s + c.area, 0);
    if (aa !== bb) return bb - aa;
    const ka = a[0].unit ?? `~${a[0].partId}#${a[0].copy}`, kb = b[0].unit ?? `~${b[0].partId}#${b[0].copy}`;
    return ka < kb ? -1 : 1;
  });

  // rasterize each part once per rotation
  const rasters = new Map<string, { loops: Pt[][]; r: Raster }[]>();
  for (const c of copies) {
    if (rasters.has(c.partId)) continue;
    rasters.set(c.partId, rotations.map((deg) => {
      const loops = rotatedLoops(c.loopsMm, deg);
      return { loops, r: rasterize(loops, cell, dil) };
    }));
  }

  interface Sheet extends Board { material: string }
  const sheets: Sheet[] = [];
  const fresh = (material: string): Sheet => ({ material, grid: new Uint8Array(Math.max(0, cols * rows)), cols, rows, placements: [] });

  /** first-fit of one copy on a board over every rotation; lowest, then leftmost, then rotation order */
  const firstFit = (b: Board, rots: { r: Raster }[]): { rot: number; px: number; py: number } | null => {
    let best: { rot: number; px: number; py: number } | null = null;
    for (let rot = 0; rot < rots.length; rot++) {
      const { cols: cw, rows: ch, cells } = rots[rot].r;
      if (cw > b.cols || ch > b.rows) continue;
      for (let py = 0; py + ch <= b.rows && (!best || py <= best.py); py++) {
        for (let px = 0; px + cw <= b.cols && (!best || py < best.py || px < best.px); px++) {
          let ok = true;
          for (const [i, j] of cells) {
            if (b.grid[(py + j) * b.cols + px + i]) { ok = false; break; }
          }
          if (ok) { best = { rot, px, py }; break; }
        }
      }
    }
    return best;
  };
  const stamp = (b: Board, cells: [number, number][], px: number, py: number, v: 0 | 1): void => {
    for (const [i, j] of cells) {
      const x = px + i, y = py + j;
      if (x >= 0 && y >= 0 && x < b.cols && y < b.rows) b.grid[y * b.cols + x] = v;
    }
  };
  const atOf = (px: number, py: number): [number, number] => [m + px * cell + dil, m + py * cell + dil];

  // largest units first, each onto the first board with room (a fresh unit-only board when not)
  for (const unit of ordered) {
    const mat = parts.find((p) => p.partId === unit[0].partId)!.material;
    let done = false;
    for (const b of sheets.filter((s) => s.material === mat)) {
      const trial: { copy: Copy; rot: number; px: number; py: number }[] = [];
      let ok = true;
      for (const c of unit) {
        const f = firstFit(b, rasters.get(c.partId)!);
        if (!f) { ok = false; break; }
        stamp(b, rasters.get(c.partId)![f.rot].r.cells, f.px, f.py, 1);
        trial.push({ copy: c, ...f });
      }
      if (!ok) { for (const t of trial) stamp(b, rasters.get(t.copy.partId)![t.rot].r.cells, t.px, t.py, 0); continue; }
      for (const t of trial) b.placements.push({ partId: t.copy.partId, itemId: t.copy.itemId, at: atOf(t.px, t.py), rotateDeg: rotations[t.rot] });
      done = true;
      break;
    }
    if (done) continue;
    // a fresh board for the unit (made lazily: an all-oversize unit leaves no empty board behind)
    let b: Sheet | null = null;
    const board = (): Sheet => {
      if (!b) { b = fresh(mat); sheets.push(b); }
      return b;
    };
    for (const c of unit) {
      const rots = rasters.get(c.partId)!;
      const empty = board();
      if (!rots.some(({ r }) => r.cols <= empty.cols && r.rows <= empty.rows)) {
        // oversized: its own sheet at the margin, stamped full so nothing joins it
        const solo = fresh(mat);
        solo.grid.fill(1);
        solo.placements.push({ partId: c.partId, itemId: c.itemId, at: atOf(0, 0), rotateDeg: 0, oversize: extentOf(c.loopsMm) });
        sheets.push(solo);
        continue;
      }
      let f = firstFit(empty, rots);
      if (!f) { b = fresh(mat); sheets.push(b); f = firstFit(b, rots)!; }
      stamp(b!, rots[f.rot].r.cells, f.px, f.py, 1);
      b!.placements.push({ partId: c.partId, itemId: c.itemId, at: atOf(f.px, f.py), rotateDeg: rotations[f.rot] });
    }
    // an all-oversize unit leaves its untouched board behind: drop it
    if (b && !b.placements.length) sheets.splice(sheets.indexOf(b), 1);
  }
  return { sheets: sheets.map((s) => ({ material: s.material, colour: colourOf.get(s.material) ?? '#ffffff', placements: s.placements })) };
}
