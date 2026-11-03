import { describe, expect, it } from 'vitest';
import { oneThought, type TimelineMsg } from './conversation.svelte';

const step = (id: string, status: 'thinking' | 'working' | 'done' | 'failed'): TimelineMsg => ({ id, role: 'assistant', text: id, data: { step: { key: id, status, title: id, calls: [] } } });
const said = (id: string): TimelineMsg => ({ id, role: 'user', text: id });

describe('the timeline shows one thought at a time', () => {
  it('of the steps still thinking, only the latest; what was found stays in its place', () => {
    const log = [said('photo'), step('looking', 'thinking'), step('background', 'thinking'), step('items', 'working')];
    expect(oneThought(log).map((m) => m.id)).toEqual(['photo', 'items']);
    const later = [said('photo'), step('looking', 'done'), step('background', 'thinking'), step('items', 'thinking')];
    expect(oneThought(later).map((m) => m.id)).toEqual(['photo', 'looking', 'items']);
    const all = [said('photo'), step('looking', 'done'), step('background', 'done'), step('items', 'failed')];
    expect(oneThought(all)).toEqual(all);
  });
});
