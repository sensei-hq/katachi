// Prominent colour of a layer: the average photo colour under its traced mask paths.
// Pure sampling (code measures); paths are 0-1000 image coordinates, pixels are a decoded bitmap.
export interface PixelImage { data: Uint8ClampedArray | number[]; w: number; h: number }

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Mean colour (hex) of the pixels whose centre falls inside any of the paths; dark line-art pixels
 * darker than 12% luminance are down-weighted so engraved lines do not swamp the material colour. */
export function dominantColour(image: PixelImage, paths: [number, number][][], step = 2): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < image.h; y += step) for (let x = 0; x < image.w; x += step) {
    const nx = (x / image.w) * 1000, ny = (y / image.h) * 1000;
    if (!paths.some((p) => pointInPolygon(nx, ny, p))) continue;
    const i = (y * image.w + x) * 4;
    const pr = image.data[i], pg = image.data[i + 1], pb = image.data[i + 2];
    const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
    const wgt = lum < 30 ? 0.25 : 1;
    r += pr * wgt; g += pg * wgt; b += pb * wgt; n += wgt;
  }
  if (!n) return null;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0').toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
