import { describe, expect, it } from 'vitest';
import { BRIEF_MAX_LINES, BRIEF_MAX_WORDS } from '../engine/brief.ts';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, demoMessages, liveMessage } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';

// The full demo inbox (academic story + billing email). tests/brief.test.ts keeps covering the academic-only brief.
const state = (live = 0) => {
  const messages = demoMessages();
  for (let i = 0; i < live; i++) messages.push(liveMessage(i, DEMO_NOW)!);
  return buildState({ messages, actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: live, total: 3 } });
};

describe('morning brief with Money', () => {
  it('stays a 60-second read and never pushes out the academic hero beat', () => {
    for (const live of [0, 1, 2, 3]) {
      const b = state(live).brief;
      expect(b.lines.length).toBeLessThanOrEqual(BRIEF_MAX_LINES);
      expect(b.words).toBeLessThanOrEqual(BRIEF_MAX_WORDS);
      expect(b.readSeconds).toBeLessThanOrEqual(60);
      expect(b.lines.some((l) => l.itemId === 'item:15-122:hw5' && l.section === 'changed')).toBe(true);
      expect(b.lines.some((l) => l.section === 'money')).toBe(true);
    }
  });
  it('shows the two billing alerts that matter most, each linked to its subscription and sources', () => {
    const b = state().brief;
    const m = b.lines.find((l) => l.section === 'money')!;
    expect(m.text).toBe('Steel City Fitness payment failed · Adobe trial ends Fri → $19.99/mo');
    expect(m.parts!.map((p) => p.itemId)).toEqual(['sub:steel-city-fitness', 'sub:adobe-creative-cloud-photography']);
    expect(m.note).toBe('~$72.52/mo in subscriptions (estimate) · 2 more to check');
    expect(m.messageIds).toEqual(['f-gym-failed', 'f-adobe-trial']);
    expect(b.lines.map((l) => l.section)).toEqual(['changed', 'changed', 'changed', 'soon', 'decide', 'decide', 'money']);
    expect(b.overflow).toBeGreaterThan(0);
  });
  it('files billing mail under Money in the inbox, and promos stay noise', () => {
    const s = state();
    const by = (id: string) => s.messages.find((m) => m.id === id)!;
    expect(by('f-gym-failed').categories).toEqual(['money']);
    expect(by('f-gym-failed').subscriptionIds).toEqual(['sub:steel-city-fitness']);
    expect(by('f-gym-failed').summary).toBe('Steel City Fitness payment of $24.99 failed.');
    expect(by('f-disney-promo').categories).toEqual(['noise']);
    expect(s.stats.needToKnow).toBe(13);
  });
});
