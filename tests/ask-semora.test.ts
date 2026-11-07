import { describe, expect, it } from 'vitest';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, demoMessages } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';
import { ask } from '../server/ask.ts';

const messages = demoMessages();
const state = buildState({ messages, actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: 0, total: 3 } });
const q = (text: string, history: { question: string; answer: string }[] = []) => ask(text, state, messages, history);

describe('Ask Semora — whole-picture questions', () => {
  it('prioritizes by deadline, then decisions, then money, and labels the ranking as inference', async () => {
    const a = await q('What should I prioritize today?');
    expect(a.bullets[0].text).toContain('Midterm 2');
    expect(a.bullets.some((b) => b.basis === 'inference' && b.text.includes('HW5'))).toBe(true);
    expect(a.answer).toContain("Semora's judgment");
    for (const b of a.bullets) expect(b.citations.length).toBeGreaterThan(0);
  });
  it('is honest that read/unread is not synced, and never lists spam', async () => {
    const a = await q('Summarize my unread emails.');
    expect(a.answer).toMatch(/doesn't sync read\/unread/);
    expect(a.bullets.some((b) => b.citations.some((c) => c.messageId?.startsWith('s-')))).toBe(false);
  });
  it('says so when a course does not exist', async () => {
    expect((await q('What changed in my Physics course?')).answer).toMatch(/^No course matching "physics"/);
    expect((await q('What changed in 15-122?')).bullets[0].text).toContain('Fri Nov 13, 11:59 PM → Mon Nov 16, 11:59 PM');
  });
  it('explains which deadline wins and flags the unresolved one', async () => {
    const a = await q('Which assignment deadline is correct?');
    expect(a.bullets[0].text).toMatch(/^HW5: Mon Nov 16/);
    expect(a.bullets[1].text).toContain("Semora won't guess");
  });
  it('drafts but never sends, and corrects a wrong assumption about who is waiting', async () => {
    const a = await q('Draft a reply to my professor.');
    expect(a.answer).toContain('No professor is waiting on you');
    expect(a.answer).toContain('never sends');
    expect(a.draft).toMatchObject({ to: ['kholt@cs.cmu.edu'] });
    expect(a.draft!.body).toContain('[paste it here]');
  });
  it('lists replies owed', async () => {
    expect((await q('What emails need replies?')).bullets.map((b) => b.citations[0].itemId)).toEqual(expect.arrayContaining(['item:x:reply:x-advisor']));
  });
  it('handles a follow-up by borrowing the previous question', async () => {
    const a = await q('what about next week?', [{ question: 'Which subscriptions renew this week?', answer: '1 renews this week' }]);
    expect(a.bullets.map((b) => b.text)).toEqual(['Amazon Prime — Wed Nov 18, $139.00/yr', 'YouTube Premium — Fri Nov 20, $13.99/mo']);
  });
  it('labels money totals as estimates', async () => {
    const a = await q('How much am I spending monthly?');
    expect(a.bullets[0].basis).toBe('estimate');
  });
});
