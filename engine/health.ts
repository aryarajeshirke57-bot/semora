// Inbox health: what the inbox is made of and the short list of things that would make it calm.
// Pure and read-only. Every number comes from messages Semora actually has; storage quota is never
// guessed (Gmail read-only access can't see it), and every cleanup step is something the student does
// in Gmail themselves (a search link), or a decision inside Semora.
import type { FinanceState, HealthCategory, HealthChecklistItem, HealthSender, HealthState, InboxCategory, Item, MessageView, UserAction } from './types.ts';

export const LARGE_BYTES = 5_000_000;

const ORDER: InboxCategory[] = ['courses', 'money', 'opportunities', 'admin', 'clubs', 'noise'];
export const CATEGORY_LABEL: Record<InboxCategory, string> = {
  courses: 'Academic',
  money: 'Subscriptions & billing',
  opportunities: 'Opportunities',
  admin: 'Admin',
  clubs: 'Clubs & social',
  noise: 'Promotions & newsletters',
  spam: 'Spam',
};

const HIDDEN = ['grade', 'calendar', 'assignment', 'syllabus'];
export const primaryCategory = (m: Pick<MessageView, 'categories'>): InboxCategory => ORDER.find((c) => m.categories.includes(c)) ?? 'noise';
const mb = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;

function senders(ms: MessageView[], category: InboxCategory): HealthSender[] {
  const by = new Map<string, HealthSender>();
  for (const m of ms) {
    const key = m.authorEmail ?? m.authorName;
    const cur = by.get(key) ?? { name: m.authorName, email: m.authorEmail, count: 0, category, gmailQuery: m.authorEmail ? `from:${m.authorEmail}` : `from:"${m.authorName}"` };
    cur.count++;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface HealthInput {
  now: string;
  messages: MessageView[];
  items: Item[];
  finance: FinanceState;
  actions: UserAction[];
}

export function buildHealth(input: HealthInput): HealthState {
  const all = input.messages.filter((m) => !HIDDEN.includes(m.channel));
  const inbox = all.filter((m) => !m.spam);
  const spam = all.filter((m) => m.spam);
  const counts = new Map<InboxCategory, number>();
  for (const m of inbox) counts.set(primaryCategory(m), (counts.get(primaryCategory(m)) ?? 0) + 1);
  const categories: HealthCategory[] = ORDER.map((id) => ({ id, label: CATEGORY_LABEL[id], count: counts.get(id) ?? 0 }));
  const promos = inbox.filter((m) => primaryCategory(m) === 'noise');
  const promoSenders = senders(promos, 'noise').filter((s) => s.count >= 2).slice(0, 6);
  const attachments = inbox
    .filter((m) => m.source === 'gmail' && (m.sizeBytes ?? 0) >= LARGE_BYTES)
    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    .map((m) => ({ messageId: m.id, subject: m.subject ?? '(no subject)', from: m.authorName, sizeBytes: m.sizeBytes!, at: m.sentAt, gmailQuery: `larger:5M from:${m.authorEmail ?? `"${m.authorName}"`}` }));
  const attachmentBytes = attachments.reduce((n, a) => n + a.sizeBytes, 0);
  const suspicious = inbox.filter((m) => m.suspicious);

  const done = new Set<string>();
  for (const a of [...input.actions].sort((x, y) => x.at.localeCompare(y.at))) {
    if (a.type === 'chk_done') done.add(a.targetId);
    if (a.type === 'chk_undo') done.delete(a.targetId);
  }
  const list: Omit<HealthChecklistItem, 'done'>[] = [];
  for (const s of suspicious) list.push({ id: `chk:phish:${s.id}`, title: `Delete the look-alike "${s.authorName}" email`, detail: `Sent from ${s.authorEmail?.split('@')[1]}, not the real sender's domain. Don't use its links.`, gmailQuery: `from:${s.authorEmail}` });
  for (const a of input.finance.alerts.filter((x) => x.urgency >= 60 && x.subscriptionId && (x.kind === 'payment_failed' || x.kind === 'trial_ending'))) {
    const sub = input.finance.subscriptions.find((s) => s.id === a.subscriptionId)!;
    list.push({ id: `chk:fin:${a.id}`, title: a.kind === 'payment_failed' ? `Fix the ${sub.merchant} payment` : `Decide on the ${sub.merchant} trial`, detail: a.text, route: '/subscriptions', subscriptionId: sub.id });
  }
  for (const r of input.items.filter((i) => i.kind === 'reply' && i.status === 'active')) list.push({ id: `chk:reply:${r.id}`, title: r.title, detail: 'A direct request waiting on your answer.', route: '/waiting' });
  if (promoSenders.length) {
    const n = promoSenders.reduce((k, s) => k + s.count, 0);
    list.push({ id: 'chk:promos', title: `Filter or unsubscribe from ${promoSenders.length} noisy senders`, detail: `${promoSenders.slice(0, 3).map((s) => `${s.name} (${s.count})`).join(', ')}${promoSenders.length > 3 ? '…' : ''} — ${n} emails between them.`, gmailQuery: 'category:promotions newer_than:14d' });
  }
  if (attachments.length) list.push({ id: 'chk:attachments', title: `Review ${attachments.length} large attachments`, detail: `${mb(attachmentBytes)} across ${attachments.length} emails over 5 MB. Download what you need, then delete in Gmail.`, gmailQuery: 'larger:5M' });
  if (spam.length) list.push({ id: 'chk:spam', title: `Skim spam for anything real`, detail: `${spam.length} in spam. Gmail removes spam after 30 days by itself — just check nothing important landed there.`, gmailQuery: 'in:spam' });

  const times = all.map((m) => m.sentAt).sort();
  return {
    window: { from: times[0] ?? input.now, to: input.now },
    total: inbox.length,
    categories,
    actionable: inbox.filter((m) => primaryCategory(m) !== 'noise' && (m.itemIds.length > 0 || (m.subscriptionIds?.length ?? 0) > 0)).length,
    promotional: promos.length,
    promoSenders,
    attachments,
    attachmentBytes,
    spam: { count: spam.length, senders: senders(spam, 'spam'), suspiciousInInbox: suspicious.length },
    storage: null,
    checklist: list.map((c) => ({ ...c, done: done.has(c.id) })),
  };
}
