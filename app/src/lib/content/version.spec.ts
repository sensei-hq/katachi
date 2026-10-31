import { describe, expect, it } from 'vitest';
import { appVersion, versionDetail, versionLabel } from './version';
import pkg from '../../../package.json';

describe('app version (bumpp bumps package.json; the UI shows it)', () => {
  it('is the package.json version, with the commit', () => {
    expect(appVersion).toBe(pkg.version);
    expect(versionLabel).toMatch(new RegExp(`^v${pkg.version.replace(/\./g, '\\.')} · \\S+$`));
  });
  it('detail adds the build time', () => {
    expect(versionDetail('en-GB')).toMatch(/^v\d+\.\d+\.\d+ · \S+ · built /);
  });
});
