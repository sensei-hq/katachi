// Sheet files (task T5): SVG export, and SVG import back to an exact-geometry craft. Pure; no DOM.
import { depths, fromLoops, mul, rotate, scale, toLoops, transform, translate, type Geometry, type Mat, type Path, type Pt, type Seg } from '../geo';
import { frameSize } from '../craft';
import type { CraftDoc, OpDoc, OpKind, PartDoc } from '../craft/types';
import type { Sheet } from '../cutplan/types';

export interface SheetSvgOpts { digits?: number }

const signedArea = (l: Pt[]): number => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** a sheet as an SVG in mm (Glowforge / LightBurn / xTool read the red/blue/black convention) */
export function sheetToSvg(sheet: Sheet, opts: SheetSvgOpts = {}): string {
  const digits = opts.digits ?? 3;
  const f = (v: number): string => String(+v.toFixed(digits));
  const [W, H] = sheet.sizeMm;
  const styleOf = (kind: string): string => {
    if (kind === 'cut') return 'fill="none" stroke="#FF0000" stroke-width="0.1"';
    if (kind === 'score') return 'fill="none" stroke="#0000FF" stroke-width="0.1"';
    return 'fill="#000000" stroke="none"';
  };
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">\n`;
  for (const kind of ['engrave', 'score', 'cut'] as const) {
    const passes = sheet.passes.filter((p) => p.kind === kind);
    if (!passes.length) continue;
    out += `  <g id="${kind}" ${styleOf(kind)}>\n`;
    const seen = new Set<string>();
    for (const p of passes) {
      if (seen.has(p.partId)) continue;
      seen.add(p.partId);
      out += `    <g data-part="${p.partId}">\n`;
      for (const q of passes.filter((x) => x.partId === p.partId)) {
        for (const loop of q.shapesMm) {
          if (!loop.length) continue;
          const last = loop[loop.length - 1];
          const pts = loop.length > 1 && loop[0][0] === last[0] && loop[0][1] === last[1] ? loop.slice(0, -1) : loop;
          // loops that enclose nothing are open strokes; anything with area closes
          const d = `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')}${Math.abs(signedArea(pts)) > 1e-9 ? ' Z' : ''}`;
          out += `      <path d="${d}"/>\n`;
        }
      }
      out += '    </g>\n';
    }
    out += '  </g>\n';
  }
  return `${out}</svg>\n`;
}

// ── import ──

interface XmlNode { tag: string; attrs: Record<string, string>; children: XmlNode[] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (s: string): string => s
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 16)));

/** minimal XML: elements, attributes and nesting; comments, declarations and text are skipped */
function parseXml(s: string): XmlNode {
  const root: XmlNode = { tag: '', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
    if (s.startsWith('<?', lt)) { const e = s.indexOf('?>', lt + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (s.startsWith('<!', lt)) { const e = s.indexOf('>', lt + 2); i = e < 0 ? s.length : e + 1; continue; }
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0) break;
    const inner = s.slice(lt + 1, gt);
    if (inner.startsWith('/')) {
      const name = inner.slice(1).trim().split(/[\s/]/)[0];
      if (stack.length > 1 && stack[stack.length - 1].tag === name) stack.pop();
      i = gt + 1;
      continue;
    }
    const selfClose = inner.endsWith('/');
    const body = selfClose ? inner.slice(0, -1) : inner;
    const m = body.match(/^\s*([A-Za-z][\w:.-]*)/);
    if (!m) { i = gt + 1; continue; }
    const attrs: Record<string, string> = {};
    const attrRe = /([A-Za-z][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(body))) attrs[am[1]] = decodeEntities(am[2].slice(1, -1));
    const node: XmlNode = { tag: m[1], attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root;
}

const local = (tag: string): string => (tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag);
const num = (v: string | undefined, dflt = 0): number => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function findSvg(node: XmlNode): XmlNode | null {
  if (local(node.tag) === 'svg') return node;
  for (const ch of node.children) {
    const f = findSvg(ch);
    if (f) return f;
  }
  return null;
}

/** an svg transform list → one matrix (functions compose left to right, like nested groups) */
function parseTransform(attr: string | undefined): Mat {
  let m: Mat = [1, 0, 0, 1, 0, 0];
  if (!attr) return m;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(attr))) {
    const nums = mm[2].split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
    if (mm[1] === 'matrix' && nums.length >= 6) m = mul(m, [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]);
    else if (mm[1] === 'translate' && nums.length) m = mul(m, translate(nums[0], nums.length > 1 ? nums[1] : 0));
    else if (mm[1] === 'scale' && nums.length) m = mul(m, scale(nums[0], nums.length > 1 ? nums[1] : nums[0]));
    else if (mm[1] === 'rotate' && nums.length) m = mul(m, nums.length > 2 ? rotate(nums[0], [nums[1], nums[2]]) : rotate(nums[0]));
    // anything else (skew, …) is not maker-geometry; it is ignored
  }
  return m;
}

interface Sub { start: Pt; segs: Seg[]; closed: boolean }
const lerp23 = (a: Pt, b: Pt): Pt => [a[0] + (2 / 3) * (b[0] - a[0]), a[1] + (2 / 3) * (b[1] - a[1])];

/** endpoint-parameterized arc → cubic beziers, per SVG F.6.5 (empty when there is nothing to draw) */
function arcBeziers(p0: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): [Pt, Pt, Pt][] {
  if (!(rx > 0) || !(ry > 0)) return [];
  if (p0[0] === p1[0] && p0[1] === p1[1] && !large) return [];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  let rrx = Math.abs(rx), rry = Math.abs(ry);
  const lam = (x1 * x1) / (rrx * rrx) + (y1 * y1) / (rry * rry);
  if (lam > 1) { const s = Math.sqrt(lam); rrx *= s; rry *= s; }
  const num = rrx * rrx * rry * rry - rrx * rrx * y1 * y1 - rry * rry * x1 * x1;
  const den = rrx * rrx * y1 * y1 + rry * rry * x1 * x1;
  const f = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)));
  const cxp = (f * rrx * y1) / rry, cyp = (-f * rry * x1) / rrx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const c = d === 0 ? 1 : Math.min(1, Math.max(-1, (ux * vx + uy * vy) / d));
    const a = Math.acos(c);
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  let t1 = ang(1, 0, (x1 - cxp) / rrx, (y1 - cyp) / rry);
  let dt = ang((x1 - cxp) / rrx, (y1 - cyp) / rry, (-x1 - cxp) / rrx, (-y1 - cyp) / rry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  if (p0[0] === p1[0] && p0[1] === p1[1] && large) { t1 = 0; dt = 2 * Math.PI; }
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const P = (t: number): Pt => [cx + rrx * Math.cos(t) * cp - rry * Math.sin(t) * sp, cy + rrx * Math.cos(t) * sp + rry * Math.sin(t) * cp];
  const T = (t: number): Pt => [-rrx * Math.sin(t) * cp - rry * Math.cos(t) * sp, -rrx * Math.sin(t) * sp + rry * Math.cos(t) * cp];
  const out: [Pt, Pt, Pt][] = [];
  for (let k = 0; k < n; k++) {
    const a0 = t1 + (dt * k) / n, a1 = t1 + (dt * (k + 1)) / n;
    const a = (4 / 3) * Math.tan((a1 - a0) / 4);
    const q0 = P(a0), q3 = P(a1), d0 = T(a0), d1 = T(a1);
    out.push([[q0[0] + a * d0[0], q0[1] + a * d0[1]], [q3[0] - a * d1[0], q3[1] - a * d1[1]], q3]);
  }
  return out;
}

/** path data → subpaths (M L H V C S Q T A Z, absolute and relative; quadrics and arcs become cubics) */
function parsePathData(d: string): Sub[] {
  const tokens = d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Sub[] = [];
  const cur: { sub: Sub | null } = { sub: null };
  let i = 0, at: Pt = [0, 0], cubic: Pt | null = null, quad: Pt | null = null;
  const num = (): number => { const n = Number(tokens[i++]); return Number.isFinite(n) ? n : 0; };
  const flag = (): number => {
    const t = tokens[i++] ?? '0';
    // arc flags may run together ("01"): split the token and push the rest back
    if (t.length > 1 && (t[0] === '0' || t[0] === '1')) { tokens.splice(i, 0, t.slice(1)); return Number(t[0]); }
    return Number(t) || 0;
  };
  const begin = (p: Pt): Sub => {
    if (cur.sub && cur.sub.segs.length) subs.push(cur.sub);
    cur.sub = { start: p, segs: [], closed: false };
    at = p; cubic = null; quad = null;
    return cur.sub;
  };
  const line = (p: Pt): void => { (cur.sub ?? begin(at)).segs.push({ k: 'L', to: p }); at = p; cubic = null; quad = null; };
  const curve = (c1: Pt, c2: Pt, p: Pt): void => { (cur.sub ?? begin(at)).segs.push({ k: 'C', c1, c2, to: p }); at = p; cubic = c2; quad = null; };
  const isNum = (): boolean => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'Z' || t === 'z') {
      if (cur.sub) { cur.sub.closed = true; at = cur.sub.start; }
      cubic = null; quad = null;
      continue;
    }
    const rel = t === t.toLowerCase();
    const cmd = t.toUpperCase();
    const pt = (): Pt => { const x = num(), y = num(); return rel ? [at[0] + x, at[1] + y] : [x, y]; };
    if (cmd === 'M') { begin(pt()); while (isNum()) line(pt()); }
    else if (cmd === 'L') { do { line(pt()); } while (isNum()); }
    else if (cmd === 'H') { do { const x = num(); line(rel ? [at[0] + x, at[1]] : [x, at[1]]); } while (isNum()); }
    else if (cmd === 'V') { do { const y = num(); line(rel ? [at[0], at[1] + y] : [at[0], y]); } while (isNum()); }
    else if (cmd === 'C') { do { const c1 = pt(), c2 = pt(), p = pt(); curve(c1, c2, p); } while (isNum()); }
    else if (cmd === 'S') {
      do {
        const c0 = cubic ?? at, c2 = pt(), p = pt();
        curve([2 * at[0] - c0[0], 2 * at[1] - c0[1]], c2, p);
      } while (isNum());
    } else if (cmd === 'Q') {
      do {
        const q = pt(), p = pt();
        curve(lerp23(at, q), lerp23(p, q), p);
        cubic = null; quad = q;
      } while (isNum());
    } else if (cmd === 'T') {
      do {
        const r = quad ?? at, p = pt();
        const q: Pt = [2 * at[0] - r[0], 2 * at[1] - r[1]];
        curve(lerp23(at, q), lerp23(p, q), p);
        cubic = null; quad = q;
      } while (isNum());
    } else if (cmd === 'A') {
      do {
        const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(), p = pt();
        const segs = arcBeziers(at, rx, ry, rot, large !== 0, sweep !== 0, p);
        if (!segs.length && (p[0] !== at[0] || p[1] !== at[1])) line(p);
        for (const [c1, c2, to] of segs) curve(c1, c2, to);
      } while (isNum());
    }
  }
  if (cur.sub && cur.sub.segs.length) subs.push(cur.sub);
  return subs;
}

/** ellipse → 4 cubics (the standard 0.5523 approximation) */
function ellipseSub(cx: number, cy: number, rx: number, ry: number): Sub | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const k = 0.5522847498307936;
  return {
    start: [cx + rx, cy],
    segs: [
      { k: 'C', c1: [cx + rx, cy + k * ry], c2: [cx + k * rx, cy + ry], to: [cx, cy + ry] },
      { k: 'C', c1: [cx - k * rx, cy + ry], c2: [cx - rx, cy + k * ry], to: [cx - rx, cy] },
      { k: 'C', c1: [cx - rx, cy - k * ry], c2: [cx - k * rx, cy - ry], to: [cx, cy - ry] },
      { k: 'C', c1: [cx + k * rx, cy - ry], c2: [cx + rx, cy - k * ry], to: [cx + rx, cy] },
    ],
    closed: true,
  };
}

function rectSubs(a: Record<string, string>): Sub[] {
  const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
  if (!(w > 0) || !(h > 0)) return [];
  const rxN = a.rx === undefined ? undefined : num(a.rx);
  const ryN = a.ry === undefined ? undefined : num(a.ry);
  const qx = Math.min(Math.max(rxN ?? ryN ?? 0, 0), w / 2);
  const qy = Math.min(Math.max(ryN ?? rxN ?? 0, 0), h / 2);
  if (qx === 0 || qy === 0) {
    return [{ start: [x, y], segs: [{ k: 'L', to: [x + w, y] }, { k: 'L', to: [x + w, y + h] }, { k: 'L', to: [x, y + h] }], closed: true }];
  }
  const k = 0.5522847498307936;
  return [{
    start: [x + qx, y],
    segs: [
      { k: 'L', to: [x + w - qx, y] },
      { k: 'C', c1: [x + w - qx + k * qx, y], c2: [x + w, y + qy - k * qy], to: [x + w, y + qy] },
      { k: 'L', to: [x + w, y + h - qy] },
      { k: 'C', c1: [x + w, y + h - qy + k * qy], c2: [x + w - qx + k * qx, y + h], to: [x + w - qx, y + h] },
      { k: 'L', to: [x + qx, y + h] },
      { k: 'C', c1: [x + qx - k * qx, y + h], c2: [x, y + h - qy + k * qy], to: [x, y + h - qy] },
      { k: 'L', to: [x, y + qy] },
      { k: 'C', c1: [x, y + qy - k * qy], c2: [x + qx - k * qx, y], to: [x + qx, y] },
    ],
    closed: true,
  }];
}

function pointsSubs(points: string | undefined, closed: boolean): Sub[] {
  const nums = (points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  if (pts.length < 2) return [];
  return [{ start: pts[0], segs: pts.slice(1).map((to) => ({ k: 'L', to })), closed }];
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', olive: '#808000', green: '#008000', navy: '#000080', purple: '#800080',
  teal: '#008080', orange: '#ffa500',
};

/** css color → rgb, or null for none/unknown */
function parseColor(s: string): [number, number, number] | null {
  const t = s.trim().toLowerCase();
  if (!t || t === 'none') return null;
  if (NAMED[t]) return parseColor(NAMED[t]);
  const hex = t.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1].length <= 4 ? hex[1].slice(0, 3).split('').map((c) => c + c).join('') : hex[1].slice(0, 6);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = t.match(/^rgba?\(([^)]*)\)$/);
  if (rgb) {
    const parts = rgb[1].split(',').map((x) => x.trim());
    if (parts.length < 3) return null;
    const ch = (v: string): number => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const [r, g, b] = parts.map(ch);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? [r, g, b] : null;
  }
  return null;
}

const isRed = (c: [number, number, number] | null): boolean => !!c && c[0] >= 200 && c[1] <= 80 && c[2] <= 80;
const isBlue = (c: [number, number, number] | null): boolean => !!c && c[2] >= 200 && c[0] <= 80 && c[1] <= 80;
const isBlack = (c: [number, number, number] | null): boolean => !!c && Math.max(c[0], c[1], c[2]) <= 80;

/** laser meaning of a shape's paint: red cuts, blue scores, black and fills engrave, the rest cuts */
function kindOf(stroke: string | undefined, fill: string | undefined): OpKind {
  const s = stroke === undefined ? null : parseColor(stroke);
  if (isRed(s)) return 'cut';
  if (isBlue(s)) return 'score';
  if (fill === undefined) return 'engrave';
  if (parseColor(fill) !== null) return 'engrave';
  if (isBlack(s)) return 'engrave';
  return 'cut';
}

const styleOf = (attrs: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of (attrs.style ?? '').split(';')) {
    const ci = part.indexOf(':');
    if (ci > 0) out[part.slice(0, ci).trim().toLowerCase()] = part.slice(ci + 1).trim();
  }
  return out;
};

// elements whose subtrees are never maker geometry (definitions, metadata, text, use-references)
const SKIP = new Set(['defs', 'clipPath', 'mask', 'pattern', 'symbol', 'marker', 'title', 'desc', 'metadata', 'style', 'script', 'use', 'text', 'tspan', 'image', 'foreignObject']);

interface Found { geo: Geometry; kind: OpKind }

/** walk the tree, resolving transforms and paint; shapes arrive in document order, already in mm */
function walk(el: XmlNode, ctm: Mat, stroke: string | undefined, fill: string | undefined, mm: Mat, found: Found[]): void {
  const tag = local(el.tag);
  if (SKIP.has(tag)) return;
  const st = styleOf(el.attrs);
  const stStroke = st.stroke ?? el.attrs.stroke ?? stroke;
  const stFill = st.fill ?? el.attrs.fill ?? fill;
  let m = mul(ctm, parseTransform(el.attrs.transform));
  if (tag === 'svg') m = mul(m, translate(num(el.attrs.x), num(el.attrs.y)));
  const kind = kindOf(stStroke, stFill);
  const emit = (subs: Sub[]): void => {
    if (!subs.length) return;
    found.push({ geo: transform({ paths: subs.map((s) => ({ start: s.start, segs: s.segs, closed: s.closed })) }, mul(mm, m)), kind });
  };
  if (tag === 'path') emit(parsePathData(el.attrs.d ?? ''));
  else if (tag === 'polygon') emit(pointsSubs(el.attrs.points, true));
  else if (tag === 'polyline') emit(pointsSubs(el.attrs.points, false));
  else if (tag === 'rect') emit(rectSubs(el.attrs));
  else if (tag === 'circle') {
    const e = ellipseSub(num(el.attrs.cx), num(el.attrs.cy), num(el.attrs.r), num(el.attrs.r));
    emit(e ? [e] : []);
  } else if (tag === 'ellipse') {
    const e = ellipseSub(num(el.attrs.cx), num(el.attrs.cy), num(el.attrs.rx), num(el.attrs.ry));
    emit(e ? [e] : []);
  } else for (const ch of el.children) walk(ch, m, stStroke, stFill, mm, found);
}

/** a width/height attribute → mm, or null unless it carries an mm, cm or in unit */
function mmOf(v: string | undefined): number | null {
  const m = v?.trim().match(/^(-?[\d.]+(?:[eE][-+]?\d+)?)\s*(mm|cm|in|px|pt|pc|q|%)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] ?? '').toLowerCase();
  if (u === 'mm') return n;
  if (u === 'cm') return n * 10;
  if (u === 'in') return n * 25.4;
  return null;
}

const pointInPoly = (p: Pt, poly: Pt[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export interface SvgImportOpts { name: string; newId: () => string; mmPerUnit?: number }

/** a maker's SVG → a craft with exact geometry (one kit-like 3d/assembly item); bezier work stays bezier */
export function svgToCraft(svg: string, opts: SvgImportOpts): CraftDoc {
  const svgEl = findSvg(parseXml(svg));
  if (!svgEl) throw new Error('svgToCraft: no <svg> root');
  const vbNums = (svgEl.attrs.viewBox ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const vb = vbNums.length === 4 && vbNums.every(Number.isFinite) && vbNums[2] > 0 && vbNums[3] > 0 ? vbNums : null;
  const wMm = mmOf(svgEl.attrs.width), hMm = mmOf(svgEl.attrs.height);
  let k = opts.mmPerUnit ?? 25.4 / 96;
  if (vb && wMm !== null) k = wMm / vb[2];
  else if (vb && hMm !== null) k = hMm / vb[3];
  const vx = vb ? vb[0] : 0, vy = vb ? vb[1] : 0;
  const mm = mul(translate(-vx * k, -vy * k), scale(k));
  const found: Found[] = [];
  walk(svgEl, [1, 0, 0, 1, 0, 0], undefined, undefined, mm, found);

  // each subpath keeps its exact segments; flattened copies decide the nesting only
  interface Rec { path: Path; loop: Pt[]; kind: OpKind; closed: boolean }
  const recs: Rec[] = [];
  for (const f of found) {
    for (const p of f.geo.paths) {
      const [loop] = toLoops({ paths: [p] }, 0.05);
      recs.push({ path: p, loop, kind: f.kind, closed: p.closed || (loop[0][0] === loop[loop.length - 1][0] && loop[0][1] === loop[loop.length - 1][1]) });
    }
  }
  // closed cuts nest into outlines (even depth, each its own part) with holes
  const cutClosed = recs.filter((r) => r.kind === 'cut' && r.closed);
  const ds = depths(fromLoops(cutClosed.map((r) => r.loop)));
  interface Asm { out: Rec; holes: Rec[]; slits: Rec[]; scores: Rec[]; engrs: Rec[] }
  const parts: Asm[] = [];
  cutClosed.forEach((r, i) => { if (ds[i] % 2 === 0) parts.push({ out: r, holes: [], slits: [], scores: [], engrs: [] }); });
  const smallestEven = (loop: Pt[]): Asm | null => {
    let best: Asm | null = null;
    for (const p of parts) {
      if (!pointInPoly(loop[0], p.out.loop)) continue;
      if (!best || Math.abs(signedArea(p.out.loop)) < Math.abs(signedArea(best.out.loop))) best = p;
    }
    return best;
  };
  cutClosed.forEach((r, i) => {
    if (ds[i] % 2 === 0) return;
    // depths and smallestEven share the containment test, so an odd loop always has a host
    smallestEven(r.loop)?.holes.push(r);
  });
  for (const r of recs) {
    if (r.kind === 'cut' && r.closed) continue;
    const host = smallestEven(r.loop);
    if (host) {
      if (r.kind === 'cut') host.slits.push(r);
      else if (r.kind === 'score') host.scores.push(r);
      else host.engrs.push(r);
      continue;
    }
    // an open cut with no outline is its own part; orphaned scores and engravings have nowhere to go
    if (r.kind === 'cut') parts.push({ out: r, holes: [], slits: [], scores: [], engrs: [] });
  }

  // the item's frame is tier XL over the whole drawing
  const all = recs.flatMap((r) => r.loop);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const wDraw = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const hDraw = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const size = frameSize('XL', wDraw, hDraw);
  const pxPerMm = Math.max(wDraw, hDraw) > 0 ? Math.max(...size) / Math.max(wDraw, hDraw) : 1;
  const px = (paths: Path[]): Geometry => transform({ paths }, scale(pxPerMm));
  const docParts: PartDoc[] = parts.map((p, i) => {
    const id = opts.newId();
    // machine order, as the cut plan reads them
    const ops: OpDoc[] = [];
    if (p.engrs.length) ops.push({ id: opts.newId(), kind: 'engrave', geometry: px(p.engrs.map((s) => s.path)) });
    if (p.scores.length) ops.push({ id: opts.newId(), kind: 'score', geometry: px(p.scores.map((s) => s.path)) });
    ops.push({ id: opts.newId(), kind: 'cut', geometry: px([p.out.path, ...p.holes.map((h) => h.path), ...p.slits.map((s) => s.path)]) });
    return { id, name: `Part ${i + 1}`, z: i, material: '3 mm ply', colour: '#C89B6A', ops };
  });
  return {
    v: 2, id: opts.newId(), name: opts.name, kind: '3d',
    createdAt: 0, updatedAt: 0, rev: 0,
    items: [{
      id: opts.newId(), name: opts.name, build: 'assembly',
      frame: { tier: 'XL', size, fromSource: { sourceId: 'svg-import', box: { x: 0, y: 0, w: 1000, h: 1000 }, rotateDeg: 0 }, pxPerMm },
      parts: docParts, joins: [],
    }],
    groups: [],
    sources: [{ id: 'svg-import', kind: 'kit-layout', w: Math.max(1, Math.round(vb ? vb[2] : wDraw)), h: Math.max(1, Math.round(vb ? vb[3] : hDraw)) }],
    history: { done: [], undone: [] },
  };
}
