import { describe, expect, it } from 'vitest';
import { extractFinance, monthlyOf, parseMoney, reconcileFinance, validateClaim } from '../engine/finance.ts';
import { reconcile } from '../engine/reconcile.ts';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, demoMessages, financeSeedMessages, seedMessages } from '../engine/seed/index.ts';
import type { FinanceClaim, SourceMessage, UserAction } from '../engine/types.ts';

const run = (messages: SourceMessage[] = demoMessages(), actions: UserAction[] = []) => reconcileFinance({ messages, actions, now: DEMO_NOW }).state;
const sub = (id: string, s = run()) => s.subscriptions.find((x) => x.id === id)!;
const msg = (over: Partial<SourceMessage> & Pick<SourceMessage, 'id' | 'body'>): SourceMessage => ({
  source: 'gmail', channel: 'email', url: 'https://mail.google.com/x', authorName: 'Acme Cloud', authorEmail: 'billing@acme.example.com', authorRole: 'external', to: [STUDENT.email], sentAt: '2026-11-05T10:00:00-05:00', subject: '', ...over,
});

describe('academic story is untouched by billing email', () => {
  it('reconciles exactly the same academic items, changes and proposals with Money mail in the inbox', () => {
    const a = reconcile({ messages: seedMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    const b = reconcile({ messages: demoMessages(), actions: [], now: DEMO_NOW, student: STUDENT, courses: COURSES, directory: PEOPLE });
    expect(JSON.stringify(b.items)).toBe(JSON.stringify(a.items));
    expect(JSON.stringify(b.changes)).toBe(JSON.stringify(a.changes));
    expect(JSON.stringify(b.proposals)).toBe(JSON.stringify(a.proposals));
  });
  it('finds no subscriptions in the academic noise (bank statements, promos, carts)', () => {
    const s = run(seedMessages());
    expect(s.subscriptions).toHaveLength(0);
    expect(s.purchases).toHaveLength(0);
  });
});

describe('subscription detection', () => {
  it('detects each seeded subscription with its status', () => {
    const s = run();
    const by = Object.fromEntries(s.subscriptions.map((x) => [x.id, x.status]));
    expect(by).toEqual({
      'sub:steel-city-fitness': 'payment_failed',
      'sub:adobe-creative-cloud-photography': 'trial',
      'sub:duolingo-super': 'needs_confirmation',
      'sub:headspace': 'cancel_pending',
      'sub:google-one-100-gb': 'price_changed',
      'sub:amazon-prime': 'renewal_soon',
      'sub:youtube-premium': 'active',
      'sub:apple-music-student': 'active',
      'sub:apple-icloud+-50-gb': 'active',
      'sub:spotify-premium-individual': 'active',
      'sub:netflix-standard': 'canceled',
    });
  });
  it('generalizes to a merchant it has never seen (a local gym)', () => {
    expect(sub('sub:steel-city-fitness')).toMatchObject({ amount: 24.99, interval: 'monthly', currency: 'USD' });
  });
  it('keeps two subscriptions from one merchant apart', () => {
    const apple = run().subscriptions.filter((x) => x.merchant === 'Apple');
    expect(apple.map((x) => x.name).sort()).toEqual(['Apple Music Student', 'Apple iCloud+ 50 GB']);
  });
  it('links every subscription to its source emails', () => {
    for (const s of run().subscriptions) {
      expect(s.messageIds.length).toBeGreaterThan(0);
      for (const id of s.messageIds) expect(financeSeedMessages().some((m) => m.id === id)).toBe(true);
    }
  });
});

describe('promotions are not subscriptions', () => {
  it('rejects marketing even when it names a brand and a monthly price', () => {
    for (const id of ['f-spotify-family', 'f-adobe-promo', 'f-disney-promo', 'f-netflix-news']) {
      const m = financeSeedMessages().find((x) => x.id === id)!;
      expect(extractFinance(m).claims).toHaveLength(0);
    }
    expect(run().subscriptions.some((x) => /disney|family|all apps/i.test(x.name))).toBe(false);
  });
  it('a newsletter from a canceled service does not revive it', () => {
    expect(sub('sub:netflix-standard').messageIds).not.toContain('f-netflix-news');
  });
});

describe('one-time vs recurring', () => {
  it('files an order as a one-time purchase, not a subscription', () => {
    const s = run();
    expect(s.purchases).toEqual([expect.objectContaining({ merchant: 'Amazon', amount: 119.99, type: 'one_time', messageId: 'f-amazon-order' })]);
    expect(sub('sub:amazon-prime').messageIds).toEqual(['f-amazon-prime']);
  });
  it('a single receipt with no recurring wording is a purchase', () => {
    const s = run([msg({ id: 'r1', subject: 'Your receipt', body: 'Thanks for your payment of $42.00 for your ticket.' })]);
    expect(s.subscriptions).toHaveLength(0);
    expect(s.purchases[0]).toMatchObject({ amount: 42, type: 'charge' });
  });
});

describe('duplicates', () => {
  it("Spotify's receipt and PayPal's receipt for the same charge are one charge, one subscription", () => {
    const sp = sub('sub:spotify-premium-individual');
    const nov = sp.events.filter((e) => e.type === 'charge' && e.at.startsWith('2026-11-03'));
    expect(nov).toHaveLength(2);
    expect(nov.filter((e) => !e.duplicateOf)).toHaveLength(1);
    expect(nov.find((e) => e.messageId === 'f-paypal-spotify')!.duplicateOf).toBeDefined();
    expect(run().subscriptions.filter((x) => x.merchant === 'Spotify')).toHaveLength(1);
  });
});

describe('price changes', () => {
  it('Google One: announcement, an old-price receipt, then the renewal confirms the new price', () => {
    const g = sub('sub:google-one-100-gb');
    expect(g.amount).toBe(2.99);
    expect(g.priceChange).toMatchObject({ from: 1.99, to: 2.99, effective: '2026-11-15', confirmedBy: 'f-g1-renew' });
    expect(g.conflict).toBeUndefined();
  });
  it('an announced future price is not applied before it is confirmed or takes effect', () => {
    const g = sub('sub:google-one-100-gb', run(demoMessages().filter((m) => m.id !== 'f-g1-renew')));
    expect(g.amount).toBe(1.99);
    expect(g.priceChange?.confirmedBy).toBeUndefined();
  });
});

describe('renewals and trials', () => {
  it('extracts explicit renewal dates only', () => {
    expect(sub('sub:amazon-prime').renewsOn).toBe('2026-11-18');
    expect(sub('sub:youtube-premium').renewsOn).toBe('2026-11-20');
    expect(sub('sub:steel-city-fitness').renewsOn).toBeUndefined();
  });
  it('Adobe trial ends Fri Nov 13 and is not counted until it converts', () => {
    const a = sub('sub:adobe-creative-cloud-photography');
    expect(a).toMatchObject({ trialEnds: '2026-11-13', counted: false, amount: undefined });
    expect(a.trialThen).toEqual({ amount: 19.99, currency: 'USD', interval: 'monthly' });
    expect(run().alerts.find((x) => x.kind === 'trial_ending')!.text).toContain('in 2 days');
  });
  it('a trial that ended with no receipt needs confirmation instead of a guess', () => {
    const later = reconcileFinance({ messages: demoMessages(), actions: [], now: '2026-11-16T09:00:00-05:00' }).state;
    expect(sub('sub:adobe-creative-cloud-photography', later).status).toBe('needs_confirmation');
  });
});

describe('payments and cancellations', () => {
  it('a failed payment is reported as failed, and a later receipt recovers it', () => {
    expect(sub('sub:steel-city-fitness').status).toBe('payment_failed');
    const paid = msg({ id: 'g2', authorName: 'Steel City Fitness', authorEmail: 'billing@steelcityfitness.example.com', sentAt: '2026-11-05T09:00:00-05:00', subject: 'Payment received', body: 'Thank you for your payment of $24.99 for your monthly membership.' });
    expect(sub('sub:steel-city-fitness', run([...demoMessages(), paid])).status).toBe('active');
  });
  it('a cancellation request is not a cancellation', () => {
    const h = sub('sub:headspace');
    expect(h.status).toBe('cancel_pending');
    expect(h.counted).toBe(false);
  });
  it('a confirmation supersedes earlier active receipts', () => {
    expect(sub('sub:netflix-standard')).toMatchObject({ status: 'canceled', accessUntil: '2026-11-12', counted: false });
  });
  it('a charge after a cancellation confirmation needs confirmation', () => {
    const after = msg({ id: 'n9', authorName: 'Netflix', authorEmail: 'info@account.netflix.com', sentAt: '2026-11-10T03:00:00-05:00', subject: 'Your Netflix payment receipt', body: 'Thanks for your payment of $15.49 for your Netflix Standard plan.' });
    expect(sub('sub:netflix-standard', run([...demoMessages(), after])).status).toBe('needs_confirmation');
  });
});

describe('trust', () => {
  it('ignores a look-alike email from another domain, including the instructions inside it', () => {
    const s = run();
    expect(s.suspicious.map((x) => x.messageId)).toEqual(['f-netflix-phish']);
    expect(sub('sub:netflix-standard').status).toBe('canceled');
    expect(s.subscriptions.filter((x) => x.status === 'canceled').map((x) => x.id)).toEqual(['sub:netflix-standard']);
    for (const x of s.subscriptions) expect(x.manageUrl ?? '').not.toContain('netflix-account-help');
  });
  it('only offers a manage link on the merchant’s own https domain', () => {
    expect(sub('sub:steel-city-fitness').manageUrl).toBe('https://steelcityfitness.example.com/account/billing');
    const odd = msg({ id: 'l1', subject: 'Your receipt', body: 'Thanks for your payment. Your Acme Cloud subscription: $5.00/month. Manage at https://acme-billing.example.org/x' });
    const s = run([odd]).subscriptions[0];
    expect(s.manageUrl).toBeUndefined();
    expect(s.unverifiedLinks).toEqual(['https://acme-billing.example.org/x']);
  });
  it('validates LLM claims against the message: no invented amounts, payments or cancellations', () => {
    const m = financeSeedMessages().find((x) => x.id === 'f-headspace-cancel')!;
    const lie: FinanceClaim = { id: 'x', messageId: m.id, type: 'cancel_confirmed', merchant: 'Spotify', amount: 99, recurring: true, links: [], quote: '', extractor: 'llm', confidence: 1 };
    const v = validateClaim(lie, m)!;
    expect(v.type).toBe('cancel_requested');
    expect(v.merchant).toBe('Headspace');
    expect(v.amount).toBeUndefined();
    const promo = financeSeedMessages().find((x) => x.id === 'f-disney-promo')!;
    expect(validateClaim({ ...lie, type: 'charge', amount: 1.99, messageId: promo.id }, promo)).toBeUndefined();
  });
});

describe('conflicts', () => {
  it('Super Duolingo billed monthly in one email and yearly in another needs confirmation', () => {
    const d = sub('sub:duolingo-super');
    expect(d.status).toBe('needs_confirmation');
    expect(d.conflict!.options.map((o) => o.label)).toEqual(['$12.99/mo', '$59.99/yr']);
    expect(d.counted).toBe(false);
  });
  it('the user can settle it with one tap, and it then counts', () => {
    const d = sub('sub:duolingo-super', run(demoMessages(), [{ id: 'a', type: 'fin_confirm', targetId: 'sub:duolingo-super', value: 'f-duo-renew', at: DEMO_NOW }]));
    expect(d).toMatchObject({ amount: 59.99, interval: 'yearly', certainty: 'user', counted: true });
  });
});

describe('totals', () => {
  it('normalizes frequencies', () => {
    expect(monthlyOf(12, 'weekly')).toBe(52);
    expect(monthlyOf(30, 'quarterly')).toBe(10);
    expect(monthlyOf(120, 'yearly')).toBe(10);
  });
  it('estimates $72.52/mo and $870.28/yr from the 7 subscriptions that count', () => {
    const { summary } = run();
    expect(summary.monthly).toBe(72.52);
    expect(summary.annual).toBe(870.28);
    expect(summary.breakdown.map((b) => b.name).sort()).toEqual(['Amazon Prime', 'Apple Music Student', 'Apple iCloud+ 50 GB', 'Google One 100 GB', 'Spotify Premium Individual', 'Steel City Fitness', 'YouTube Premium']);
    expect(summary.breakdown.find((b) => b.name === 'Amazon Prime')!.monthly).toBeCloseTo(11.5833, 3);
  });
  it('excludes uncertain, pending, trial and canceled records, each with a reason', () => {
    const ex = Object.fromEntries(run().summary.excluded.map((e) => [e.subscriptionId, e.reason]));
    expect(Object.keys(ex).sort()).toEqual(['sub:adobe-creative-cloud-photography', 'sub:duolingo-super', 'sub:headspace', 'sub:netflix-standard']);
    expect(ex['sub:headspace']).toBe('Cancellation requested, not confirmed');
  });
  it('keeps unknown and foreign currencies out of the USD total', () => {
    expect(parseMoney('Amount: 12.99')[0]).toMatchObject({ amount: 12.99, currency: undefined });
    expect(parseMoney('€7.99/month')[0]).toMatchObject({ amount: 7.99, currency: 'EUR' });
    const noCur = msg({ id: 'c1', body: 'Thanks for your payment. Your Acme Cloud subscription renews monthly. Amount: 12.99.' });
    const eur = msg({ id: 'c2', authorName: 'Bahn Pass', authorEmail: 'billing@bahnpass.example.com', body: 'Thanks for your payment. Your Bahn Pass subscription: €7.99/month.' });
    const s = run([noCur, eur]);
    expect(s.summary.monthly).toBe(0);
    expect(s.summary.excluded.map((e) => e.reason).sort()).toEqual(['Billed in EUR — not converted', 'Currency unknown — not added to the total']);
  });
  it("user corrections never act outside Semora, they only change how it's counted", () => {
    const s = run(demoMessages(), [{ id: 'a', type: 'fin_canceled', targetId: 'sub:spotify-premium-individual', at: DEMO_NOW }]);
    expect(sub('sub:spotify-premium-individual', s)).toMatchObject({ status: 'canceled', certainty: 'user', counted: false });
    expect(s.summary.monthly).toBe(60.53);
    const undone = run(demoMessages(), [{ id: 'a', type: 'fin_canceled', targetId: 'sub:spotify-premium-individual', at: DEMO_NOW }, { id: 'b', type: 'fin_undo', targetId: 'sub:spotify-premium-individual', at: '2026-11-11T09:01:00-05:00' }]);
    expect(undone.summary.monthly).toBe(72.52);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
