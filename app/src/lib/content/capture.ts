// Capture copy: one wizard for camera and upload, single shot or six sides of a 3D object.
export type CaptureSource = 'camera' | 'upload' | 'sketch';
export type CaptureMode = 'single' | 'multi';
export type SideId = 'front' | 'right' | 'back' | 'left' | 'top' | 'base';

export const captureSources: { label: string; value: CaptureSource; icon: string }[] = [
  { label: 'Camera', value: 'camera', icon: 'i-solar:camera-linear' },
  { label: 'Upload', value: 'upload', icon: 'i-solar:gallery-linear' },
  { label: 'Sketch', value: 'sketch', icon: 'i-solar:pen-new-square-linear' }
];
export const captureModes: { label: string; value: CaptureMode }[] = [
  { label: 'Single shot', value: 'single' },
  { label: 'Several views', value: 'multi' }
];
export const sides: { id: SideId; label: string }[] = [
  { id: 'front', label: 'Front' }, { id: 'right', label: 'Right' }, { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' }, { id: 'top', label: 'Top' }, { id: 'base', label: 'Base' }
];

/** A drawn stand-in frame when no camera is available (desktop without a webcam, tests). Clearly labelled. */
export function demoFrame(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#2B231A"/>`
    + `<rect x="120" y="70" width="160" height="150" rx="6" fill="#C9A47A"/><path d="M120 70 L200 20 L280 70 Z" fill="#8A6A4F"/>`
    + `<circle cx="200" cy="140" r="22" fill="#3B2E24"/>`
    + `<text x="200" y="285" font-family="sans-serif" font-size="16" fill="#F3EEE3" text-anchor="middle">demo frame · ${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
