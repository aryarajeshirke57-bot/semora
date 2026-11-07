// The Morning Brief: what you need to know today, in under a minute.
// Built only from reconciled items, changes and proposals, so it can never disagree with the rest of the app.
import { fmtDate, fmtMoment, fmtRange, fmtTime, localDate, toMoment } from './time.ts';
import { ATTENTION, fmtMoney } from './finance.ts';
import type { Brief, BriefLine, BriefPart, Change, FinanceState, Item, LocalMoment, MessageView, Platform, Proposal } from './types.ts';

export const BRIEF_MAX_LINES = 7;
export const BRIEF_MAX_WORDS = 120;

export interface BriefInput {
  now: string;
  firstName: string;
  items: Item[];
  changes: Change[];
  proposals: Proposal[];
  messages: Pick<MessageView, 'id' | 'authorName' | 'source'>[];
  /** Money alerts; optional so the academic brief is unchanged without billing email. */
  finance?: FinanceState;
}

const short = (title: string) => title.split(' — ')[0];
/** "Prof. Dana Whitfield" → "Prof. Whitfield"; "Jordan Kim" → "Jordan". */
export function shortName(name: string) {
  const parts = name.split(' ');
  if (/^(Prof\.|Dr\.)$/.test(parts[0]) && parts.length > 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return /^(Prof\.|Dr\.)$/.test(parts[0]) ? name : parts[0];
}
/** "Thu 10 PM" — weekday plus a compact time. */
function when(m?: LocalMoment) {
  if (!m?.date) return m?.time ? fmtTime(m.time).replace(':00', '') : '';
  const day = fmtDate(m.date).split(' ')[0];
  return m.time ? `${day} ${fmtTime(m.time).replace(':00', '')}` : day;
}
const words = (s: string) => s.split(/\s+/).filter((w) => /[\w\d]/.test(w)).length;

function changeLine(item: Item, cs: Change[], related: Item | undefined, input: BriefInput): BriefLine {
  const types = new Set(cs.map((c) => c.type));
  const by = cs.find((c) => c.type !== 'added') ?? cs[0];
  const t = short(item.title);
  let text: string;
  if (types.has('resolved')) text = `${t} confirmed: due ${fmtMoment(item.due)}`;
  else if (item.status === 'canceled') text = `${t} ${localDate(input.now) === item.start?.date ? 'today' : when(item.start)} canceled${related ? ` → extra ${when(related.start)}` : ''}`;
  else if (types.has('added')) text = `New: ${t}, ${when(item.start ?? item.due)}`;
  else {
    const bits: string[] = [];
    if (types.has('due')) bits.push(`now due ${fmtMoment(item.due)}`);
    if (types.has('time')) bits.push(`now starts ${fmtTime(item.start!.time!)}`);
    if (types.has('location')) bits.push(`moved to ${item.location}`);
    text = `${t} ${bits.join(', ')}`;
    if (!types.has('due') && !types.has('time') && item.start) text += ` (${when(item.start)})`;
  }
  const notes: string[] = [];
  notes.push(`${shortName(by.byName)}${item.scopeNote ? ` · ${item.scopeNote.replace(/^Applies to /, '')}` : ''}`);
  const outdated = item.evidence.find((e) => e.role === 'outdated');
  const outdatedBy = outdated && input.messages.find((m) => m.id === outdated.messageId);
  const oldDue = cs.find((c) => c.type === 'due')?.from as LocalMoment | undefined;
  if (outdatedBy) notes.push(`${shortName(outdatedBy.authorName)} is still quoting ${oldDue?.date ? fmtDate(oldDue.date).split(' ')[0] : 'the old date'} — outdated`);
  const ids = [...new Set([...cs.flatMap((c) => c.messageIds), ...(outdated ? [outdated.messageId] : [])])];
  return {
    id: `changed:${item.id}`,
    section: 'changed',
    text,
    note: notes.join('. '),
    itemId: item.id,
    messageIds: ids,
    sources: [...new Set(cs.map((c) => c.source))] as Platform[],
    live: cs.some((c) => c.live),
  };
}

export function buildBrief(input: BriefInput): Brief {
  const now = Date.parse(input.now);
  const since = now - 24 * 3600_000;
  const byId = new Map(input.items.map((i) => [i.id, i]));
  const isOpen = (i: Item) => i.status !== 'done' && i.status !== 'dismissed';
  const atMs = (i: Item) => (i.at ? Date.parse(i.at) : Infinity);

  // CHANGED — one line per item, office-hours cancellations fold their replacement in.
  const recent = input.changes.filter((c) => c.type !== 'completed' && Date.parse(c.at) >= since);
  const perItem = new Map<string, Change[]>();
  for (const c of recent) (perItem.get(c.itemId) ?? perItem.set(c.itemId, []).get(c.itemId)!).push(c);
  const folded = new Set<string>();
  const changed: BriefLine[] = [];
  const entries = [...perItem.entries()].filter(([id]) => byId.has(id) && isOpen(byId.get(id)!));
  for (const [id, cs] of entries) {
    const item = byId.get(id)!;
    if (item.status !== 'canceled' || item.kind !== 'office_hours') continue;
    const repl = entries.map(([rid]) => byId.get(rid)!).find((r) => r.id !== id && r.kind === 'office_hours' && r.course === item.course && perItem.get(r.id)!.some((c) => c.type === 'added'));
    if (repl) folded.add(repl.id);
    changed.push({ ...changeLine(item, cs, repl, input), messageIds: [...new Set([...cs, ...(repl ? perItem.get(repl.id)! : [])].flatMap((c) => c.messageIds))] });
  }
  for (const [id, cs] of entries) {
    const item = byId.get(id)!;
    if (folded.has(id) || (item.status === 'canceled' && item.kind === 'office_hours')) continue;
    changed.push(changeLine(item, cs, undefined, input));
  }
  changed.sort((a, b) => atMs(byId.get(a.itemId!)!) - atMs(byId.get(b.itemId!)!));
  const mentioned = new Set([...changed.map((l) => l.itemId!), ...folded]);

  // NEXT 48 HOURS — one line, the things that are actually due.
  const soonItems = input.items
    .filter((i) => isOpen(i) && i.status === 'active' && !mentioned.has(i.id) && ['assignment', 'exam', 'presentation', 'promise', 'task', 'reply'].includes(i.kind))
    .filter((i) => i.at && Date.parse(i.at) > now && Date.parse(i.at) <= now + 48 * 3600_000)
    .sort((a, b) => atMs(a) - atMs(b))
    .slice(0, 3);
  const parts: BriefPart[] = soonItems.map((i) => ({ itemId: i.id, text: i.kind === 'promise' ? `${promiseLabel(i)} by ${when(i.due)}` : `${short(i.title)} ${when(i.due ?? i.start)}` }));
  const soon: BriefLine[] = parts.length
    ? [{ id: 'soon', section: 'soon', text: parts.map((p) => p.text).join(' · '), parts, messageIds: soonItems.flatMap((i) => i.evidence.slice(0, 1).map((e) => e.messageId)), sources: [...new Set(soonItems.flatMap((i) => i.sources))] }]
    : [];

  // YOUR CALL — calendar moves to approve, conflicts to settle.
  const decide: BriefLine[] = [];
  for (const p of input.proposals.filter((x) => x.status === 'proposed' && x.kind === 'move_event' && x.to)) {
    const target = p.targetId ? byId.get(p.targetId) : undefined;
    decide.push({ id: `decide:${p.id}`, section: 'decide', text: `Move ${short(target?.title ?? 'event')} → ${fmtRange(p.to!.start, p.to!.end).replace(/^(\w+) \w+ \d+,/, '$1')}`, note: `Because ${short(byId.get(p.itemId)?.title ?? 'a deadline')} moved`, itemId: p.itemId, proposalId: p.id, messageIds: p.messageIds, sources: ['gcal'] });
  }
  for (const i of input.items.filter((x) => isOpen(x) && x.status === 'needs_confirmation')) {
    const opts = (i.conflict?.options ?? []).map((o) => (typeof o.value === 'string' ? o.value : fmtDate(o.value.date ?? ''))).filter(Boolean);
    const ask = input.proposals.find((p) => p.itemId === i.id && p.kind === 'ask_staff' && p.status === 'proposed');
    decide.push({ id: `decide:${i.id}`, section: 'decide', text: `${short(i.title)}: ${[...new Set(opts)].sort().join(' or ')}?`, note: 'Staff disagree — Semora drafted a question', itemId: i.id, proposalId: ask?.id, messageIds: i.conflict?.options.map((o) => o.messageId) ?? [], sources: i.sources });
  }

  // HEADS-UP — the one opportunity worth a glance.
  const opp = input.items.filter((i) => isOpen(i) && i.kind === 'opportunity').sort((a, b) => atMs(a) - atMs(b))[0];
  const heads: BriefLine[] = opp ? [{ id: `heads:${opp.id}`, section: 'heads_up', text: `${short(opp.title)} — apply by ${fmtDate(opp.due?.date ?? '')}`, note: opp.title.split(' — ')[1], itemId: opp.id, messageIds: opp.evidence.map((e) => e.messageId), sources: opp.sources }] : [];

  // MONEY — at most one line: the two billing alerts that need attention most (failed payment, trial ending…).
  const money: BriefLine[] = [];
  const fin = input.finance;
  if (fin) {
    const top = fin.alerts.filter((a) => a.urgency >= ATTENTION && a.subscriptionId).slice(0, 2);
    if (top.length) {
      const rest = fin.summary.attention - top.length;
      money.push({
        id: 'money',
        section: 'money',
        text: top.map((a) => a.short).join(' · '),
        parts: top.map((a) => ({ itemId: a.subscriptionId!, text: a.short })),
        note: `~${fmtMoney(fin.summary.monthly, 'USD')}/mo in subscriptions (estimate)${rest > 0 ? ` · ${rest} more to check` : ''}`,
        messageIds: [...new Set(top.flatMap((a) => a.messageIds))],
        sources: ['gmail'],
      });
    }
  }

  // Budget: never longer, only "+N more". Drop the heads-up first, then money, then changes beyond two.
  let lines = [...changed, ...soon, ...decide, ...money, ...heads];
  let overflow = 0;
  while (lines.length > BRIEF_MAX_LINES) {
    const extraChange = lines.filter((l) => l.section === 'changed').length > 2 ? lines.filter((l) => l.section === 'changed').at(-1) : undefined;
    const drop = lines.find((l) => l.section === 'heads_up') ?? lines.find((l) => l.section === 'money') ?? extraChange ?? lines.at(-1)!;
    lines = lines.filter((l) => l !== drop);
    overflow++;
  }
  const covered = new Set(lines.flatMap((l) => [l.itemId, ...(l.parts?.map((p) => p.itemId) ?? [])]));
  const weekEnd = now + 7 * 86400_000;
  overflow += input.items.filter((i) => isOpen(i) && i.kind !== 'event' && i.kind !== 'office_hours' && !covered.has(i.id) && !folded.has(i.id) && i.at && Date.parse(i.at) > now && Date.parse(i.at) <= weekEnd).length;

  const nChanged = lines.filter((l) => l.section === 'changed').length;
  const nDecide = lines.filter((l) => l.section === 'decide').length;
  const hour = Number(toMoment(input.now).time?.slice(0, 2) ?? 9);
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${input.firstName}`;
  const headline = [nChanged ? `${nChanged} thing${nChanged > 1 ? 's' : ''} changed since yesterday` : 'Nothing changed since yesterday', nDecide ? `${nDecide} need${nDecide > 1 ? '' : 's'} your call` : ''].filter(Boolean).join(' · ');
  const wordCount = words(headline) + lines.reduce((n, l) => n + words(l.text) + words(l.note ?? ''), 0);
  const readSeconds = Math.max(15, Math.round(((wordCount / 250) * 60 + lines.length * 2.5) / 5) * 5);
  return { greeting, headline, lines, overflow, words: wordCount, readSeconds, since: new Date(since).toISOString() };
}

/** "Send 76-101 presentation slides to Sofia and Ethan" → "Slides to Sofia & Ethan". */
function promiseLabel(i: Item) {
  const m = short(i.title).match(/^Send (?:[\w-]+ )?(?:presentation )?(\w+) to (.+)$/);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} to ${m[2].replace(' and ', ' & ')}` : short(i.title);
}
