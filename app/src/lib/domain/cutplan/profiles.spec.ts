import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../../content/layers';
import { defaultProfiles, profileFor } from './profiles';

describe('cutplan profiles', () => {
  it('defaultProfiles: one per device with today\'s beds and kerfs', () => {
    expect(defaultProfiles.map((p) => p.device)).toEqual(['cricut', 'xtool', 'glowforge', 'file']);
    const byId = Object.fromEntries(defaultProfiles.map((p) => [p.device, p]));
    expect(byId.cricut.machine).toBe('blade');
    expect(byId.cricut.board).toEqual({ wMm: 304.8, hMm: 304.8 });
    expect([byId.cricut.marginMm, byId.cricut.spacingMm, byId.cricut.kerfMm]).toEqual([5, 3, 0]);
    expect(byId.xtool.board).toEqual({ wMm: 300, hMm: 300 });
    expect(byId.xtool.kerfMm).toBe(0.15);
    expect(byId.glowforge.board).toEqual({ wMm: 495, hMm: 279 });
    expect(byId.glowforge.kerfMm).toBe(0.2);
    expect(byId.file.board).toEqual({ wMm: 304.8, hMm: 304.8 });
  });
  it('settings match toolpath program() defaults; layout defaults to one-part-per-sheet', () => {
    for (const p of defaultProfiles) {
      expect(p.settings.cut).toEqual({ feed: 600, power: 900, passes: 1 });
      expect(p.settings.engrave).toEqual({ feed: 3000, power: 250, passes: 1 });
      expect(p.settings.score).toEqual({ feed: 1500, power: 400, passes: 1 });
      expect(p.layout).toBe('one-part-per-sheet');
    }
  });
  it('profileFor picks the device profile and sets the material without mutating defaults', () => {
    const p = profileFor('xtool', 'birch');
    expect(p.device).toBe('xtool');
    expect(p.material).toBe('birch');
    expect(p.board).toEqual({ wMm: 300, hMm: 300 });
    expect(defaultProfiles.find((d) => d.device === 'xtool')!.material).toBe('');
    expect(() => profileFor('nope' as DeviceId, 'x')).toThrow('unknown device');
  });
});
