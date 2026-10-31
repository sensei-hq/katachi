// Decodes the craft's photo into pixels for the code-side measurements (domain/layering). Browser only:
// returns null where there is no canvas (SSR, unit tests), and callers keep the model results as they are.
import type { PixelImage } from '../domain/colour';

/** the photo at a working size (long edge `max` px), or null when it cannot be decoded here */
export async function loadPixels(url: string | undefined, max = 400): Promise<PixelImage | null> {
  if (!url || !/^(data:image\/|https?:|blob:)/.test(url) || typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    await Promise.race([
      new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = url; }),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('decode timeout')), 4000))
    ]);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch { return null; }
}

/** a JPEG copy of an image with its long edge at most `max` px (keeps uploads small enough to store and send,
 *  and in a format the Meta API accepts: AVIF/HEIC/PNG become JPEG) */
export async function downscale(url: string, max = 1600, quality = 0.88): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return url;
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch { return url; }
  const s = Math.min(1, max / Math.max(img.width, img.height));
  if (s === 1 && url.startsWith('data:image/jpeg')) return url;
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', quality);
}
