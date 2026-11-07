import { findCourse, findSubjects, type SubjectMatch } from './canon.ts';
import { addDays, localDate, monthIndex, nextWeekday, toMoment, weekdayIndex } from './time.ts';
import type { Claim, ClaimFields, Intent, ItemKind, LocalMoment, SectionScope, SourceMessage } from './types.ts';

// Deterministic extraction: turns one message into claims. It is the fallback when no LLM key is
// present, and it handles the structured feeds (calendar, assignments) even when the LLM is on.

export interface ExtractContext {
  courses: string[];
  studentEmail: string;
  directory: Record<string, { name: string }>;
  byId: (id: string) => SourceMessage | undefined;
}

const CORRECTION = /\b(moved|moving|instead of|extension|extended|clarif\w*|update[ds]?|rescheduled|changed|postponed|pushed|now due|correction|corrected|new (?:room|time|date|location))\b/i;
const CANCEL = /\b(?:is|are|has been|have been)\s+(?:canceled|cancelled)\b|\bcancel(?:l)?ing\b/i;
const QUESTION_START = /^(?:wait\b|so\b|hey\b|um+\b)?[\s,]*(could|can|would|should|will|is|are|does|do|did|has|have|any ?one|anybody)\b/i;
const PROPOSAL = /\b(could we|can we|how about|what if|would it be possible|maybe we could|should we)\b/i;

const BUILDINGS =
  'Gates Hillman Center|Gates|GHC|Wean Hall|Wean|WEH|Doherty Hall|Doherty|DH|Baker Hall|Baker|BH|Porter Hall|PH|Hamerschlag Hall|HH|Scaife Hall|SH|Posner Hall|Tepper|Newell-Simon Hall|NSH|Margaret Morrison|MM|Hunt Library|Cohon Center|CUC|Rashid Auditorium';
const LOCATION_RE = new RegExp(`\\b(?:${BUILDINGS})(?:\\s+(?:[A-Z]?\\d{3,4}[A-Z]?|\\d+(?:st|nd|rd|th) floor))?\\b`, 'g');

const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)('s|’s)?\b/gi;
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
const NUMERIC_RE = /\b(\d{1,2})\/(\d{1,2})\b/g;
const RELATIVE_RE = /\b(today|tonight|tomorrow)\b/gi;
const TIME_RANGE_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(noon|midnight)\b/gi;

interface FoundDate {
  date: string;
  index: number;
  end: number;
  explicit: boolean;
  possessive: boolean;
  noun?: string;
}

interface FoundTime {
  time: string;
  endTime?: string;
  index: number;
}

function to24(h: number, m: number, ampm?: string): string {
  let hh = h % 12;
  if (ampm?.toLowerCase() === 'pm') hh += 12;
  if (!ampm && h === 12) hh = 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Resolve "November 16" / "11/16" to the nearest such date around the message. */
function resolveMonthDay(month: number, day: number, sentDate: string): string {
  const year = Number(sentDate.slice(0, 4));
  const candidates = [year - 1, year, year + 1].map((y) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const sentMs = Date.parse(sentDate);
  return candidates.sort((a, b) => Math.abs(Date.parse(a) - sentMs) - Math.abs(Date.parse(b) - sentMs))[0];
}

export function parseDates(text: string, sentDate: string): FoundDate[] {
  const found: FoundDate[] = [];
  for (const m of text.matchAll(MONTH_RE)) {
    const mi = monthIndex(m[1]);
    if (mi < 0) continue;
    found.push({ date: resolveMonthDay(mi, Number(m[2]), sentDate), index: m.index!, end: m.index! + m[0].length, explicit: true, possessive: false });
  }
  for (const m of text.matchAll(NUMERIC_RE)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    found.push({ date: resolveMonthDay(mo - 1, d, sentDate), index: m.index!, end: m.index! + m[0].length, explicit: true, possessive: false });
  }
  for (const m of text.matchAll(RELATIVE_RE)) {
    const word = m[1].toLowerCase();
    found.push({ date: word === 'tomorrow' ? addDays(sentDate, 1) : sentDate, index: m.index!, end: m.index! + m[0].length, explicit: true, possessive: false });
  }
  for (const m of text.matchAll(WEEKDAY_RE)) {
    const idx = m.index!;
    const end = idx + m[0].length;
    // "Friday, November 13" / "Friday 11/13" / "today (Wednesday": the explicit date wins.
    const near = found.some((f) => f.explicit && ((f.index >= end && f.index - end <= 3) || (end > f.end - 0 && idx - f.end <= 3 && idx >= f.end)));
    if (near) continue;
    const possessive = Boolean(m[2]);
    const noun = possessive ? text.slice(end).match(/^\s+([A-Za-z-]+(?:\s+[A-Za-z-]+)?)/)?.[1] : undefined;
    found.push({ date: nextWeekday(sentDate, weekdayIndex(m[1])), index: idx, end, explicit: false, possessive, noun });
  }
  return found.sort((a, b) => a.index - b.index);
}

export function parseTimes(text: string): FoundTime[] {
  const out: FoundTime[] = [];
  const taken: [number, number][] = [];
  for (const m of text.matchAll(TIME_RANGE_RE)) {
    const endAmpm = m[6];
    const startAmpm = m[3] ?? endAmpm;
    out.push({ time: to24(Number(m[1]), Number(m[2] ?? 0), startAmpm), endTime: to24(Number(m[4]), Number(m[5] ?? 0), endAmpm), index: m.index! });
    taken.push([m.index!, m.index! + m[0].length]);
  }
  for (const m of text.matchAll(TIME_RE)) {
    if (taken.some(([s, e]) => m.index! >= s && m.index! < e)) continue;
    const time = m[4] ? (m[4].toLowerCase() === 'noon' ? '12:00' : '23:59') : to24(Number(m[1]), Number(m[2] ?? 0), m[3]);
    out.push({ time: time === '00:00' && m[1] === '12' && m[3]?.toLowerCase() === 'am' ? '23:59' : time, index: m.index! });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function parseLocations(text: string): string[] {
  return [...text.matchAll(LOCATION_RE)].map((m) => m[0]).filter((l) => !/^(?:DH|BH|PH|HH|SH|MM)$/.test(l));
}

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' \n ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ASSUMPTION = /\b(?:still|right|correct|yeah)\b[^.!]*\?+\s*$/i;

function intentOf(sentence: string): Intent {
  if (ASSUMPTION.test(sentence) && !QUESTION_START.test(sentence) && !PROPOSAL.test(sentence)) return 'statement';
  if (PROPOSAL.test(sentence)) return sentence.trim().endsWith('?') ? 'question' : 'proposal';
  if (sentence.trim().endsWith('?') || QUESTION_START.test(sentence)) return 'question';
  return 'statement';
}

function scopeOf(sentence: string, mentioned: Set<string>): SectionScope | undefined {
  const only = [...sentence.matchAll(/\b[Ss]ections?\s+([A-Z])(?:\s*(?:,|and|&)\s*([A-Z]))?\s+only\b|\bonly\s+(?:for\s+)?[Ss]ections?\s+([A-Z])\b/g)].flatMap((m) => [m[1], m[2], m[3]].filter(Boolean));
  if (only.length) {
    only.forEach((s) => mentioned.add(s));
    return { only };
  }
  if (/\ball other sections\b|\bother sections\b|\bevery(?:one|body) else\b/i.test(sentence) && mentioned.size) return { except: [...mentioned] };
  const forSection = [...sentence.matchAll(/\b(?:for|in)\s+section\s+([A-Z])\b|\bsection\s+([A-Z])\b/gi)].map((m) => (m[1] ?? m[2]).toUpperCase());
  if (forSection.length && intentOf(sentence) !== 'statement') return { only: forSection };
  return undefined;
}

/** The date in a sentence that belongs to the subject: explicit beats bare weekday, possessives never count. */
function pickDate(dates: FoundDate[]): FoundDate | undefined {
  const usable = dates.filter((d) => !d.possessive);
  const explicit = usable.filter((d) => d.explicit);
  return (explicit.length ? explicit : usable).at(-1);
}

function stripInsteadOf(sentence: string): string {
  return sentence.replace(/\binstead of\s+[^,.;!?]+/gi, ' ');
}

function isEventKind(kind: ItemKind) {
  return kind === 'exam' || kind === 'event' || kind === 'office_hours' || kind === 'presentation';
}

function firstName(full: string) {
  return full.replace(/^(?:Prof\.|Dr\.)\s+/, '').split(' ')[0];
}

function joinNames(names: string[]) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

let claimSeq = 0;
const cid = (msg: SourceMessage, n: number) => `${msg.id}#${n}`;

export function extractRules(msg: SourceMessage, ctx: ExtractContext): Claim[] {
  claimSeq = 0;
  if (msg.structured) return extractStructured(msg);
  if (msg.channel === 'sent' || msg.authorRole === 'self') return extractSent(msg, ctx);
  const claims: Claim[] = [];
  const course = msg.course ?? findCourse(msg.subject, ctx.courses);
  const fromPerson = msg.authorRole === 'student' || msg.authorRole === 'ta' || msg.authorRole === 'instructor' || msg.authorRole === 'staff';
  if (!course && !(msg.source === 'gmail' && fromPerson)) {
    return [...extractOpportunity(msg), ...extractAdminTask(msg)];
  }

  // Context subject: the subject line, else the post this replies to.
  const parent = msg.replyTo ? ctx.byId(msg.replyTo) : undefined;
  let context: SubjectMatch | undefined = findSubjects(msg.subject ?? '').find((s) => s.subject !== 'oh') ?? (parent ? findSubjects(parent.subject ?? parent.body)[0] : undefined);
  const sentDate = localDate(msg.sentAt);
  const mentionedSections = new Set<string>();
  let lastLocation: string | undefined;
  const raw: Claim[] = [];

  for (const sentence of sentences(msg.body)) {
    const subjects = findSubjects(sentence);
    const intent = intentOf(sentence);
    const clean = stripInsteadOf(sentence);
    const dates = parseDates(clean, sentDate);
    const times = parseTimes(clean);
    const locations = parseLocations(clean);
    const canceled = CANCEL.test(sentence) && !/\bwas (?:canceled|cancelled)\b/i.test(sentence);
    const scope = scopeOf(sentence, mentionedSections);
    const sameRoom = /\bsame (?:room|place|location)\b/i.test(sentence);
    const location = locations[0] ?? (sameRoom ? lastLocation : undefined);
    if (locations[0]) lastLocation = locations[0];

    const subject = subjects[0] ?? context;
    if (subjects[0] && subjects[0].subject !== 'oh') context = subjects[0];
    if (!subject) continue;

    const picked = pickDate(dates);
    const time = times[0];
    const fields: ClaimFields = {};
    if (isEventKind(subject.kind)) {
      if (picked || time) fields.start = { date: picked?.date, time: time?.time };
      if (time?.endTime) fields.end = { date: picked?.date, time: time.endTime };
      if (location) fields.location = location;
    } else if (picked || time) {
      fields.due = { date: picked?.date, time: time?.time };
    }
    if (canceled) fields.status = 'canceled';

    const hasFields = Object.keys(fields).length > 0;
    if (!hasFields && intent === 'statement') continue;

    let key = subject.subject;
    let title = subject.title;
    if (subject.subject === 'oh') {
      const date = fields.start?.date ?? sentDate;
      key = `oh:${date}`;
      title = `${subject.title} — ${msg.authorRole === 'instructor' ? msg.authorName : 'course staff'}`;
      if (!fields.start) fields.start = { date };
    }
    if (subject.subject === 'hw5' || /^hw\d+$/.test(subject.subject)) {
      const named = msg.body.match(/\((?<name>[A-Z][A-Za-z ,&]+)\)/)?.groups?.name;
      if (named) title = `${title} — ${named}`;
    }

    raw.push({
      id: cid(msg, claimSeq++),
      messageId: msg.id,
      subject: key,
      course,
      kind: subject.kind,
      title,
      intent,
      fields,
      scope,
      correction: CORRECTION.test(sentence) || /\bclarif/i.test(msg.subject ?? ''),
      quote: sentence,
      extractor: 'rules',
      confidence: 0.8,
    });
  }

  // Merge sentence-level claims about the same subject with the same scope and intent.
  for (const c of raw) {
    const prev = claims.find((p) => p.subject === c.subject && p.intent === c.intent && JSON.stringify(p.scope) === JSON.stringify(c.scope));
    if (!prev) {
      claims.push(c);
      continue;
    }
    prev.fields = mergeFields(prev.fields, c.fields);
    prev.correction ||= c.correction;
    prev.quote = `${prev.quote} ${c.quote}`;
    if (c.title.length > prev.title.length && c.subject === prev.subject) prev.title = c.title;
  }
  if (!claims.length && !course) return [...extractOpportunity(msg), ...extractAdminTask(msg)];
  return claims;
}

function mergeFields(a: ClaimFields, b: ClaimFields): ClaimFields {
  const merge = (x?: LocalMoment, y?: LocalMoment) => (x || y ? { date: x?.date ?? y?.date, time: x?.time ?? y?.time } : undefined);
  const out: ClaimFields = { ...a, ...b };
  const due = merge(a.due, b.due);
  const start = merge(a.start, b.start);
  const end = merge(a.end, b.end);
  if (due) out.due = due;
  if (start) out.start = start;
  if (end) out.end = end;
  out.location = a.location ?? b.location;
  return out;
}

function extractStructured(msg: SourceMessage): Claim[] {
  const s = msg.structured!;
  if (s.type === 'grade') return [];
  const subject = findSubjects(s.title)[0];
  if (s.type === 'assignment') {
    const key = subject?.subject ?? s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return [
      {
        id: cid(msg, 0),
        messageId: msg.id,
        subject: key,
        course: msg.course,
        kind: subject?.kind ?? 'assignment',
        title: s.title,
        intent: 'statement',
        fields: subject && isEventKind(subject.kind) ? { start: toMoment(s.due), location: s.location } : { due: toMoment(s.due), location: s.location },
        correction: false,
        quote: msg.body,
        extractor: 'structured',
        confidence: 1,
      },
    ];
  }
  // Calendar events: course events (exams, office hours) join the course item; personal events stay events.
  const isCourseEvent = Boolean(s.course ?? msg.course) && subject && subject.kind !== 'assignment';
  const startMoment = toMoment(s.start);
  const key = isCourseEvent ? (subject!.subject === 'oh' ? `oh:${startMoment.date}` : subject!.subject) : `event:${s.eventId}`;
  return [
    {
      id: cid(msg, 0),
      messageId: msg.id,
      subject: key,
      course: s.course ?? msg.course,
      kind: isCourseEvent ? subject!.kind : 'event',
      title: s.title,
      intent: 'statement',
      fields: { start: startMoment, end: toMoment(s.end), location: s.location, status: 'active' },
      correction: false,
      quote: msg.body,
      extractor: 'structured',
      confidence: 1,
      people: s.attendees,
      related: !isCourseEvent ? subject?.subject : undefined,
    },
  ];
}

const PROMISE_RE = /\bI(?:'|’)?(?:ll| will| am going to|'m going to)\s+(send|share|email|finish|bring|upload|submit|book|reserve|draft|write|make|put together|get|do)\s+([^.,;!?—]+)/i;
const FULFILL_RE = /\b(attached|here (?:are|is)|here's|sending (?:over )?the|just sent|i sent)\b/i;

function extractSent(msg: SourceMessage, ctx: ExtractContext): Claim[] {
  const claims: Claim[] = [];
  const sentDate = localDate(msg.sentAt);
  const recipients = (msg.to ?? []).filter((e) => e !== ctx.studentEmail);
  const names = recipients.map((e) => ctx.directory[e]?.name ?? e.split('@')[0]);
  const topic = (msg.subject ?? '').replace(/^(?:re|fwd?):\s*/i, '').trim();

  for (const sentence of sentences(msg.body)) {
    const p = sentence.match(PROMISE_RE);
    if (p && !msg.attachments?.length) {
      const verb = p[1];
      const rest = p[2];
      const dates = parseDates(rest + sentence.slice((p.index ?? 0) + p[0].length), sentDate);
      const due = dates.find((d) => !d.possessive);
      const object = rest
        .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tonight|tomorrow)\b.*$/i, '')
        .replace(/\b(?:our|my|the|your)\s+/gi, '')
        .trim();
      const objectWithTopic = topic && topic.split(' ').length <= 4 && !object.toLowerCase().includes(topic.toLowerCase()) ? `${topic} ${object}` : object;
      claims.push({
        id: cid(msg, claimSeq++),
        messageId: msg.id,
        subject: `promise:${msg.id}`,
        course: msg.course,
        kind: 'promise',
        title: `${verb[0].toUpperCase()}${verb.slice(1)} ${objectWithTopic} to ${joinNames(names.map(firstName))}`,
        intent: 'promise',
        fields: due ? { due: { date: due.date } } : {},
        correction: false,
        quote: sentence,
        extractor: 'rules',
        confidence: 0.8,
        people: recipients,
        object: object.split(' ').at(-1)?.toLowerCase(),
      });
    }
    // "before Friday's presentation" corroborates the event itself.
    for (const d of parseDates(sentence, sentDate)) {
      if (!d.possessive || !d.noun) continue;
      const subj = findSubjects(d.noun)[0];
      if (!subj || !msg.course) continue;
      claims.push({
        id: cid(msg, claimSeq++),
        messageId: msg.id,
        subject: subj.subject,
        course: msg.course,
        kind: subj.kind,
        title: subj.title,
        intent: 'statement',
        fields: { start: { date: d.date } },
        correction: false,
        quote: sentence,
        extractor: 'rules',
        confidence: 0.6,
      });
    }
    if (FULFILL_RE.test(sentence) || msg.attachments?.length) {
      const object = (msg.attachments?.join(' ') + ' ' + sentence).toLowerCase().match(/\b(slides|deck|draft|notes|schedule|report|essay|code|pptx)\b/)?.[1];
      if (!claims.some((c) => c.intent === 'fulfillment')) {
        claims.push({
          id: cid(msg, claimSeq++),
          messageId: msg.id,
          subject: `fulfillment:${msg.id}`,
          course: msg.course,
          kind: 'promise',
          title: sentence,
          intent: 'fulfillment',
          fields: {},
          correction: false,
          quote: sentence,
          extractor: 'rules',
          confidence: 0.8,
          people: recipients,
          object: object === 'pptx' || object === 'deck' ? 'slides' : object,
        });
      }
    }
  }
  return claims;
}

const OPPORTUNITY_RE = /\b(apply by|applications? (?:are )?due|deadline to apply|apply before)\b/i;

function extractOpportunity(msg: SourceMessage): Claim[] {
  const claims: Claim[] = [];
  const sentDate = localDate(msg.sentAt);
  for (const para of msg.body.split(/\n\s*\n/)) {
    if (!OPPORTUNITY_RE.test(para)) continue;
    const body = para.replace(/^[A-Z ]{4,}:\s*/, '');
    const head = body.split(':')[0];
    const wanted = head.match(/^(.+?)\s+wanted in (?:an?\s+)?(.+)$/i);
    const title = wanted ? `${wanted[1]} — ${wanted[2]}` : head.split(/[.!]/)[0].slice(0, 80);
    const applyClause = para.slice(para.search(OPPORTUNITY_RE));
    const due = pickDate(parseDates(applyClause, sentDate));
    claims.push({
      id: cid(msg, claimSeq++),
      messageId: msg.id,
      subject: `opportunity:${msg.id}:${claims.length}`,
      kind: 'opportunity',
      title: title.charAt(0).toUpperCase() + title.slice(1),
      intent: 'statement',
      fields: due ? { due: { date: due.date } } : {},
      correction: false,
      quote: body,
      extractor: 'rules',
      confidence: 0.7,
    });
  }
  return claims;
}

const TASK_RE = /\b(confirm|submit|complete|update|pay|sign|verify|register)\s+([^.;!?]+?)\s+by\s+([^.;!?]+)/i;

function extractAdminTask(msg: SourceMessage): Claim[] {
  if (msg.authorRole !== 'staff') return [];
  const m = msg.body.match(TASK_RE);
  if (!m) return [];
  const due = pickDate(parseDates(m[3], localDate(msg.sentAt)));
  if (!due) return [];
  const sentence = sentences(msg.body).find((s) => s.includes(m[0])) ?? m[0];
  return [
    {
      id: cid(msg, 0),
      messageId: msg.id,
      subject: `task:${msg.id}`,
      kind: 'task',
      title: `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}`,
      intent: 'statement',
      fields: { due: { date: due.date } },
      correction: false,
      quote: sentence,
      extractor: 'rules',
      confidence: 0.7,
    },
  ];
}

const REQUEST_RE = /\b(?:could|can|would) you\s+(send|share|confirm|forward|review|look at|let me know|reply|put together|take)\s*(?:me\s+)?([^?.!]*)/i;

/** Direct requests addressed to the student that they haven't answered yet. */
export function extractRequest(msg: SourceMessage, ctx: ExtractContext): Claim | undefined {
  if (msg.channel !== 'email' || !msg.to?.includes(ctx.studentEmail)) return undefined;
  if (!['student', 'ta', 'instructor', 'staff'].includes(msg.authorRole)) return undefined;
  const sentence = sentences(msg.body).find((s) => REQUEST_RE.test(s));
  if (!sentence) return undefined;
  const m = sentence.match(REQUEST_RE)!;
  const tail = m[2].trim();
  const cut = tail.search(/\s+(?:before|by|on)\s+/);
  const object = (cut >= 0 ? tail.slice(0, cut) : tail).replace(/\s+since\s+.*$/, '');
  const due = pickDate(parseDates(cut >= 0 ? tail.slice(cut) : sentence, localDate(msg.sentAt)));
  const verb = m[1][0].toUpperCase() + m[1].slice(1);
  return {
    id: `${msg.id}#req`,
    messageId: msg.id,
    subject: `reply:${msg.id}`,
    course: msg.course,
    kind: 'reply',
    title: object ? `${verb} ${object} to ${msg.authorName.replace(/^Dr\.\s+\w+\s+/, 'Dr. ')}` : `Reply to ${msg.authorName}`,
    intent: 'statement',
    fields: due ? { due: { date: due.date } } : {},
    correction: false,
    quote: sentence,
    extractor: 'rules',
    confidence: 0.7,
    people: msg.authorEmail ? [msg.authorEmail] : [],
  };
}
