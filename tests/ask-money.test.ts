import { describe, expect, it } from 'vitest';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, demoMessages } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';
import { ask } from '../server/ask.ts';

const messages = demoMessages();
const state = buildState({ messages, actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE, version: 1, demoMode: true, llm: { enabled: false, fast: '', smart: '' }, connections: [], script: { index: 0, total: 3 } });
const q = (text: string) => ask(text, state, messages);

describe('Ask Semora — Money', () => {
  it('totals with the calculation, and says it is an estimate', async () => {
    const a = await q('How much am I spending on subscriptions every month?');
    expect(a.answer).toContain('$72.52 a month ($870.28 a year) across 7 subscriptions');
    expect(a.answer).toContain('not bank records');
    expect(a.bullets.some((b) => b.text === 'Amazon Prime: $139.00/yr → $11.58/mo')).toBe(true);
    expect(a.bullets.filter((b) => b.text.startsWith('Not counted'))).toHaveLength(4);
  });
  it('renewals next week', async () => {
    const a = await q('What subscriptions renew next week?');
    expect(a.bullets.map((b) => b.text)).toEqual(['Amazon Prime — Wed Nov 18, $139.00/yr', 'YouTube Premium — Fri Nov 20, $13.99/mo']);
  });
  it('savings from canceling', async () => {
    const a = await q('How much would I save annually if I canceled Spotify?');
    expect(a.bullets[0].text).toBe('Canceling Spotify Premium Individual would save about $143.88 a year ($11.99/mo × 12).');
  });
  it('never invents a payment', async () => {
    const a = await q('Did my last payment to Adobe actually go through?');
    expect(a.bullets[0].text).toMatch(/^No payment to Adobe on record/);
    const g = await q('Did my payment to Steel City Fitness go through?');
    expect(g.bullets[0].text).toMatch(/^No\. Steel City Fitness's last email/);
    expect(g.bullets[0].citations.map((c) => c.messageId).filter(Boolean)).toEqual(['f-gym-failed']);
  });
  it('trials, price changes, unclear cancellations', async () => {
    expect((await q('Which free trials are ending soon?')).bullets[0].text).toContain('Adobe Creative Cloud Photography ends Fri Nov 13');
    expect((await q('Did any of my subscriptions increase in price?')).bullets[0].text).toContain('$1.99/mo → $2.99/mo');
    expect((await q('Which subscriptions have unclear cancellation status?')).bullets.map((b) => b.citations[0].subscriptionId)).toEqual(['sub:duolingo-super', 'sub:headspace']);
  });
  it('cites the subscription and its emails on every line', async () => {
    for (const text of ['Show me all my active subscriptions.', 'How much am I spending on subscriptions every month?']) {
      for (const b of (await q(text)).bullets) {
        expect(b.citations[0].subscriptionId).toBeDefined();
        expect(b.citations.some((c) => c.messageId)).toBe(true);
      }
    }
  });
  it('leaves academic questions alone', async () => {
    expect((await q('Is HW5 still due Friday?')).answer).toContain('Not anymore. HW5 is due Mon Nov 16');
    expect((await q("What's due before Thursday?")).bullets.some((b) => b.text.includes('Problem Set 7'))).toBe(true);
  });
});
