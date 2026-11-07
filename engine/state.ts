import { buildBrief } from './brief.ts';
import { reconcileFinance, type FinanceInput } from './finance.ts';
import { buildHealth } from './health.ts';
import { reconcile, type ReconcileInput } from './reconcile.ts';
import { fmtMoment } from './time.ts';
import type { Claim, SemoraState, Course, CourseGrades, EvidenceRole, GradeEntry, InboxCategory, Item, MessageView, SourceMessage } from './types.ts';
import { fmtValue } from './time.ts';

const CLUB = /scottylabs|robotics club|infinite motion|intramurals|discord|groupme|slack/i;
const ADMIN = /^(the hub|student affairs|housing services|office of financial aid|university registrar|cmu mail services|computing services|cmu transportation|dr\. karen holt)/i;

function firstSentence(body: string, max = 120) {
  const s = body.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function triage(msg: SourceMessage, items: Item[], money?: { verdict: string }): InboxCategory[] {
  if (msg.spam) return ['spam'];
  const cats: InboxCategory[] = [];
  if (money && money.verdict !== 'promo') cats.push('money');
  const linked = items.filter((i) => i.evidence.some((e) => e.messageId === msg.id));
  if (linked.some((i) => i.kind === 'opportunity')) cats.push('opportunities');
  if (msg.course && msg.channel !== 'grade') cats.push('courses');
  if (ADMIN.test(msg.authorName) || linked.some((i) => i.kind === 'task' || i.kind === 'reply')) cats.push('admin');
  if (CLUB.test(msg.authorName)) cats.push('clubs');
  if (!cats.length && linked.some((i) => i.course)) cats.push('courses');
  return cats.length ? cats : ['noise'];
}

const SAID_OLD: EvidenceRole[] = ['superseded', 'stale', 'outdated'];

/** One line about what this message said, in its own words: an old message keeps its old date. */
function summarize(msg: SourceMessage, items: Item[], claims: Claim[]): string {
  const linked = items.filter((i) => i.evidence.some((e) => e.messageId === msg.id));
  const item = linked.find((i) => i.kind !== 'event') ?? linked[0];
  if (item) {
    const ev = item.evidence.find((e) => e.messageId === msg.id)!;
    const own = claims.find((c) => c.subject === item.subject);
    const ownVal = own ? (own.fields.due ?? own.fields.start ?? own.fields.location) : undefined;
    if (SAID_OLD.includes(ev.role) && ownVal) return `Said ${item.title.split(' — ')[0]} ${item.due ? 'due' : 'is'} ${fmtValue(ownVal as never)} — ${ev.role === 'outdated' ? 'outdated' : 'since changed'}.`;
    const when = fmtMoment(item.due ?? item.start);
    if (item.kind === 'opportunity') return `${item.title} — apply by ${fmtMoment(item.due)}.`;
    if (item.kind === 'promise') return `You promised: ${item.title}.`;
    if (ev.role === 'question') return `Asks about ${item.title}; no change.`;
    if (ev.role === 'conflict' && ownVal) return `Says ${item.title.split(' — ')[0]} is due ${fmtValue(ownVal as never)} — disagrees with another staff source.`;
    if (ev.role === 'outdated') return `Repeats an old ${item.title} date (${when || 'earlier'}).`;
    if (item.status === 'canceled') return `${item.title} canceled.`;
    return `${item.title}${when ? ` — ${when}` : ''}${item.location ? ` · ${item.location}` : ''}.`;
  }
  if (msg.channel === 'grade') return firstSentence(msg.body);
  return firstSentence(msg.subject && msg.body.length > 160 ? `${msg.subject}. ${msg.body}` : msg.body);
}

export function buildGrades(messages: SourceMessage[], courses: Course[], now: string) {
  const entries: GradeEntry[] = messages
    .filter((m) => m.structured?.type === 'grade' && Date.parse(m.sentAt) <= Date.parse(now))
    .map((m) => {
      const g = m.structured as Extract<NonNullable<SourceMessage['structured']>, { type: 'grade' }>;
      return {
        id: m.id,
        course: m.course!,
        assignment: g.assignment,
        category: g.category,
        score: g.score,
        max: g.max,
        postedAt: m.sentAt,
        messageId: m.id,
        source: m.source,
        isNew: Date.parse(now) - Date.parse(m.sentAt) < 7 * 86400_000,
      };
    })
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  const courseGrades: CourseGrades[] = courses.map((c) => {
    const finalWeight = c.weights.find((w) => w.category === 'Final')?.weight ?? 0;
    const categories = c.weights
      .filter((w) => w.category !== 'Final')
      .map((w) => {
        const g = entries.filter((e) => e.course === c.code && e.category === w.category);
        return { category: w.category, weight: w.weight, average: g.length ? (g.reduce((s, e) => s + (e.score / e.max) * 100, 0) / g.length) : null, count: g.length };
      });
    const graded = categories.filter((x) => x.average !== null);
    const completedWeight = graded.reduce((s, x) => s + x.weight, 0);
    const current = completedWeight ? graded.reduce((s, x) => s + x.average! * x.weight, 0) / completedWeight : null;
    return { course: c.code, current, categories, finalWeight, completedWeight };
  });
  return { entries, courseGrades };
}

export interface StateInput extends ReconcileInput {
  /** Optional LLM claims for Money; each one is validated by rules before use. */
  financeClaimsFor?: FinanceInput['claimsFor'];
  version: number;
  demoMode: boolean;
  llm: SemoraState['llm'];
  connections: SemoraState['connections'];
  script: SemoraState['script'];
}

export function buildState(input: StateInput): SemoraState {
  const r = reconcile(input);
  const fin = reconcileFinance({ messages: input.messages, actions: input.actions, now: input.now, claimsFor: input.financeClaimsFor });
  const { entries, courseGrades } = buildGrades(input.messages, input.courses, input.now);
  const visible = input.messages.filter((m) => Date.parse(m.sentAt) <= Date.parse(input.now) && !m.spam && m.channel !== 'grade' && m.channel !== 'calendar' && m.channel !== 'assignment' && m.channel !== 'syllabus');
  const messages: MessageView[] = input.messages
    .filter((m) => Date.parse(m.sentAt) <= Date.parse(input.now))
    .map((m) => ({
      id: m.id,
      source: m.source,
      channel: m.channel,
      url: m.url,
      course: m.course,
      authorName: m.authorName === 'Anonymous student' ? `${m.source === 'ed' ? 'Ed' : 'Piazza'} student` : m.authorName,
      authorEmail: m.authorEmail,
      authorRole: m.authorRole,
      to: m.to,
      sentAt: m.sentAt,
      subject: m.subject,
      excerpt: m.body.replace(/\s+/g, ' ').slice(0, 240),
      pinned: m.pinned,
      attachments: m.attachments,
      categories: triage(m, r.items, fin.byMessage.get(m.id)),
      summary: r.items.some((i) => i.evidence.some((e) => e.messageId === m.id)) || !fin.byMessage.has(m.id) ? summarize(m, r.items, r.claims.get(m.id) ?? []) : fin.byMessage.get(m.id)!.summary,
      subscriptionIds: fin.byMessage.get(m.id)?.subscriptionIds.length ? fin.byMessage.get(m.id)!.subscriptionIds : undefined,
      sizeBytes: m.sizeBytes,
      hasAttachment: m.hasAttachment || Boolean(m.attachments?.length) || undefined,
      spam: m.spam,
      suspicious: fin.byMessage.get(m.id)?.verdict === 'suspicious' || undefined,
      evidenceRole: r.items.find((i) => i.evidence.some((e) => e.messageId === m.id))?.evidence.find((e) => e.messageId === m.id)?.role,
      itemIds: r.items.filter((i) => i.evidence.some((e) => e.messageId === m.id)).map((i) => i.id),
      live: m.live,
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const actionable = r.items.filter((i) => i.kind !== 'event' && i.status !== 'dismissed');
  const deduped = r.items.reduce((n, i) => n + Math.max(0, i.evidence.filter((e) => ['winner', 'supports', 'superseded', 'stale'].includes(e.role)).length - 1), 0);
  return {
    version: input.version,
    now: input.now,
    demoMode: input.demoMode,
    llm: input.llm,
    student: input.student,
    courses: input.courses,
    items: r.items,
    changes: r.changes,
    proposals: r.proposals,
    messages,
    grades: entries,
    courseGrades,
    connections: input.connections,
    stats: { messagesIn: visible.length, needToKnow: actionable.length, deduped },
    script: input.script,
    brief: buildBrief({ now: input.now, firstName: input.student.name.split(' ')[0], items: r.items, changes: r.changes, proposals: r.proposals, messages, finance: fin.state }),
    finance: fin.state,
    health: buildHealth({ now: input.now, messages, items: r.items, finance: fin.state, actions: input.actions }),
  };
}
