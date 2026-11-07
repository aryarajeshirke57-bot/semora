import { describe, expect, it } from 'vitest';
import { reconcile } from '../engine/reconcile.ts';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, liveMessage, seedMessages } from '../engine/seed/index.ts';
import { fmtValue } from '../engine/time.ts';
import type { Item, UserAction } from '../engine/types.ts';

const run = (opts: { live?: number; actions?: UserAction[]; without?: string[]; section?: string } = {}) => {
  const messages = seedMessages().filter((m) => !opts.without?.includes(m.id));
  for (let i = 0; i < (opts.live ?? 0); i++) messages.push(liveMessage(i, DEMO_NOW)!);
  return reconcile({ messages, actions: opts.actions ?? [], now: DEMO_NOW, student: { ...STUDENT, section: opts.section ?? STUDENT.section }, courses: COURSES, directory: PEOPLE });
};
const find = (items: Item[], id: string) => items.find((i) => i.id === id)!;
const HW5 = 'item:15-122:hw5';

describe('beat 1 — a deadline is set', () => {
  it('creates one item: 15-122 HW5 due Fri Nov 13, 11:59 PM', () => {
    const r = run({ without: ['b2-email-hw5', 'b3-piazza-ext', 'b4-email-jordan', 'b4b-piazza-question'] });
    const hw5 = find(r.items, HW5);
    expect(hw5.title).toContain('HW5');
    expect(hw5.due).toEqual({ date: '2026-11-13', time: '23:59' });
    expect(hw5.evidence.map((e) => e.messageId)).toEqual(['b1-canvas-hw5']);
    expect(r.items.filter((i) => i.subject === 'hw5')).toHaveLength(1);
  });
});

describe('beat 2 — a duplicate arrives', () => {
  it('adds no item; HW5 now shows 2 sources', () => {
    const before = run({ without: ['b2-email-hw5', 'b3-piazza-ext', 'b4-email-jordan', 'b4b-piazza-question'] });
    const after = run({ without: ['b3-piazza-ext', 'b4-email-jordan', 'b4b-piazza-question'] });
    expect(after.items.length).toBe(before.items.length);
    const hw5 = find(after.items, HW5);
    expect(hw5.evidence).toHaveLength(2);
    expect(hw5.sources.sort()).toEqual(['canvas', 'gmail']);
    expect(hw5.due).toEqual({ date: '2026-11-13', time: '23:59' });
    expect(hw5.changeIds).toHaveLength(0);
  });
});

describe('beat 3 — a section-specific extension', () => {
  it('moves HW5 to Mon Nov 16 for Section B, with all 3 sources linked', () => {
    const r = run();
    const hw5 = find(r.items, HW5);
    expect(hw5.due).toEqual({ date: '2026-11-16', time: '23:59' });
    const change = r.changes.find((c) => c.itemId === HW5 && c.type === 'due')!;
    expect(fmtValue(change.from)).toBe('Fri Nov 13, 11:59 PM');
    expect(fmtValue(change.to)).toBe('Mon Nov 16, 11:59 PM');
    expect(change.byName).toBe('Prof. Dana Whitfield');
    expect(change.source).toBe('piazza');
    expect(change.scopeNote).toBe('Applies to Section B (your section)');
    expect(change.messageIds).toEqual(['b1-canvas-hw5', 'b2-email-hw5', 'b3-piazza-ext']);
  });
  it('does not apply to a student in another section', () => {
    const hw5 = find(run({ section: 'C' }).items, HW5);
    expect(hw5.due).toEqual({ date: '2026-11-13', time: '23:59' });
    expect(run({ section: 'C' }).changes.filter((c) => c.itemId === HW5 && c.type === 'due')).toHaveLength(0);
  });
});

describe('beat 4 — a classmate repeats the old date', () => {
  it('keeps Monday and marks Jordan outdated', () => {
    const hw5 = find(run().items, HW5);
    expect(hw5.due).toEqual({ date: '2026-11-16', time: '23:59' });
    const jordan = hw5.evidence.find((e) => e.messageId === 'b4-email-jordan')!;
    expect(jordan.role).toBe('outdated');
    expect(jordan.note).toBe("Outdated — superseded by Prof. Whitfield's correction");
  });
  it('shows that newer is not automatically right: Jordan is newest than the extension yet loses', () => {
    const r = run();
    const jordan = seedMessages().find((m) => m.id === 'b4-email-jordan')!;
    const ext = seedMessages().find((m) => m.id === 'b3-piazza-ext')!;
    expect(jordan.sentAt > ext.sentAt).toBe(true);
    expect(find(r.items, HW5).due?.date).toBe('2026-11-16');
  });
});

describe('beat 4b — a question is not a change', () => {
  it("Riley's question changes nothing and is labeled a question", () => {
    const withQ = find(run().items, HW5);
    const without = find(run({ without: ['b4b-piazza-question'] }).items, HW5);
    expect(withQ.due).toEqual(without.due);
    expect(withQ.evidence.find((e) => e.messageId === 'b4b-piazza-question')!.role).toBe('question');
    expect(run().changes.filter((c) => c.messageIds.includes('b4b-piazza-question') && c.type === 'due')).toHaveLength(0);
  });
});

describe('beat 5 — the cascade', () => {
  it('proposes moving the study session to Sun Nov 15 2–5 PM and drafts a message to Jordan', () => {
    const r = run();
    const move = r.proposals.find((p) => p.kind === 'move_event')!;
    expect(move.status).toBe('proposed');
    expect(move.requires).toBe('calendar.write');
    expect(move.to).toEqual({ start: '2026-11-15T19:00:00.000Z', end: '2026-11-15T22:00:00.000Z' });
    const draft = r.proposals.find((p) => p.kind === 'draft_message')!;
    expect(draft.recipients).toEqual(['jordank@andrew.cmu.edu']);
    expect(draft.body).toBe('Heads up — Prof. Whitfield extended HW5 to Monday 11:59pm for Section B (pinned on Piazza). Want to move our Thursday session to Sunday afternoon?');
  });
  it('approving animates the block to its new slot; nothing changes without approval', () => {
    const untouched = find(run().items, 'item:x:event:hw5study1112');
    expect(untouched.start).toEqual({ date: '2026-11-12', time: '19:00' });
    const r = run({ actions: [{ id: 'a1', type: 'approve', targetId: 'prop:move:item:x:event:hw5study1112', at: DEMO_NOW }] });
    const moved = find(r.items, 'item:x:event:hw5study1112');
    expect(moved.start).toEqual({ date: '2026-11-15', time: '14:00' });
    expect(moved.movedByUser).toBe(true);
  });
  it('does not propose anything when the deadline never changed', () => {
    expect(run({ without: ['b3-piazza-ext'] }).proposals.filter((p) => p.kind !== 'ask_staff')).toHaveLength(0);
  });
});

describe('beat 6 — a promise in sent mail', () => {
  it('creates a Waiting-on-me item due Thu Nov 12 and lists the presentation', () => {
    const r = run();
    const promise = r.items.find((i) => i.kind === 'promise')!;
    expect(promise.title).toBe('Send 76-101 presentation slides to Sofia and Ethan');
    expect(promise.due).toEqual({ date: '2026-11-12' });
    expect(promise.status).toBe('active');
    const pres = r.items.find((i) => i.subject === 'presentation')!;
    expect(pres.course).toBe('76-101');
    expect(pres.start?.date).toBe('2026-11-13');
  });
});

describe('beat 7 — a room change with a stale source', () => {
  it('shows Doherty Hall 2210 → Wean Hall 7500 and marks the Canvas entry stale', () => {
    const r = run();
    const mid = find(r.items, 'item:21-241:midterm2');
    expect(mid.location).toBe('Wean Hall 7500');
    expect(mid.start).toEqual({ date: '2026-11-12', time: '19:00' });
    const ch = r.changes.find((c) => c.itemId === mid.id && c.type === 'location')!;
    expect(ch.from).toBe('Doherty Hall 2210');
    expect(ch.to).toBe('Wean Hall 7500');
    expect(mid.evidence.find((e) => e.messageId === 'b7-canvas-midterm')!.role).toBe('stale');
  });
});

describe('beat 8 — a cancellation', () => {
  it('cancels Wednesday office hours and adds Friday extra hours', () => {
    const r = run();
    const wed = find(r.items, 'item:15-151:oh:2026-11-11');
    expect(wed.status).toBe('canceled');
    expect(r.changes.some((c) => c.itemId === wed.id && c.type === 'canceled')).toBe(true);
    const fri = find(r.items, 'item:15-151:oh:2026-11-13');
    expect(fri.status).toBe('active');
    expect(fri.start).toEqual({ date: '2026-11-13', time: '13:00' });
    expect(fri.end).toEqual({ date: '2026-11-13', time: '15:00' });
    expect(fri.location).toBe('GHC 6115');
    expect(r.changes.some((c) => c.itemId === fri.id && c.type === 'added')).toBe(true);
  });
});

describe('beat 9 — new grades', () => {
  it('seeds both new grades (posted by Gradescope) next to history', () => {
    const grades = seedMessages().filter((m) => m.structured?.type === 'grade');
    const wh4 = grades.find((m) => m.id === 'b9-gs-122-wh4')!.structured as { score: number; max: number };
    const q6 = grades.find((m) => m.id === 'b9-gs-241-q6')!.structured as { score: number; max: number };
    expect([wh4.score, wh4.max]).toEqual([88, 100]);
    expect([q6.score, q6.max]).toEqual([9, 10]);
    expect(grades.filter((m) => m.course === '21-241' && m.subject?.startsWith('Quiz'))).toHaveLength(6);
  });
});

describe('beat 10 — a buried opportunity', () => {
  it('surfaces the HCI research assistant role with its Nov 20 deadline', () => {
    const opp = run().items.find((i) => i.kind === 'opportunity')!;
    expect(opp.title).toBe('Undergraduate research assistant — Human-Computer Interaction lab');
    expect(opp.due?.date).toBe('2026-11-20');
    expect(run().items.filter((i) => i.kind === 'opportunity')).toHaveLength(1);
  });
});

describe('beat 11 — a genuine conflict', () => {
  it('shows Needs confirmation with both sources and a drafted question to the TA', () => {
    const r = run();
    const essay = find(r.items, 'item:76-101:essay2-draft');
    expect(essay.status).toBe('needs_confirmation');
    expect(essay.due).toBeUndefined();
    expect(essay.at).toBeDefined();
    expect(essay.conflict!.options.map((o) => o.messageId).sort()).toEqual(['b11-email-ta', 'b11-syllabus-essay2']);
    const ask = r.proposals.find((p) => p.kind === 'ask_staff')!;
    expect(ask.recipients).toEqual(['mlindqvist@andrew.cmu.edu']);
    expect(ask.status).toBe('proposed');
  });
  it('lets the user settle it with one tap', () => {
    const r = run({ actions: [{ id: 'c1', type: 'choose', targetId: 'item:76-101:essay2-draft', value: 'b11-syllabus-essay2', at: DEMO_NOW }] });
    const essay = find(r.items, 'item:76-101:essay2-draft');
    expect(essay.status).toBe('active');
    expect(essay.due?.date).toBe('2026-11-17');
  });
});

describe('live script 1 — time change', () => {
  it('morphs Midterm 2 from 7:00 to 7:30 PM and tops the Changed list', () => {
    const r = run({ live: 1 });
    const mid = find(r.items, 'item:21-241:midterm2');
    expect(mid.start).toEqual({ date: '2026-11-12', time: '19:30' });
    expect(mid.location).toBe('Wean Hall 7500');
    expect(r.changes[0].itemId).toBe(mid.id);
    expect(r.changes[0].live).toBe(true);
    expect(fmtValue(r.changes[0].from)).toBe('Thu Nov 12, 7:00 PM');
    expect(fmtValue(r.changes[0].to)).toBe('Thu Nov 12, 7:30 PM');
  });
});

describe('live script 2 — promise fulfilled', () => {
  it('closes the Waiting-on-me item from evidence', () => {
    const before = run({ live: 1 }).items.find((i) => i.kind === 'promise')!;
    expect(before.status).toBe('active');
    const after = run({ live: 2 }).items.find((i) => i.kind === 'promise')!;
    expect(after.status).toBe('done');
    expect(after.completedBy).toBe('evidence');
    expect(after.evidence.at(-1)!.role).toBe('completion');
  });
});

describe('live script 3 — conflict resolved', () => {
  it('resolves Essay 2 to Tue Nov 17, crediting the instructor', () => {
    const r = run({ live: 3 });
    const essay = find(r.items, 'item:76-101:essay2-draft');
    expect(essay.status).toBe('active');
    expect(essay.due).toEqual({ date: '2026-11-17', time: '23:59' });
    expect(essay.conflict).toBeUndefined();
    const ch = r.changes.find((c) => c.itemId === essay.id && c.type === 'resolved')!;
    expect(ch.byName).toBe('Prof. James Okafor');
    expect(r.proposals.some((p) => p.kind === 'ask_staff')).toBe(false);
  });
});

describe('engine edge cases', () => {
  it('is deterministic and does not duplicate items', () => {
    const a = run({ live: 3 });
    const b = run({ live: 3 });
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
    expect(new Set(a.items.map((i) => i.id)).size).toBe(a.items.length);
  });
  it('turns noise into nothing: ~150 messages in, only a handful of items', () => {
    const r = run();
    expect(seedMessages().length).toBeGreaterThan(140);
    expect(r.items.filter((i) => i.kind !== 'event').length).toBeLessThan(20);
  });
  it('creates the registrar action as an admin task due Nov 18', () => {
    const task = run().items.find((i) => i.kind === 'task')!;
    expect(task.title).toBe('Confirm your spring registration time');
    expect(task.due?.date).toBe('2026-11-18');
  });
});

describe('time zones', () => {
  it('shows a UTC Canvas due date on the correct local day (04:59Z is 11:59 PM the day before, ET)', () => {
    const msg = {
      id: 'tz-1', source: 'canvas' as const, channel: 'assignment' as const, url: 'https://canvas.cmu.edu/x', course: '15-151', authorName: 'Canvas', authorRole: 'system' as const,
      sentAt: '2026-11-02T14:00:00Z', subject: 'Problem Set 9', body: 'Problem Set 9', structured: { type: 'assignment' as const, title: 'Problem Set 9', due: '2026-11-17T04:59:00Z' },
    };
    const r = reconcile({ messages: [...seedMessages(), msg], actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    const ps9 = r.items.find((i) => i.subject === 'ps9')!;
    expect(ps9.due).toEqual({ date: '2026-11-16', time: '23:59' });
  });
  it('keeps EST/EDT correct across the Nov 1 fall-back (a Nov 12 7 PM start is 00:00Z Nov 13)', () => {
    const mid = reconcile({ messages: seedMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE }).items.find((i) => i.subject === 'midterm2')!;
    expect(new Date(mid.at!).toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });
});

describe('ambiguity is never silent', () => {
  it('turns an unplaceable claim into a visible Needs-confirmation item', () => {
    const mk = (id: string, course: string, title: string) => ({
      id, source: 'canvas' as const, channel: 'assignment' as const, url: 'https://canvas.cmu.edu/x', course, authorName: 'Canvas', authorRole: 'system' as const,
      sentAt: '2026-11-02T14:00:00-05:00', subject: title, body: title, structured: { type: 'assignment' as const, title, due: '2026-11-20T23:59:00-05:00' },
    });
    const stray = { id: 'amb-1', source: 'gmail' as const, channel: 'email' as const, url: 'https://mail.google.com/x', authorName: 'Pat Doe', authorEmail: 'pat@example.com', authorRole: 'student' as const, to: [STUDENT.email], sentAt: '2026-11-10T10:00:00-05:00', subject: 'quick q', body: 'HW5 is due Friday at 11:59 PM, right?' };
    const r = reconcile({ messages: [...seedMessages(), mk('amb-a', '21-241', 'Homework 5'), stray], actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    const item = r.items.find((i) => i.id === 'item:?:hw5:amb-1')!;
    expect(item.status).toBe('needs_confirmation');
    expect(item.reason).toContain('15-122 and 21-241');
    expect(find(r.items, 'item:15-122:hw5').due).toEqual({ date: '2026-11-16', time: '23:59' });
  });
  it('gives each old message its own date in the inbox summary', async () => {
    const { buildState } = await import('../engine/state.ts');
    const st = buildState({ messages: seedMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: 0, total: 3 } });
    expect(st.messages.find((m) => m.id === 'b1-canvas-hw5')!.summary).toContain('Fri Nov 13');
    expect(st.messages.find((m) => m.id === 'b4-email-jordan')!.categories).toContain('courses');
    expect(st.messages.find((m) => m.id === 'b4-email-jordan')!.evidenceRole).toBe('outdated');
  });
});
