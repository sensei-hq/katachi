// Cut profiles (task T2): one per device, today's beds, margins and program settings.
import type { DeviceId } from '../../content/layers';
import type { CutProfile } from './types';

/** fresh settings each call so profiles never share (and mutate) one object */
function settings(): CutProfile['settings'] {
  return {
    cut: { feed: 600, power: 900, passes: 1 },
    engrave: { feed: 3000, power: 250, passes: 1 },
    score: { feed: 1500, power: 400, passes: 1 },
  };
}

export const defaultProfiles: CutProfile[] = [
  { id: 'cricut', label: 'Cricut Maker 3', device: 'cricut', machine: 'blade', material: '', board: { wMm: 304.8, hMm: 304.8 }, marginMm: 5, spacingMm: 3, kerfMm: 0, settings: settings(), layout: 'one-part-per-sheet' },
  { id: 'xtool', label: 'xTool S1 laser', device: 'xtool', machine: 'laser', material: '', board: { wMm: 300, hMm: 300 }, marginMm: 5, spacingMm: 3, kerfMm: 0.15, settings: settings(), layout: 'one-part-per-sheet' },
  { id: 'glowforge', label: 'Glowforge Pro', device: 'glowforge', machine: 'laser', material: '', board: { wMm: 495, hMm: 279 }, marginMm: 5, spacingMm: 3, kerfMm: 0.2, settings: settings(), layout: 'one-part-per-sheet' },
  { id: 'file', label: 'Just the files', device: 'file', machine: 'blade', material: '', board: { wMm: 304.8, hMm: 304.8 }, marginMm: 5, spacingMm: 3, kerfMm: 0, settings: settings(), layout: 'one-part-per-sheet' },
];

/** the device's short name for warnings ("xTool S1", not the profile label's "xTool S1 laser") */
export function deviceShortName(device: DeviceId): string {
  return { cricut: 'Cricut Maker 3', xtool: 'xTool S1', glowforge: 'Glowforge Pro', file: 'Just the files' }[device];
}

/** the device's profile with the material set (a copy; the defaults are never mutated) */
export function profileFor(device: DeviceId, material: string): CutProfile {
  const p = defaultProfiles.find((d) => d.device === device);
  if (!p) throw new Error(`unknown device "${device}"`);
  return { ...p, material, settings: settings() };
}
