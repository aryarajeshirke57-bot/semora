import { describe, expect, it } from 'vitest';
import { reconcileFinance } from '../engine/finance.ts';
import { reconcile } from '../engine/reconcile.ts';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, demoMessages, seedMessages } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';
import type { UserAction } from '../engine/types.ts';
import { parseScheme, parseSeason, resolveScheme, themeAttributes } from '../web/src/theme.ts';

const state = (actions: UserAction[] = []) => buildState({ messages: demoMessages(), actions, now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: 0, total: 3 } });
const act = (type: UserAction['type'], targetId: string, at = DEMO_NOW): UserAction => ({ id: `${type}${targetId}${at}`, type, targetId, at });

describe('spam folder is isolated', () => {
  it('never reaches academic reconciliation or Money', () => {
    const a = reconcile({ messages: seedMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    const b = reconcile({ messages: demoMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    expect(JSON.stringify(b.items)).toBe(JSON.stringify(a.items));
    const fin = reconcileFinance({ messages: demoMessages(), actions: [], now: DEMO_NOW }).state;
    expect(fin.subscriptions.some((s) => s.events.some((e) => e.messageId.startsWith('s-')))).toBe(false);
    expect(fin.purchases.some((p) => p.messageId.startsWith('s-'))).toBe(false);
  });
  it('is categorized as spam only and kept out of the inbox count', () => {
    const s = state();
    expect(s.messages.find((m) => m.id === 's-invoice')!.categories).toEqual(['spam']);
    expect(s.stats.messagesIn).toBe(163);
    expect(s.stats.needToKnow).toBe(13);
  });
});

describe('inbox health', () => {
  it('reports composition, promos, large attachments and spam from real messages', () => {
    const h = state().health;
    expect(h.total).toBe(163);
    expect(h.categories.reduce((n, c) => n + c.count, 0)).toBe(h.total);
    expect(h.attachments.map((a) => a.messageId)).toEqual(['n-club-5', 'x-ethan', 'n-recruit-2', 'n-club-8']);
    expect(h.attachmentBytes).toBe(49_700_000);
    expect(h.spam).toMatchObject({ count: 5, suspiciousInInbox: 1 });
    expect(h.storage).toBeNull();
  });
  it('builds a checklist that only links to real places, and remembers what you ticked', () => {
    const ids = state().health.checklist.map((c) => c.id);
    expect(ids).toContain('chk:phish:f-netflix-phish');
    expect(ids).toContain('chk:attachments');
    for (const c of state().health.checklist) expect(Boolean(c.route) || Boolean(c.gmailQuery)).toBe(true);
    const ticked = state([act('chk_done', 'chk:spam')]).health.checklist.find((c) => c.id === 'chk:spam')!;
    expect(ticked.done).toBe(true);
    expect(state([act('chk_done', 'chk:spam'), act('chk_undo', 'chk:spam', '2026-11-11T09:01:00-05:00')]).health.checklist.find((c) => c.id === 'chk:spam')!.done).toBe(false);
  });
});

describe('free-trial alert actions', () => {
  const ADOBE = 'sub:adobe-creative-cloud-photography';
  it('acknowledging keeps the alert listed but stops it needing attention and leaves the brief', () => {
    const s = state([act('fin_ack', ADOBE)]);
    const alert = s.finance.alerts.find((a) => a.subscriptionId === ADOBE)!;
    expect(alert).toMatchObject({ kind: 'trial_ending', acknowledged: true });
    expect(alert.urgency).toBeLessThan(60);
    expect(s.finance.summary.attention).toBe(3);
    expect(s.brief.lines.find((l) => l.section === 'money')!.text).not.toContain('Adobe');
    expect(s.finance.subscriptions.find((x) => x.id === ADOBE)!.status).toBe('trial');
  });
  it('follow-up is a flag you can toggle; nothing about the subscription itself changes', () => {
    const on = state([act('fin_follow', ADOBE)]).finance.subscriptions.find((x) => x.id === ADOBE)!;
    expect(on).toMatchObject({ followUp: true, status: 'trial', counted: false });
    const off = state([act('fin_follow', ADOBE), act('fin_follow', ADOBE, '2026-11-11T09:01:00-05:00')]).finance.subscriptions.find((x) => x.id === ADOBE)!;
    expect(off.followUp).toBeUndefined();
  });
  it('undo clears acknowledgment and follow-up', () => {
    const s = state([act('fin_ack', ADOBE), act('fin_follow', ADOBE), act('fin_undo', ADOBE, '2026-11-11T09:01:00-05:00')]);
    const sub = s.finance.subscriptions.find((x) => x.id === ADOBE)!;
    expect(sub.acknowledged).toBeUndefined();
    expect(sub.followUp).toBeUndefined();
    expect(s.finance.summary.attention).toBe(4);
  });
});

describe('theme preferences', () => {
  it('falls back safely on unknown stored values', () => {
    expect(parseScheme('purple')).toBe('system');
    expect(parseScheme(null)).toBe('system');
    expect(parseSeason('monsoon')).toBe('classic');
    expect(parseSeason('winter')).toBe('winter');
  });
  it('resolves system to the OS preference and maps to the attributes the CSS reads', () => {
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('light', true)).toBe('light');
    expect(themeAttributes('system', 'classic', true)).toEqual({ 'data-theme': null, 'data-scheme': 'dark', 'data-season': null });
    expect(themeAttributes('light', 'autumn', true)).toEqual({ 'data-theme': 'light', 'data-scheme': 'light', 'data-season': 'autumn' });
  });
});
