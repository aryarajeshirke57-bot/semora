// Money: the recurring commitments buried in a student's inbox.
//
// Same shape as the academic engine, and deliberately separate from it:
//   extract (rules, or an LLM whose output is validated by rules) → claims
//   reconcile (pure, deterministic) → subscriptions, events, alerts, totals
// The merchant always comes from the sender (or a payment processor's payee), never from free text,
// so an email can't talk Semora into believing something about a different company. Arithmetic,
// currency, dates and status transitions are rules. Nothing here performs an action.
import { parseDates } from './extract-rules.ts';
import { addDays, fmtDate, localDate } from './time.ts';
import type {
  BillingInterval,
  FinanceAlert,
  FinanceChange,
  FinanceClaim,
  FinanceEvent,
  FinanceEventType,
  FinanceState,
  Purchase,
  SourceMessage,
  Subscription,
  SubscriptionStatus,
  Suspicious,
  UserAction,
} from './types.ts';

export const RENEWAL_SOON_DAYS = 7;
export const TRIAL_SOON_DAYS = 3;
export const ATTENTION = 60;

/* ---------------- money, intervals, sentences ---------------- */

const CODE: Record<string, string> = { $: 'USD', US$: 'USD', USD: 'USD', '€': 'EUR', EUR: 'EUR', '£': 'GBP', GBP: 'GBP', '₹': 'INR', INR: 'INR' };
const SYMBOL_FIRST = /(US\$|\$|€|£|₹|\b(?:USD|EUR|GBP|INR) ?)(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?: ?(USD|EUR|GBP|INR)\b)?/g;
const NUMBER_FIRST = /\b(\d+(?:\.\d{2}))\s?(USD|EUR|GBP|INR)\b/g;
const BARE = /\b(?:amount(?: charged)?|total|charged|price)\s*:?\s*(\d+\.\d{2})\b/gi;

export interface Money { amount: number; currency?: string; index: number; end: number }

export function parseMoney(text: string): Money[] {
  const out: Money[] = [];
  const taken = (i: number) => out.some((m) => i >= m.index && i < m.end);
  for (const m of text.matchAll(SYMBOL_FIRST)) out.push({ amount: Number(m[2].replace(/,/g, '')), currency: CODE[m[1].trim()] ?? (m[3] && CODE[m[3]]), index: m.index!, end: m.index! + m[0].length });
  for (const m of text.matchAll(NUMBER_FIRST)) if (!taken(m.index!)) out.push({ amount: Number(m[1]), currency: CODE[m[2]], index: m.index!, end: m.index! + m[0].length });
  for (const m of text.matchAll(BARE)) {
    const at = m.index! + m[0].lastIndexOf(m[1]);
    if (!taken(at)) out.push({ amount: Number(m[1]), currency: undefined, index: at, end: at + m[1].length });
  }
  return out.sort((a, b) => a.index - b.index);
}

const UNIT: Record<string, BillingInterval> = { week: 'weekly', wk: 'weekly', month: 'monthly', mo: 'monthly', quarter: 'quarterly', year: 'yearly', yr: 'yearly' };
const RIGHT_AFTER = /^\s*(?:\/\s*|per |a |each |every )(week|wk|month|mo|quarter|year|yr)\b|^\s*\((monthly|yearly|annual|weekly|quarterly)\)/i;
const WORDS: [RegExp, BillingInterval][] = [
  [/\bweekly\b|\b(?:per|a|each|every)\s+week\b/i, 'weekly'],
  [/\bquarterly\b|\bevery 3 months\b|\bper quarter\b/i, 'quarterly'],
  [/\b(?:yearly|annual(?:ly)?)\b|\b(?:per|a|each|every|another|one)\s+year\b|\/\s*(?:year|yr)\b/i, 'yearly'],
  [/\bmonthly\b|\b(?:per|a|each|every)\s+month\b|\/\s*(?:month|mo)\b/i, 'monthly'],
];
const word = (s: string): BillingInterval | undefined => (s ? (UNIT[s.toLowerCase()] ?? ({ monthly: 'monthly', yearly: 'yearly', annual: 'yearly', weekly: 'weekly', quarterly: 'quarterly' } as Record<string, BillingInterval>)[s.toLowerCase()]) : undefined);

/** The interval written right after an amount ("$11.99/month"), else the first one in the text. */
export function intervalNear(text: string, money?: Money): BillingInterval | undefined {
  if (money) {
    const m = text.slice(money.end, money.end + 24).match(RIGHT_AFTER);
    if (m) return word(m[1] ?? m[2]);
  }
  for (const [re, iv] of WORDS) if (re.test(text)) return iv;
  return undefined;
}

export function monthlyOf(amount: number, interval: BillingInterval): number {
  return interval === 'weekly' ? (amount * 52) / 12 : interval === 'quarterly' ? amount / 3 : interval === 'yearly' ? amount / 12 : amount;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
const approx = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.abs(a - b) < 0.005;

export function fmtMoney(amount?: number, currency?: string): string {
  if (amount === undefined) return 'amount unknown';
  const n = amount.toFixed(2);
  if (!currency) return `${n} (currency unknown)`;
  return ({ USD: `$${n}`, EUR: `€${n}`, GBP: `£${n}`, INR: `₹${n}` } as Record<string, string>)[currency] ?? `${n} ${currency}`;
}
const PER: Record<BillingInterval, string> = { weekly: '/wk', monthly: '/mo', quarterly: '/qtr', yearly: '/yr' };
export const fmtPrice = (amount?: number, currency?: string, interval?: BillingInterval) => `${fmtMoney(amount, currency)}${interval && amount !== undefined ? PER[interval] : ''}`;

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“($])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function explicitDate(sentence: string, sentDate: string): string | undefined {
  return parseDates(sentence, sentDate).filter((d) => d.explicit && !d.possessive).at(-1)?.date;
}

/* ---------------- who sent it ---------------- */

const PROCESSORS = /^(paypal|venmo|stripe|google play|app store|cash app)\b/i;

export function normalizeMerchant(name: string): string {
  return name
    .replace(/["<>]/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\.com\b/i, '')
    .replace(/\s+(?:usa|us|inc\.?|llc|ltd|billing|payments?|receipts?|team|support|customer (?:service|care)|accounts?|help|no-?reply|notifications?|purchases)\b.*$/i, '')
    .trim();
}

/** example.com / example.net hosts are fictional stand-ins: treat the label before them as the registrable part. */
export function regDomain(host?: string): string | undefined {
  if (!host) return undefined;
  const parts = host.toLowerCase().replace(/^.*@/, '').split('.').filter(Boolean);
  const two = parts.slice(-2).join('.');
  return ['example.com', 'example.net', 'co.uk', 'com.au'].includes(two) ? parts.slice(-3).join('.') : two;
}

const URL_RE = /https?:\/\/[^\s)"'<>]+/g;

/* ---------------- classification ---------------- */

// A message only becomes evidence when it speaks about *your* account. Marketing that names a price is not a subscription.
const TRANSACTIONAL =
  /\b(receipt|invoice|order (?:#|number|total|confirmation)|thanks for your order|your (?:subscription|membership|plan|free trial|trial|payment|billing)|we (?:charged|received your|couldn't|could not|were unable)|you(?:'ve| have)? (?:paid|sent an? (?:automatic )?payment)|has been (?:charged|cancell?ed|renewed)|will (?:automatically |auto-?)?renew|renews (?:on|soon)|next (?:payment|billing date|charge)|payment (?:failed|declined|received|confirmed)|automatic payment|cancell?ation|refund(?:ed)?)\b/i;
const PROMO = /\b(\d+% off|\$\d+(?:\.\d+)? off|save \d+%|sale\b|deals?\b|limited[- ]time|offer\b|try (?:\w+ ){0,3}free|sign up|get \S+(?: \S+){0,3} for (?:US)?\$|upgrade (?:to|now)|new on \w+|first month free|for \d+ months|watch now|terms apply)/i;
const RECURRING = /\b(subscription|membership|plan|renew\w*|recurring|automatic payment|auto-?pay|billing (?:period|cycle|date)|monthly|yearly|annual|per (?:month|year|week)|trial)\b|\/\s*(?:mo|month|yr|year|wk|week)\b/i;

const RE: Record<Exclude<FinanceEventType, 'one_time' | 'signup' | 'invoice'> | 'one_time' | 'signup' | 'invoice', RegExp> = {
  cancel_confirmed: /\b(?:cancell?ation (?:is|has been) (?:confirmed|processed|complete)|(?:subscription|membership|plan) (?:is|has been) cancell?ed|you(?:'ve| have) (?:successfully )?cancell?ed|we(?:'ve| have) cancell?ed your)\b/i,
  cancel_requested: /\b(?:received your request to cancel|request to cancel|cancell?ation request)\b/i,
  payment_failed: /\b(?:couldn't|could not|were unable to|was unable to|unable to) (?:process|charge|complete|collect)\b|\bpayment (?:failed|was declined|declined|didn't go through)\b|\bcard was declined\b/i,
  refund: /\brefund(?:ed)?\b/i,
  price_change: /\bprice\b[^.]{0,80}\b(?:chang|increas|going up|go up|rise|rising|decreas|lower)\w*|\bfrom (?:US)?\$\s?\d[\d.]*\S* to (?:US)?\$\s?\d/i,
  trial: /\bfree trial\b|\btrial (?:ends|period|started|has started|will end)\b/i,
  charge: /\b(?:receipt|payment (?:received|confirmed|successful)|thanks? (?:you )?for your payment|we charged|you(?:'ve)? paid|has been charged|was charged|you were charged|automatic payment)\b/i,
  renewal_notice: /\b(?:will (?:automatically |auto-?)?renew|renews (?:on |soon)?|set to renew|upcoming renewal|next (?:payment|billing date|charge))/i,
  invoice: /\b(?:invoice|amount due|payment due|balance due|please pay)\b/i,
  one_time: /\b(?:order (?:#|number|total|confirmation)|thanks for your order)\b/i,
  signup: /\b(?:welcome to|you(?:'re| are) now subscribed|thanks for subscribing|subscription (?:is )?confirmed|membership (?:is )?confirmed)\b/i,
};
const ORDER: FinanceEventType[] = ['cancel_confirmed', 'cancel_requested', 'payment_failed', 'refund', 'price_change', 'trial', 'charge', 'renewal_notice', 'invoice', 'one_time', 'signup'];
const NEEDS_AMOUNT: FinanceEventType[] = ['charge', 'refund', 'invoice', 'one_time', 'price_change'];

const PLAN_LINE = /\bPlan:\s*([^.\n]+?)\s*(?:\.(?:\s|$)|\n|$)/i;
const PLAN_PHRASE = /\b(?:[Yy]our|[Tt]he)\s+(?:free trial of (?:the )?)?((?:[A-Z0-9][\w+]*\s+){0,5}?[A-Z0-9][\w+]*)\s+(?:subscription|membership|plan)\b/;
const FREE_TRIAL_OF = /\bfree trial of (?:the )?((?:[A-Z0-9][\w+]*\s+){0,5}?[A-Z0-9][\w+]*)(?:\s+(?:plan|subscription|membership))?\b/;

/** Messages worth reading for money: received email with no course attached. */
export function financeCandidate(m: SourceMessage): boolean {
  return m.channel === 'email' && !m.course && !m.structured && m.authorRole !== 'self' && !m.spam;
}

export type FinanceVerdict = 'evidence' | 'promo' | 'none';

export interface FinanceExtraction { claims: FinanceClaim[]; verdict: FinanceVerdict }

/** Deterministic extraction. Also the validator every LLM claim must pass (see validateClaim). */
export function extractFinance(msg: SourceMessage): FinanceExtraction {
  if (!financeCandidate(msg)) return { claims: [], verdict: 'none' };
  const text = `${msg.subject ?? ''}. ${msg.body}`;
  if (!TRANSACTIONAL.test(text)) return { claims: [], verdict: PROMO.test(text) && parseMoney(text).length + (/\btry|free\b/i.test(text) ? 1 : 0) > 0 ? 'promo' : 'none' };
  const type = ORDER.find((t) => RE[t].test(text));
  if (!type) return { claims: [], verdict: 'none' };

  const sentDate = localDate(msg.sentAt);
  // Body sentences first (the subject is a headline), and among matches the one that carries a date.
  const sents = [...sentences(msg.body), ...(msg.subject ? [msg.subject] : [])];
  const sentenceFor = (re: RegExp) => {
    const hits = sents.filter((s) => re.test(s));
    return hits.find((s) => explicitDate(s, sentDate)) ?? hits[0];
  };
  // The quoted evidence should carry the fact: prefer the matching sentence that names an amount, then the one with a date.
  const typeHits = sents.filter((s) => RE[type].test(s));
  const primary = typeHits.find((s) => parseMoney(s).length) ?? sentenceFor(RE[type]) ?? sents.find((s) => parseMoney(s).length) ?? sents[0];
  const all = parseMoney(text);
  const inPrimary = parseMoney(primary);
  const chosen = inPrimary[0] ?? all[0];
  const claim: FinanceClaim = {
    id: `${msg.id}#fin`,
    messageId: msg.id,
    type,
    merchant: '',
    recurring: RECURRING.test(text),
    links: [...new Set(text.match(URL_RE) ?? [])].map((u) => u.replace(/[.,;]+$/, '')),
    senderDomain: msg.authorEmail?.split('@')[1]?.toLowerCase(),
    quote: primary,
    extractor: 'rules',
    confidence: 0.8,
  };

  // Merchant: the sender. A payment processor reports on someone else's behalf, so the payee named in its receipt is the merchant.
  if (PROCESSORS.test(msg.authorName)) {
    claim.viaProcessor = msg.authorName.match(PROCESSORS)![1];
    const payee = text.match(/\b(?:payment|paid|sent)\b[^.]*?\bto\s+([A-Z][\w&'+.-]*(?:\s+[A-Z][\w&'+.-]*){0,3})/);
    claim.merchant = payee ? normalizeMerchant(payee[1]) : '';
  } else claim.merchant = normalizeMerchant(msg.authorName);
  if (!claim.merchant) return { claims: [], verdict: 'none' };

  const plan = text.match(PLAN_LINE)?.[1] ?? text.match(PLAN_PHRASE)?.[1] ?? text.match(FREE_TRIAL_OF)?.[1];
  if (plan) claim.plan = plan.replace(/\s*\([^)]*\)/g, '').trim();

  if (type === 'price_change') {
    const ms = inPrimary.length >= 2 ? inPrimary : all;
    if (ms.length >= 2) {
      claim.oldAmount = ms[0].amount;
      claim.amount = ms[1].amount;
      claim.currency = ms[1].currency;
      claim.interval = intervalNear(primary, ms[1]) ?? intervalNear(text);
    } else if (ms[0]) {
      claim.amount = ms[0].amount;
      claim.currency = ms[0].currency;
      claim.interval = intervalNear(primary, ms[0]) ?? intervalNear(text);
    }
    claim.effective = explicitDate(primary, sentDate);
  } else if (chosen) {
    claim.amount = chosen.amount;
    claim.currency = chosen.currency;
    claim.interval = intervalNear(inPrimary[0] ? primary : text, chosen) ?? intervalNear(text);
  } else claim.interval = intervalNear(text);

  if (type === 'trial') {
    claim.trialEnds = explicitDate(sentenceFor(/\btrial\b[^.]*\b(?:ends?|will end|expires?)\b/i) ?? '', sentDate);
    const then = sentenceFor(/\b(?:after that|then|you(?:'ll| will) be charged|converts?)\b/i);
    const m = then ? parseMoney(then)[0] : undefined;
    if (m) Object.assign(claim, { amount: m.amount, currency: m.currency, interval: intervalNear(then!, m) ?? intervalNear(text) });
  }
  const renew = sentenceFor(RE.renewal_notice);
  if (renew) {
    claim.renewsOn = explicitDate(renew, sentDate);
    if (type === 'renewal_notice') {
      const m = parseMoney(renew)[0];
      if (m) Object.assign(claim, { amount: m.amount, currency: m.currency, interval: intervalNear(renew, m) ?? claim.interval });
    }
  }
  if (type === 'cancel_confirmed') claim.accessUntil = explicitDate(sentenceFor(/\b(?:until|ends? on|access ends|through)\b/i) ?? '', sentDate);

  if (NEEDS_AMOUNT.includes(type) && claim.amount === undefined) return { claims: [], verdict: 'none' };
  return { claims: [claim], verdict: 'evidence' };
}

/**
 * Deterministic guardrail for claims from the LLM: the merchant comes from the sender, amounts and dates must
 * literally appear in the message, and outcomes (paid, failed, canceled) need the message's own wording.
 * Returns undefined when the claim isn't supported.
 */
export function validateClaim(c: FinanceClaim, msg: SourceMessage): FinanceClaim | undefined {
  const base = extractFinance(msg);
  if (base.verdict !== 'evidence') return undefined; // not transactional: marketing can't become a subscription
  const text = `${msg.subject ?? ''}. ${msg.body}`;
  const anchor = base.claims[0];
  const amounts = parseMoney(text).map((m) => m.amount);
  const out: FinanceClaim = { ...c, merchant: anchor.merchant, viaProcessor: anchor.viaProcessor, senderDomain: anchor.senderDomain, links: anchor.links, recurring: anchor.recurring, extractor: 'llm' };
  if (out.amount !== undefined && !amounts.some((a) => approx(a, out.amount))) out.amount = anchor.amount;
  if (out.oldAmount !== undefined && !amounts.some((a) => approx(a, out.oldAmount))) out.oldAmount = undefined;
  if (out.currency && !text.includes(out.currency) && out.currency !== anchor.currency) out.currency = anchor.currency;
  const dates = new Set(parseDates(text, localDate(msg.sentAt)).filter((d) => d.explicit).map((d) => d.date));
  for (const k of ['renewsOn', 'trialEnds', 'effective', 'accessUntil'] as const) if (out[k] && !dates.has(out[k]!)) out[k] = anchor[k];
  const outcome: Partial<Record<FinanceEventType, RegExp>> = { charge: RE.charge, payment_failed: RE.payment_failed, cancel_confirmed: RE.cancel_confirmed, cancel_requested: RE.cancel_requested, refund: RE.refund };
  if (outcome[out.type] && !outcome[out.type]!.test(text)) out.type = anchor.type;
  if (NEEDS_AMOUNT.includes(out.type) && out.amount === undefined) return undefined;
  return out;
}

/* ---------------- reconciliation ---------------- */

export interface FinanceInput {
  messages: SourceMessage[];
  actions: UserAction[];
  now: string;
  /** Optional LLM claims; each one still goes through validateClaim. */
  claimsFor?: (msg: SourceMessage) => FinanceClaim[] | undefined;
}

export interface FinanceResult {
  state: FinanceState;
  /** Per-message link and one-line summary, for the inbox. */
  byMessage: Map<string, { subscriptionIds: string[]; summary: string; verdict: FinanceVerdict | 'suspicious' }>;
}

const GENERIC = new Set(['plan', 'subscription', 'membership', 'monthly', 'yearly', 'annual', 'the', 'your', 'with', 'of', 'and', 'storage']);
function planTokens(plan: string | undefined, merchant: string): string[] {
  if (!plan) return [];
  const m = new Set(merchant.toLowerCase().split(/[^\w+]+/));
  return plan.toLowerCase().split(/[^\w+]+/).filter((w) => w && !GENERIC.has(w) && !m.has(w));
}
const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, '-').replace(/^-|-$/g, '');

interface Acc {
  id: string;
  merchant: string;
  plan?: string;
  tokens: string[];
  domains: Set<string>;
  items: { c: FinanceClaim; m: SourceMessage }[];
}

const NOTE: Record<FinanceEventType, string> = {
  signup: 'Signed up',
  trial: 'Free trial started',
  renewal_notice: 'Renewal notice',
  charge: 'Charged',
  payment_failed: 'Payment failed',
  price_change: 'Price change announced',
  cancel_requested: 'Cancellation requested',
  cancel_confirmed: 'Cancellation confirmed',
  refund: 'Refund',
  invoice: 'Invoice (not proof of payment)',
  one_time: 'One-time purchase',
};

function summarize(c: FinanceClaim, name: string): string {
  const p = fmtPrice(c.amount, c.currency, c.interval);
  switch (c.type) {
    case 'charge': return `${name} charged ${fmtMoney(c.amount, c.currency)}${c.viaProcessor ? ` (via ${c.viaProcessor})` : ''}.`;
    case 'renewal_notice': return `${name} renews${c.renewsOn ? ` ${fmtDate(c.renewsOn)}` : ''}${c.amount !== undefined ? ` at ${p}` : ''}.`;
    case 'trial': return `${name} free trial${c.trialEnds ? ` ends ${fmtDate(c.trialEnds)}` : ''}${c.amount !== undefined ? `, then ${p}` : ''}.`;
    case 'payment_failed': return `${name} payment${c.amount !== undefined ? ` of ${fmtMoney(c.amount, c.currency)}` : ''} failed.`;
    case 'price_change': return `${name} price ${c.oldAmount !== undefined ? `${fmtMoney(c.oldAmount, c.currency)} → ` : 'now '}${p}${c.effective ? ` from ${fmtDate(c.effective)}` : ''}.`;
    case 'cancel_requested': return `${name}: cancellation requested, not yet confirmed.`;
    case 'cancel_confirmed': return `${name} canceled${c.accessUntil ? `; access until ${fmtDate(c.accessUntil)}` : ''}.`;
    case 'refund': return `${name} refunded ${fmtMoney(c.amount, c.currency)}.`;
    case 'invoice': return `${name} invoice for ${fmtMoney(c.amount, c.currency)} — not proof of payment.`;
    case 'one_time': return `One-time purchase from ${name}: ${fmtMoney(c.amount, c.currency)}.`;
    default: return `${name}${c.amount !== undefined ? ` · ${p}` : ''}.`;
  }
}

export function reconcileFinance(input: FinanceInput): FinanceResult {
  const nowMs = Date.parse(input.now);
  const today = localDate(input.now);
  const msgs = input.messages.filter((m) => Date.parse(m.sentAt) <= nowMs && financeCandidate(m)).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
  const byMessage: FinanceResult['byMessage'] = new Map();
  const accs: Acc[] = [];
  const purchases: Purchase[] = [];
  const suspicious: Suspicious[] = [];

  for (const m of msgs) {
    const rules = extractFinance(m);
    const llm = input.claimsFor?.(m);
    const claims = llm ? llm.map((c) => validateClaim(c, m)).filter((c): c is FinanceClaim => Boolean(c)) : rules.claims;
    if (!claims.length) {
      if (rules.verdict === 'promo') byMessage.set(m.id, { subscriptionIds: [], summary: 'Marketing — not a subscription.', verdict: 'promo' });
      continue;
    }
    for (const c of claims) {
      const same = accs.filter((a) => a.merchant.toLowerCase() === c.merchant.toLowerCase());
      // Same name, different sender domain: a look-alike. Never let it change a real subscription.
      const dom = regDomain(c.senderDomain);
      if (same.length && !c.viaProcessor && dom && !same.some((a) => a.domains.has(dom))) {
        suspicious.push({ messageId: m.id, looksLike: same[0].merchant, senderDomain: c.senderDomain, reason: `Claims to be ${same[0].merchant} but was sent from ${c.senderDomain}, not the domain your real ${same[0].merchant} emails come from. Semora ignored it — don't use its links.` });
        byMessage.set(m.id, { subscriptionIds: [], summary: `Looks like ${same[0].merchant}, but from an unfamiliar sender — ignored.`, verdict: 'suspicious' });
        continue;
      }
      const tokens = planTokens(c.plan, c.merchant);
      let acc = tokens.length
        ? same.find((a) => !a.tokens.length || subset(a.tokens, tokens) || subset(tokens, a.tokens))
        : same.length === 1 ? same[0] : same.length > 1 ? [...same].sort((a, b) => b.items.at(-1)!.m.sentAt.localeCompare(a.items.at(-1)!.m.sentAt))[0] : undefined;
      const recurringish = c.recurring && c.type !== 'one_time';
      if (!acc && (!recurringish || c.type === 'refund')) {
        purchases.push({ id: `buy:${m.id}`, merchant: c.merchant, amount: c.amount, currency: c.currency, at: m.sentAt, messageId: m.id, note: summarize(c, c.merchant), type: c.type === 'refund' ? 'refund' : c.type === 'invoice' ? 'invoice' : c.type === 'charge' ? 'charge' : 'one_time' });
        byMessage.set(m.id, { subscriptionIds: [], summary: summarize(c, c.merchant), verdict: 'evidence' });
        continue;
      }
      if (acc && c.type === 'one_time') {
        purchases.push({ id: `buy:${m.id}`, merchant: c.merchant, amount: c.amount, currency: c.currency, at: m.sentAt, messageId: m.id, note: summarize(c, c.merchant), type: 'one_time' });
        byMessage.set(m.id, { subscriptionIds: [], summary: summarize(c, c.merchant), verdict: 'evidence' });
        continue;
      }
      if (!acc) {
        let id = `sub:${slug(c.merchant)}${tokens.length ? `-${slug(tokens.join(' '))}` : ''}`;
        while (accs.some((a) => a.id === id)) id += '-2';
        acc = { id, merchant: c.merchant, plan: c.plan, tokens, domains: new Set(), items: [] };
        accs.push(acc);
      }
      if (tokens.length > acc.tokens.length) {
        acc.tokens = tokens;
        acc.plan = c.plan;
      }
      if (dom && !c.viaProcessor) acc.domains.add(dom);
      acc.items.push({ c, m });
      const name = displayName(acc.merchant, acc.plan);
      byMessage.set(m.id, { subscriptionIds: [acc.id], summary: summarize(c, name), verdict: 'evidence' });
    }
  }

  const subscriptions = accs.map((a) => resolveSub(a, today, input.actions));
  // Summaries were written before the plan name was final; refresh with the final display name.
  for (const s of subscriptions) for (const e of s.events) {
    const it = accs.find((a) => a.id === s.id)!.items.find((x) => x.m.id === e.messageId)!;
    byMessage.set(e.messageId, { subscriptionIds: [s.id], summary: summarize(it.c, s.name), verdict: 'evidence' });
  }
  const alerts = buildAlerts(subscriptions, suspicious, msgs, today);
  const changes = buildChanges(subscriptions, nowMs);
  const visible = subscriptions.filter((s) => s.userAction !== 'dismissed');
  const breakdown = visible.filter((s) => s.counted).map((s) => ({ subscriptionId: s.id, name: s.name, amount: s.amount!, interval: s.interval!, monthly: monthlyOf(s.amount!, s.interval!) }));
  const monthly = breakdown.reduce((n, b) => n + b.monthly, 0);
  const statusOrder: SubscriptionStatus[] = ['payment_failed', 'trial', 'needs_confirmation', 'cancel_pending', 'price_changed', 'renewal_soon', 'active', 'canceled'];
  subscriptions.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || (a.renewsOn ?? a.trialEnds ?? '9').localeCompare(b.renewsOn ?? b.trialEnds ?? '9') || a.name.localeCompare(b.name));
  return {
    byMessage,
    state: {
      subscriptions,
      purchases: purchases.sort((a, b) => b.at.localeCompare(a.at)),
      alerts,
      changes,
      suspicious,
      summary: {
        currency: 'USD',
        monthly: round2(monthly),
        annual: round2(monthly * 12),
        counted: breakdown.length,
        renewingSoon: visible.filter((s) => s.counted && s.renewsOn && s.renewsOn >= today && s.renewsOn <= addDays(today, RENEWAL_SOON_DAYS)).length,
        trialsEnding: visible.filter((s) => s.status === 'trial' && s.trialEnds && s.trialEnds <= addDays(today, TRIAL_SOON_DAYS)).length,
        failed: visible.filter((s) => s.status === 'payment_failed').length,
        priceIncreases: visible.filter((s) => s.priceChange && s.priceChange.from !== undefined && s.priceChange.to > s.priceChange.from).length,
        attention: alerts.filter((x) => x.urgency >= ATTENTION).length,
        breakdown,
        excluded: visible.filter((s) => !s.counted).map((s) => ({ subscriptionId: s.id, name: s.name, reason: s.excludedReason ?? 'Not counted' })),
      },
    },
  };
}

function displayName(merchant: string, plan?: string) {
  if (!plan) return merchant;
  return plan.toLowerCase().includes(merchant.toLowerCase()) ? plan : `${merchant} ${plan}`;
}

function resolveSub(a: Acc, today: string, actions: UserAction[]): Subscription {
  const name = displayName(a.merchant, a.plan);
  const events: FinanceEvent[] = [];
  let amount: number | undefined;
  let currency: string | undefined;
  let interval: BillingInterval | undefined;
  let statementMsg: string | undefined;
  let renewsOn: string | undefined;
  let trialStart: string | undefined;
  let trialEnds: string | undefined;
  let trialThen: Subscription['trialThen'];
  let priceChange: Subscription['priceChange'];
  let conflict: Subscription['conflict'];
  let lastCharge: string | undefined;
  let lastFailed: string | undefined;
  let cancelReq: string | undefined;
  let cancelConf: string | undefined;
  let accessUntil: string | undefined;
  let chargedAfterCancel = false;
  const links = new Set<string>();

  for (const { c, m } of a.items) {
    c.links.forEach((l) => links.add(l));
    const ev: FinanceEvent = { id: `fev:${m.id}`, subscriptionId: a.id, type: c.type, at: m.sentAt, date: c.renewsOn ?? c.trialEnds ?? c.effective ?? c.accessUntil, amount: c.amount, currency: c.currency, interval: c.interval, messageId: m.id, note: NOTE[c.type], quote: c.quote };
    const day = localDate(m.sentAt);
    if (c.type === 'charge') {
      const dup = events.find((e) => e.type === 'charge' && !e.duplicateOf && localDate(e.at) === day && approx(e.amount, c.amount));
      if (dup) {
        ev.duplicateOf = dup.id;
        ev.note = `Same charge, also reported${c.viaProcessor ? ` by ${c.viaProcessor}` : ''}`;
        events.push(ev);
        continue;
      }
    }
    const states = ['signup', 'charge', 'renewal_notice', 'invoice', 'payment_failed'].includes(c.type);
    if (states && c.amount !== undefined) {
      const pc = priceChange && !priceChange.confirmedBy ? priceChange : undefined;
      if (pc && approx(c.amount, pc.to)) {
        amount = pc.to;
        pc.confirmedBy = m.id;
        ev.note += ' — at the new price';
      } else if (pc && approx(c.amount, pc.from)) {
        /* still the old price, before the change takes effect */
      } else if (amount === undefined) {
        amount = c.amount;
        currency = c.currency;
        interval = c.interval ?? interval;
        statementMsg = m.id;
      } else if (!approx(c.amount, amount) || (c.interval && interval && c.interval !== interval)) {
        conflict = { field: 'price', options: [{ label: fmtPrice(amount, currency, interval), amount, interval, messageId: statementMsg! }, { label: fmtPrice(c.amount, c.currency, c.interval ?? interval), amount: c.amount, interval: c.interval ?? interval, messageId: m.id }] };
        ev.note += ' — disagrees with earlier emails';
      }
      if (!interval && c.interval) interval = c.interval;
      if (!currency && c.currency) currency = c.currency;
      if (!conflict && c.amount !== undefined && approx(c.amount, amount)) statementMsg = m.id;
    }
    if (c.renewsOn) renewsOn = c.renewsOn;
    switch (c.type) {
      case 'charge':
        lastCharge = m.sentAt;
        if (cancelConf || cancelReq) chargedAfterCancel = true;
        break;
      case 'trial':
        trialStart = m.sentAt;
        trialEnds = c.trialEnds;
        trialThen = { amount: c.amount, currency: c.currency, interval: c.interval };
        break;
      case 'payment_failed':
        lastFailed = m.sentAt;
        if (amount === undefined) { amount = c.amount; currency = c.currency; interval = c.interval ?? interval; }
        break;
      case 'price_change':
        priceChange = { from: c.oldAmount ?? amount, to: c.amount!, effective: c.effective, messageId: m.id };
        if (c.interval && !interval) interval = c.interval;
        if (c.currency && !currency) currency = c.currency;
        break;
      case 'cancel_requested':
        cancelReq = m.sentAt;
        break;
      case 'cancel_confirmed':
        cancelConf = m.sentAt;
        accessUntil = c.accessUntil;
        chargedAfterCancel = false;
        break;
    }
    events.push(ev);
  }
  if (priceChange && !priceChange.confirmedBy && priceChange.effective && priceChange.effective <= today) {
    amount = priceChange.to;
    priceChange.adoptedByDate = true;
  }

  // Status: strongest fact wins. Conflicts and charges after a cancellation are never resolved by guessing.
  let status: SubscriptionStatus;
  let reason: string;
  const announcedDaysAgo = priceChange ? (Date.parse(today) - Date.parse(localDate(a.items.find((x) => x.m.id === priceChange!.messageId)!.m.sentAt))) / 86400_000 : Infinity;
  if (conflict) {
    status = 'needs_confirmation';
    reason = `Two ${a.merchant} emails disagree (${conflict.options.map((o) => o.label).join(' vs ')}) and neither explains the change. Semora won't guess.`;
  } else if (chargedAfterCancel) {
    status = 'needs_confirmation';
    reason = `${a.merchant} charged you after a cancellation email. Check whether the cancellation went through.`;
  } else if (cancelConf) {
    status = 'canceled';
    reason = `${a.merchant} confirmed the cancellation${accessUntil ? `; access lasts until ${fmtDate(accessUntil)}` : ''}.`;
  } else if (cancelReq) {
    status = 'cancel_pending';
    reason = `You asked ${a.merchant} to cancel, but no confirmation has arrived. A request isn't proof it's canceled.`;
  } else if (lastFailed && (!lastCharge || lastFailed > lastCharge)) {
    status = 'payment_failed';
    reason = `${a.merchant}'s most recent email says the payment didn't go through, and no receipt has arrived since.`;
  } else if (trialStart && (!lastCharge || lastCharge < trialStart)) {
    status = trialEnds && trialEnds < today ? 'needs_confirmation' : 'trial';
    reason = trialEnds && trialEnds < today ? `The trial ended ${fmtDate(trialEnds)} and no receipt has arrived — it may have converted or lapsed.` : `Free trial${trialEnds ? ` until ${fmtDate(trialEnds)}` : ''}. No charge yet${trialThen?.amount !== undefined ? `; it becomes ${fmtPrice(trialThen.amount, trialThen.currency, trialThen.interval)} unless you cancel` : ''}.`;
  } else if (priceChange && (announcedDaysAgo <= 45 || (priceChange.effective && Math.abs(Date.parse(priceChange.effective) - Date.parse(today)) <= 30 * 86400_000))) {
    status = 'price_changed';
    reason = `${a.merchant} announced ${priceChange.from !== undefined ? `${fmtMoney(priceChange.from, currency)} → ` : ''}${fmtPrice(priceChange.to, currency, interval)}${priceChange.effective ? ` from ${fmtDate(priceChange.effective)}` : ''}. ${priceChange.confirmedBy ? 'A later email confirms the new price.' : priceChange.adoptedByDate ? 'The effective date has passed.' : 'Not confirmed by a charge yet.'}`;
  } else if (renewsOn && renewsOn >= today && renewsOn <= addDays(today, RENEWAL_SOON_DAYS)) {
    status = 'renewal_soon';
    reason = `${a.merchant} says it renews ${fmtDate(renewsOn)}.`;
  } else {
    status = 'active';
    reason = lastCharge ? `Last receipt ${fmtDate(localDate(lastCharge))}.` : `${a.merchant} confirms the ${a.items.some((x) => x.c.type === 'renewal_notice') ? 'upcoming renewal' : 'subscription'}.`;
  }

  // How sure: the merchant itself describing your plan beats repeated charges, which beat a single mention.
  const own = a.items.filter((x) => !x.c.viaProcessor && x.c.recurring);
  const charges = events.filter((e) => e.type === 'charge' && !e.duplicateOf);
  let certainty: Subscription['certainty'] = own.some((x) => x.c.type !== 'invoice') ? 'confirmed' : charges.length >= 2 ? 'inferred' : 'unverified';

  // Your own corrections, in order. They only ever record what you said; nothing is done outside Semora.
  let userAction: Subscription['userAction'];
  let followUp = false;
  let acknowledged = false;
  for (const act of [...actions].filter((x) => x.targetId === a.id).sort((x, y) => x.at.localeCompare(y.at))) {
    if (act.type === 'fin_undo') { userAction = undefined; followUp = false; acknowledged = false; }
    else if (act.type === 'fin_follow') followUp = !followUp;
    else if (act.type === 'fin_ack') acknowledged = true;
    else if (act.type === 'fin_canceled') userAction = 'canceled';
    else if (act.type === 'fin_cancel_requested') userAction = 'cancel_requested';
    else if (act.type === 'fin_dismiss') userAction = 'dismissed';
    else if (act.type === 'fin_confirm') {
      userAction = 'confirmed';
      const opt = conflict?.options.find((o) => o.messageId === act.value);
      if (opt) {
        amount = opt.amount;
        interval = opt.interval;
        conflict = undefined;
      }
    }
  }
  if (userAction === 'canceled' && status !== 'canceled') {
    status = 'canceled';
    reason = `You marked this canceled. ${a.merchant} hasn't confirmed it by email — keep an eye out for a charge.`;
    certainty = 'user';
  } else if (userAction === 'cancel_requested' && !['canceled', 'cancel_pending'].includes(status)) {
    status = 'cancel_pending';
    reason = `You said you asked ${a.merchant} to cancel. Waiting for their confirmation email.`;
  } else if (userAction === 'confirmed') {
    certainty = 'user';
    if (status === 'needs_confirmation' && !conflict) status = renewsOn && renewsOn >= today && renewsOn <= addDays(today, RENEWAL_SOON_DAYS) ? 'renewal_soon' : 'active';
    reason = `You confirmed ${fmtPrice(amount, currency, interval)}. ${status === 'needs_confirmation' ? 'The emails still disagree.' : reason.startsWith('Two ') ? '' : reason}`.trim();
  }

  const dom = [...a.domains];
  const manageUrl = [...links].find((l) => l.startsWith('https://') && dom.includes(regDomain(new URL(l).hostname)!));
  const unverifiedLinks = [...links].filter((l) => l !== manageUrl && !(l.startsWith('https://') && dom.includes(regDomain(new URL(l).hostname)!)));

  const live: SubscriptionStatus[] = ['active', 'renewal_soon', 'price_changed', 'payment_failed'];
  let excludedReason: string | undefined;
  if (userAction === 'dismissed') excludedReason = 'You said this isn\'t a subscription';
  else if (status === 'trial') excludedReason = `Free trial — would add ${fmtPrice(trialThen?.amount, trialThen?.currency, trialThen?.interval)} if it converts`;
  else if (status === 'cancel_pending') excludedReason = 'Cancellation requested, not confirmed';
  else if (status === 'canceled') excludedReason = 'Canceled';
  else if (status === 'needs_confirmation') excludedReason = 'Sources disagree';
  else if (!live.includes(status)) excludedReason = 'Not active';
  else if (certainty === 'unverified') excludedReason = 'Only one mention — not enough to count';
  else if (amount === undefined) excludedReason = 'Amount unknown';
  else if (!interval) excludedReason = 'Billing frequency unknown';
  else if (!currency) excludedReason = 'Currency unknown — not added to the total';
  else if (currency !== 'USD') excludedReason = `Billed in ${currency} — not converted`;
  const counted = !excludedReason;

  return {
    id: a.id,
    merchant: a.merchant,
    plan: a.plan,
    name,
    amount,
    currency,
    interval,
    monthly: amount !== undefined && interval ? round2(monthlyOf(amount, interval)) : undefined,
    annual: amount !== undefined && interval ? round2(monthlyOf(amount, interval) * 12) : undefined,
    renewsOn: status === 'canceled' ? undefined : renewsOn,
    trialEnds,
    trialThen,
    accessUntil,
    priceChange,
    conflict,
    status,
    certainty,
    counted,
    excludedReason,
    reason,
    events,
    messageIds: [...new Set(events.map((e) => e.messageId))],
    sources: ['gmail'],
    manageUrl,
    unverifiedLinks,
    lastEmailAt: a.items.at(-1)!.m.sentAt,
    userAction,
    followUp: followUp || undefined,
    acknowledged: acknowledged || undefined,
  };
}

const short = (iso: string) => fmtDate(iso).split(' ')[0];

function buildAlerts(subs: Subscription[], suspicious: Suspicious[], msgs: SourceMessage[], today: string): FinanceAlert[] {
  const out: FinanceAlert[] = [];
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86400_000);
  const ids = (s: Subscription, types?: FinanceEventType[]) => s.events.filter((e) => !types || types.includes(e.type)).map((e) => e.messageId);
  for (const s of subs) {
    if (s.userAction === 'dismissed') continue;
    const cand: FinanceAlert[] = [];
    const base = { subscriptionId: s.id, at: s.lastEmailAt };
    if (s.status === 'payment_failed') cand.push({ ...base, id: `fa:${s.id}:failed`, kind: 'payment_failed', urgency: 100, text: `Your ${fmtMoney(s.amount, s.currency)} payment to ${s.merchant} failed. Check the original email before the membership lapses.`, short: `${s.merchant} payment failed`, messageIds: ids(s, ['payment_failed']) });
    if (s.status === 'trial' && s.trialEnds && days(s.trialEnds) <= TRIAL_SOON_DAYS) {
      const d = days(s.trialEnds);
      const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days (${short(s.trialEnds)})`;
      cand.push({ ...base, id: `fa:${s.id}:trial`, kind: 'trial_ending', urgency: 90 - d, text: `Your ${s.merchant} trial ends ${when}. It may convert to ${fmtPrice(s.trialThen?.amount, s.trialThen?.currency, s.trialThen?.interval)} unless you cancel.`, short: `${s.merchant} trial ends ${short(s.trialEnds)}${s.trialThen?.amount !== undefined ? ` → ${fmtPrice(s.trialThen.amount, s.trialThen.currency, s.trialThen.interval)}` : ''}`, messageIds: ids(s, ['trial']) });
    }
    const pc = s.priceChange;
    const soon = s.renewsOn && s.counted && days(s.renewsOn) >= 0 && days(s.renewsOn) <= RENEWAL_SOON_DAYS;
    if (s.status === 'price_changed' && pc && pc.from !== undefined && pc.to !== pc.from) {
      const up = pc.to > pc.from;
      cand.push({ ...base, id: `fa:${s.id}:price`, kind: 'price_increase', urgency: up ? 62 : 30, text: `${s.name} ${up ? 'went up' : 'went down'} from ${fmtPrice(pc.from, s.currency, s.interval)} to ${fmtPrice(pc.to, s.currency, s.interval)}${soon ? `; it renews ${fmtDate(s.renewsOn!)} at the new price` : ''}.`, short: `${s.merchant} ${up ? 'up' : 'down'} to ${fmtPrice(pc.to, s.currency, s.interval)}`, messageIds: [pc.messageId, ...(pc.confirmedBy ? [pc.confirmedBy] : [])] });
    } else if (soon) {
      const d = days(s.renewsOn!);
      cand.push({ ...base, id: `fa:${s.id}:renew`, kind: 'renewal_soon', urgency: 50 - d, text: `${s.name} renews ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days (${fmtDate(s.renewsOn!)})`} — ${fmtPrice(s.amount, s.currency, s.interval)}.`, short: `${s.merchant} renews ${short(s.renewsOn!)}`, messageIds: ids(s, ['renewal_notice', 'charge']).slice(-1) });
    }
    if (s.status === 'cancel_pending') cand.push({ ...base, id: `fa:${s.id}:pending`, kind: 'cancel_pending', urgency: 45, text: `${s.merchant}: you asked to cancel, but there's no confirmation yet. Until there is, assume it can still charge you.`, short: `${s.merchant} cancel unconfirmed`, messageIds: ids(s, ['cancel_requested']) });
    if (s.status === 'needs_confirmation') cand.push({ ...base, id: `fa:${s.id}:confirm`, kind: 'needs_confirmation', urgency: 40, text: s.conflict ? `${s.name}: ${s.conflict.options.map((o) => o.label).join(' or ')}? The emails disagree.` : `${s.name}: ${s.reason}`, short: `${s.merchant}: needs confirmation`, messageIds: s.conflict ? s.conflict.options.map((o) => o.messageId) : ids(s) });
    if (s.status === 'canceled' && !s.userAction) {
      const conf = s.events.filter((e) => e.type === 'cancel_confirmed').at(-1);
      if (conf && days(localDate(conf.at)) >= -14) cand.push({ ...base, id: `fa:${s.id}:canceled`, kind: 'cancel_confirmed', urgency: 20, text: `${s.merchant} confirmed your cancellation${s.accessUntil ? `; access ends ${fmtDate(s.accessUntil)}` : ''}.`, short: `${s.merchant} canceled`, messageIds: [conf.messageId] });
    }
    const top = cand.sort((a, b) => b.urgency - a.urgency)[0];
    // Acknowledged: still listed so nothing disappears silently, but it no longer needs attention.
    if (top) out.push(s.acknowledged ? { ...top, acknowledged: true, urgency: Math.min(top.urgency, 30) } : top);
  }
  for (const x of suspicious) {
    const m = msgs.find((y) => y.id === x.messageId)!;
    out.push({ id: `fa:sus:${x.messageId}`, kind: 'suspicious', urgency: 65, at: m.sentAt, text: `An email claiming to be ${x.looksLike} came from ${x.senderDomain}. Semora ignored it; don't click its links.`, short: `Fake ${x.looksLike} email ignored`, messageIds: [x.messageId] });
  }
  return out.sort((a, b) => b.urgency - a.urgency || a.at.localeCompare(b.at));
}

function buildChanges(subs: Subscription[], nowMs: number): FinanceChange[] {
  const out: FinanceChange[] = [];
  const recent = (iso: string) => nowMs - Date.parse(iso) <= 45 * 86400_000;
  for (const s of subs) {
    if (s.userAction === 'dismissed') continue;
    for (const e of s.events) {
      if (e.duplicateOf || !recent(e.at)) continue;
      const prev = s.events.filter((x) => x.at < e.at && x.amount !== undefined && !x.duplicateOf).at(-1);
      if (e.type === 'price_change' && s.priceChange) out.push({ id: `fc:${e.id}`, subscriptionId: s.id, type: 'price', from: s.priceChange.from !== undefined ? fmtPrice(s.priceChange.from, s.currency, s.interval) : undefined, to: fmtPrice(s.priceChange.to, s.currency, s.interval), at: e.at, messageIds: [e.messageId, ...(s.priceChange.confirmedBy ? [s.priceChange.confirmedBy] : [])], text: `${s.name} price${s.priceChange.effective ? ` from ${fmtDate(s.priceChange.effective)}` : ''}${s.priceChange.confirmedBy ? ' · confirmed by a later email' : ''}` });
      if (e.type === 'cancel_confirmed') out.push({ id: `fc:${e.id}`, subscriptionId: s.id, type: 'canceled', from: prev ? `Active · ${fmtPrice(prev.amount, prev.currency, prev.interval ?? s.interval)}` : 'Active', to: `Canceled${s.accessUntil ? ` · access until ${fmtDate(s.accessUntil)}` : ''}`, at: e.at, messageIds: [e.messageId], text: `${s.name} cancellation confirmed by ${s.merchant}` });
      if (e.type === 'cancel_requested') out.push({ id: `fc:${e.id}`, subscriptionId: s.id, type: 'cancel_requested', from: 'Active', to: 'Cancellation requested', at: e.at, messageIds: [e.messageId], text: `${s.name} — a request isn't a confirmation` });
      if (e.type === 'payment_failed') out.push({ id: `fc:${e.id}`, subscriptionId: s.id, type: 'payment_failed', from: prev ? `Paid ${fmtDate(localDate(prev.at))}` : undefined, to: 'Payment failed', at: e.at, messageIds: [e.messageId], text: `${s.name} — ${fmtMoney(e.amount, e.currency)} didn't go through` });
      if (e.type === 'trial') out.push({ id: `fc:${e.id}`, subscriptionId: s.id, type: 'trial_started', to: `Free until ${s.trialEnds ? fmtDate(s.trialEnds) : 'the trial ends'}, then ${fmtPrice(s.trialThen?.amount, s.trialThen?.currency, s.trialThen?.interval)}`, at: e.at, messageIds: [e.messageId], text: `${s.name} trial started — converts unless you cancel` });
    }
    if (s.conflict) {
      const last = s.conflict.options.at(-1)!;
      out.push({ id: `fc:${s.id}:conflict`, subscriptionId: s.id, type: 'conflict', from: s.conflict.options[0].label, to: `${last.label}?`, at: s.events.find((e) => e.messageId === last.messageId)!.at, messageIds: s.conflict.options.map((o) => o.messageId), text: `${s.name} — emails disagree, needs confirmation` });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
