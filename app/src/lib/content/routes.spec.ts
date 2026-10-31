import { describe, expect, it } from 'vitest';
import { legacyPath } from './routes';

describe('legacy /snap links redirect to the root routes', () => {
  it('maps the gate, the workshop and studio pages', () => {
    expect(legacyPath('/snap/welcome')).toBe('/');
    expect(legacyPath('/snap')).toBe('/workshop');
    expect(legacyPath('/snap/capture')).toBe('/capture');
    expect(legacyPath('/snap/canvas')).toBe('/canvas');
  });
  it('maps the image → layers flow onto /make (no doubled layers/layers)', () => {
    expect(legacyPath('/snap/layers/source')).toBe('/make/layers');
    expect(legacyPath('/snap/layers/cutout')).toBe('/make/layers');
    expect(legacyPath('/snap/layers/objects')).toBe('/make/layers');
    expect(legacyPath('/snap/layers/layers')).toBe('/make/layers');
    expect(legacyPath('/snap/layers/material')).toBe('/make/layers');
    expect(legacyPath('/snap/layers/cut')).toBe('/make/output');
    expect(legacyPath('/snap/layers/views')).toBe('/make/views');
  });
  it('Import, Cutout and Segment are part of Layers now; non-legacy paths are left alone', () => {
    expect(legacyPath('/snap/convert')).toBe('/make/layers');
    for (const p of ['/make/import', '/make/cutout', '/make/segment']) expect(legacyPath(p)).toBe('/make/layers');
    expect(legacyPath('/snap/layers/unknown')).toBe('/make/layers');
    expect(legacyPath('/make/layers')).toBeNull();
    expect([legacyPath('/crafts'), legacyPath('/batch')]).toEqual(['/workshop', '/queue']);
    expect(legacyPath('/snapshot')).toBeNull();
  });
});
