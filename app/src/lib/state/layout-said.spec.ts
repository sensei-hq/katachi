import { describe, expect, it } from 'vitest';
import { layoutSaid } from './app.svelte';

describe('the Cut layout, said in the chat', () => {
  it('reads fit to board, pairs together and one per sheet; anything else is not a layout', () => {
    expect(['fit to board', 'fit them all on one board', 'put everything on one sheet', 'pack them onto as few sheets as possible'].map(layoutSaid)).toEqual(['nest', 'nest', 'nest', 'nest']);
    expect(['keep the pairs together', 'each pair on one sheet'].map(layoutSaid)).toEqual(['groups-together', 'groups-together']);
    expect(layoutSaid('one per sheet')).toBe('one-part-per-sheet');
    expect(['lay the earrings on a single board', 'there are 14 pairs of earrings cut on a single board'].map(layoutSaid)).toEqual(['nest', 'nest']);
    expect(['smooth all layers', 'remove the hooks', 'lay them out separately', 'make the gold layer thinner'].map(layoutSaid)).toEqual([null, null, null, null]);
  });
});
