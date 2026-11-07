import { describe, expect, it } from 'vitest';
import { BRIEF_MAX_LINES, BRIEF_MAX_WORDS } from '../engine/brief.ts';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, liveMessage, seedMessages } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';
import type { UserAction } from '../engine/types.ts';

const brief = (live = 0, actions: UserAction[] = []) => {
  const messages = seedMessages();
  for (let i = 0; i < live; i++) messages.push(liveMessage(i, DEMO_NOW)!);
  return buildState({ messages, actions, now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: live, total: 3 } }).brief;
};
const text = (b: ReturnType<typeof brief>) => b.lines.map((l) => `${l.text} ${l.note ?? ''}`).join('\n');

describe('morning brief', () => {
  it('stays a 60-second read', () => {
    for (const live of [0, 1, 2, 3]) {
      const b = brief(live);
      expect(b.lines.length).toBeLessThanOrEqual(BRIEF_MAX_LINES);
      expect(b.words).toBeLessThanOrEqual(BRIEF_MAX_WORDS);
      expect(b.readSeconds).toBeLessThanOrEqual(60);
    }
  });
  it('leads with the HW5 change at its reconciled date and flags the classmate repeating the old one', () => {
    const b = brief();
    const hw5 = b.lines.find((l) => l.itemId === 'item:15-122:hw5' && l.section === 'changed')!;
    expect(hw5.text).toBe('HW5 now due Mon Nov 16, 11:59 PM');
    expect(hw5.note).toContain('Prof. Whitfield');
    expect(hw5.note).toContain("Jordan is still quoting Fri — outdated");
    expect(text(b)).not.toMatch(/Fri Nov 13, 11:59/);
    expect(hw5.messageIds).toEqual(expect.arrayContaining(['b3-piazza-ext', 'b4-email-jordan']));
  });
  it('covers changed, next 48 hours, decisions and one heads-up, each citing its sources', () => {
    const b = brief();
    expect(b.headline).toBe('3 things changed since yesterday · 2 need your call');
    expect(b.lines.map((l) => l.section)).toEqual(['changed', 'changed', 'changed', 'soon', 'decide', 'decide', 'heads_up']);
    expect(b.lines[0].text).toBe('Office hours today canceled → extra Fri 1 PM');
    expect(b.lines[1].text).toBe('Midterm 2 moved to Wean Hall 7500 (Thu 7 PM)');
    expect(b.lines.find((l) => l.section === 'soon')!.text).toBe('Problem Set 7 Thu 10 PM · Slides to Sofia & Ethan by Thu');
    expect(b.lines.find((l) => l.section === 'decide' && l.proposalId?.startsWith('prop:move'))!.text).toBe('Move HW5 study session → Sun 2:00–5:00 PM');
    expect(b.lines.find((l) => l.itemId === 'item:76-101:essay2-draft')!.text).toBe('Essay 2 draft: Mon Nov 16 or Tue Nov 17?');
    for (const l of b.lines) expect(l.messageIds.length).toBeGreaterThan(0);
  });
  it('updates live: the time change, the closed promise and the resolved essay', () => {
    expect(brief(1).lines.find((l) => l.itemId === 'item:21-241:midterm2')).toMatchObject({ text: 'Midterm 2 now starts 7:30 PM, moved to Wean Hall 7500', live: true });
    expect(text(brief(2))).not.toContain('Slides to');
    const b3 = brief(3);
    expect(b3.lines.find((l) => l.itemId === 'item:76-101:essay2-draft')).toMatchObject({ section: 'changed', text: 'Essay 2 draft confirmed: due Tue Nov 17, 11:59 PM' });
    expect(b3.lines.some((l) => l.itemId === 'item:15-122:hw5' && l.section === 'changed')).toBe(true);
  });
  it('drops a decision once it is approved', () => {
    const b = brief(0, [{ id: 'a1', type: 'approve', targetId: 'prop:move:item:x:event:hw5study1112', at: DEMO_NOW }]);
    expect(b.lines.some((l) => l.proposalId?.startsWith('prop:move'))).toBe(false);
  });
});
