import { describe, expect, it } from 'vitest';
import { craftSections, sections } from './sections';

describe('app sections (design/11: phone icon nav and studio rail share the lists)', () => {
  it('Home (start + your crafts) and the cut queue; a craft adds its steps: Layers · Cut · Assemble', () => {
    expect(sections.map((s) => [s.id, s.href])).toEqual([['workshop', '/workshop'], ['queue', '/queue']]);
    expect(sections.filter((s) => s.phone !== false).map((s) => s.id)).toEqual(['workshop', 'queue']);
    expect(craftSections().map((s) => [s.label, s.href])).toEqual([['Layers', '/make/layers'], ['Cut', '/make/output'], ['Assemble', '/make/assemble']]);
    expect(craftSections('3d')[0].href).toBe('/make/views');
  });

  it('gives every section a label and a Solar icon for the rail', () => {
    for (const s of [...sections, ...craftSections()]) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon).toMatch(/^i-solar:[a-z0-9-]+-linear$/);
    }
  });
});

describe('sectionFor (which rail item is current)', () => {
  it('matches the longest section prefix, so stage routes keep their section', async () => {
    const { sectionFor } = await import('./sections');
    expect(sectionFor('/workshop')).toBe('workshop');
    expect(sectionFor('/capture')).toBe('workshop');
    expect(sectionFor('/make/layers')).toBe('layers');
    expect(sectionFor('/make/gaps')).toBe('layers');
    expect(sectionFor('/make/views')).toBe('layers');
    expect(sectionFor('/make/output')).toBe('cut');
    expect(sectionFor('/make/assemble')).toBe('assemble');
    expect(sectionFor('/queue')).toBe('queue');
    expect(sectionFor('/hood')).toBe('workshop');
  });
});

describe('studio tools (rail only)', () => {
  it('lists actions, chains, materials, annotations and settings below the divider', async () => {
    const { tools } = await import('./sections');
    expect(tools.map((t) => [t.id, t.href])).toEqual([['actions', '/actions'], ['chains', '/chains'], ['materials', '/materials'], ['annotations', '/annotations'], ['settings', '/settings']]);
  });
});
