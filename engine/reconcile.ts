import { extractRequest, extractRules, type ExtractContext } from './extract-rules.ts';
import { addDays, compareMoment, fmtDate, fmtTime, fmtValue, isoAt, localDate, localTime, mergeMoment, momentToISO, toMoment, weekdayOf } from './time.ts';
import type {
  Change,
  Claim,
  Course,
  Evidence,
  EvidenceRole,
  FieldName,
  Item,
  LocalMoment,
  Platform,
  Proposal,
  Role,
  SourceMessage,
  Student,
  UserAction,
} from './types.ts';

// The reconciliation engine: a pure function from (messages, user actions, now) to the one correct,
// evidence-backed list of things the student needs to know. Rules own authority, scope and date math;
// an LLM may supply claims (extraction) but never decides who wins.

export interface ReconcileInput {
  messages: SourceMessage[];
  actions: UserAction[];
  now: string;
  student: Student;
  courses: Course[];
  directory: Record<string, { name: string; role: Role; course?: string; section?: string }>;
  /** Optional LLM-extracted claims. Return undefined to fall back to the rule extractor. */
  claimsFor?: (msg: SourceMessage, ctx: ExtractContext) => Claim[] | undefined;
}

export interface ReconcileResult {
  items: Item[];
  changes: Change[];
  proposals: Proposal[];
  claims: Map<string, Claim[]>;
}

const RANK: Record<Role, number> = { instructor: 4, ta: 3, staff: 3, system: 2, self: 2, student: 1, external: 1 };
const FIELDS: FieldName[] = ['due', 'start', 'end', 'location', 'status'];
const PLATFORM: Record<Platform, string> = { canvas: 'Canvas', gmail: 'Gmail', gcal: 'Google Calendar', gradescope: 'Gradescope', piazza: 'Piazza', ed: 'Ed' };
const ROLE_LABEL: Record<Role, string> = { instructor: 'instructor', ta: 'TA', staff: 'course staff', system: 'system record', student: 'student', self: 'you', external: 'sender' };

/** Authority: instructors and TAs outrank students repeating information. A syllabus is written by staff. */
export function authority(m: SourceMessage): number {
  return m.channel === 'syllabus' ? 3 : RANK[m.authorRole];
}

export function shortName(name: string): string {
  const m = name.match(/^(Prof\.|Dr\.)\s+(?:.+\s)?(\S+)$/);
  return m ? `${m[1]} ${m[2]}` : name;
}

type Val = LocalMoment | string;

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function agree(f: FieldName, a: Val, b: Val): boolean {
  if (f === 'location' || f === 'status') return norm(String(a)) === norm(String(b));
  return compareMoment(a as LocalMoment, b as LocalMoment);
}

interface Cl {
  claim: Claim;
  msg: SourceMessage;
  auth: number;
  inScope: boolean;
  order: number;
}

function inScope(c: Claim, section: string) {
  if (!c.scope) return true;
  if (c.scope.only) return c.scope.only.includes(section);
  if (c.scope.except) return !c.scope.except.includes(section);
  return true;
}

function scopeText(c: Claim) {
  if (c.scope?.only) return `Section ${c.scope.only.join(', ')}`;
  if (c.scope?.except) return `all sections except ${c.scope.except.join(', ')}`;
  return 'everyone';
}

const PRIORITY: Record<EvidenceRole, number> = { winner: 9, conflict: 8, completion: 7, outdated: 6, stale: 6, superseded: 5, supports: 4, question: 3, other_section: 2, origin: 1 };

interface FinalField {
  value: Val;
  cl: Cl;
}

function resolveGroup(key: string, cls: Cl[], student: Student, changes: Change[], now: string): Item | undefined {
  cls.sort((a, b) => a.msg.sentAt.localeCompare(b.msg.sentAt) || a.order - b.order);
  const resolvable = (c: Cl) => c.inScope && (c.claim.intent === 'statement' || c.claim.intent === 'promise');
  if (!cls.some((c) => resolvable(c) && (Object.keys(c.claim.fields).length > 0 || c.claim.intent === 'promise'))) return undefined;

  const final: Partial<Record<FieldName, FinalField>> = {};
  const conflicts: { field: FieldName; options: { value: Val; cl: Cl }[] }[] = [];
  const groupChanges: Change[] = [];
  const idsUpTo = (c: Cl) => {
    const ids: string[] = [];
    for (const x of cls) {
      if (resolvable(x) && !ids.includes(x.msg.id)) ids.push(x.msg.id);
      if (x === c) break;
    }
    return ids;
  };
  const mkChange = (type: Change['type'], field: FieldName | undefined, from: Val | undefined, to: Val | undefined, c: Cl, reason: string): Change => ({
    id: `chg:${key}:${field ?? type}:${c.msg.id}`,
    itemId: `item:${key}`,
    type,
    field,
    from,
    to,
    at: c.msg.sentAt,
    byName: c.msg.authorName,
    byRole: c.msg.authorRole,
    source: c.msg.source,
    course: c.claim.course,
    scopeNote: c.claim.scope?.only?.includes(student.section) ? `Applies to Section ${student.section} (your section)` : undefined,
    messageIds: idsUpTo(c),
    reason,
    live: c.msg.live,
  });

  for (const field of FIELDS) {
    let W: FinalField | undefined;
    let K: { value: Val; cl: Cl }[] = [];
    for (const c of cls) {
      if (!resolvable(c)) continue;
      const raw = c.claim.fields[field] as Val | undefined;
      if (raw === undefined) continue;
      if (!W) {
        W = { value: field === 'location' || field === 'status' ? raw : mergeMoment(undefined, raw as LocalMoment), cl: c };
        continue;
      }
      if (agree(field, raw, W.value)) {
        if (K.length && c.auth > Math.max(...K.map((k) => k.cl.auth))) {
          const val: Val = typeof W.value === 'string' ? W.value : mergeMoment(W.value, raw as LocalMoment);
          groupChanges.push(mkChange('resolved', field, 'Needs confirmation', val, c, `${shortName(c.msg.authorName)} (${ROLE_LABEL[c.msg.authorRole]}) settled a disagreement between equally authoritative sources`));
          W = { value: val, cl: c };
          K = [];
        } else if (typeof W.value !== 'string') W.value = mergeMoment(W.value, raw as LocalMoment);
        continue;
      }
      const higher = c.auth > W.cl.auth;
      const equal = c.auth === W.cl.auth;
      const sameAuthor = c.msg.authorName === W.cl.msg.authorName;
      if (higher || (equal && (c.claim.correction || sameAuthor))) {
        const next: Val = typeof raw === 'string' ? raw : mergeMoment(W.value as LocalMoment, raw as LocalMoment);
        const resolvedConflict = K.length > 0;
        const type: Change['type'] = resolvedConflict ? 'resolved' : field === 'due' ? 'due' : field === 'location' ? 'location' : field === 'status' && next === 'canceled' ? 'canceled' : 'time';
        const reason = resolvedConflict
          ? `${shortName(c.msg.authorName)} (${ROLE_LABEL[c.msg.authorRole]}) settled a disagreement between equally authoritative sources`
          : higher
            ? `${shortName(c.msg.authorName)} (${ROLE_LABEL[c.msg.authorRole]}) outranks ${shortName(W.cl.msg.authorName)} (${ROLE_LABEL[W.cl.msg.authorRole]})`
            : `${shortName(c.msg.authorName)} explicitly corrected the earlier ${field === 'location' ? 'room' : 'date'}`;
        groupChanges.push(mkChange(type, field, resolvedConflict ? 'Needs confirmation' : W.value, next, c, reason));
        W = { value: next, cl: c };
        K = [];
      } else if (equal) {
        K.push({ value: raw, cl: c });
      }
      // lower authority and disagreeing: ignored here, classified as outdated/stale afterwards
    }
    if (W) final[field] = W;
    if (W && K.length) conflicts.push({ field, options: [{ value: W.value, cl: W.cl }, ...K] });
  }

  const conflict = conflicts[0];
  const events = cls.filter(resolvable);
  const lead = events[0];

  // Evidence: one entry per message, strongest role wins.
  const ev = new Map<string, Evidence>();
  const put = (id: string, role: EvidenceRole, note: string, quote: string) => {
    const cur = ev.get(id);
    if (!cur || PRIORITY[role] > PRIORITY[cur.role]) ev.set(id, { messageId: id, role, note, quote });
  };
  const conflictSet = new Set(conflict?.options.map((o) => o.cl));
  for (const c of cls) {
    const m = c.msg;
    const who = shortName(m.authorName);
    if (c.claim.intent === 'question' || c.claim.intent === 'proposal') {
      put(m.id, 'question', `${who} asked — a question doesn't change anything`, c.claim.quote);
      continue;
    }
    if (!c.inScope) {
      put(m.id, 'other_section', `Applies to ${scopeText(c.claim)} — not your section (${student.section})`, c.claim.quote);
      continue;
    }
    if (c.claim.intent === 'fulfillment') continue;
    const fields = FIELDS.filter((f) => c.claim.fields[f] !== undefined);
    const wins = fields.find((f) => final[f]?.cl === c);
    if (conflictSet.has(c)) {
      const others = conflict!.options.filter((o) => o.cl !== c).map((o) => `${shortName(o.cl.msg.authorName)}`);
      put(m.id, 'conflict', `${who} says ${fmtValue(c.claim.fields[conflict!.field] as Val)} — disagrees with ${others.join(', ')}`, c.claim.quote);
      continue;
    }
    const bad = fields.find((f) => final[f] && !agree(f, c.claim.fields[f] as Val, final[f]!.value));
    if (!bad) {
      if (wins) {
        const scoped = c.claim.scope?.only?.includes(student.section) ? ` · applies to Section ${student.section} (your section)` : '';
        put(m.id, 'winner', `${who} · ${ROLE_LABEL[m.authorRole]}${scoped}`, c.claim.quote);
      } else put(m.id, 'supports', 'Agrees with the current value', c.claim.quote);
      continue;
    }
    const winner = final[bad]!;
    const winnerWho = shortName(winner.cl.msg.authorName);
    const said = fmtValue(c.claim.fields[bad] as Val);
    if (m.authorRole === 'student' || m.authorRole === 'external') put(m.id, 'outdated', `Outdated — superseded by ${winnerWho}'s correction`, c.claim.quote);
    else if (c.auth <= 2) put(m.id, 'stale', `Still shows ${said} — replaced by ${winnerWho}'s ${PLATFORM[winner.cl.msg.source]} update`, c.claim.quote);
    else put(m.id, 'superseded', `Said ${said} — replaced by ${winnerWho} on ${PLATFORM[winner.cl.msg.source]}`, c.claim.quote);
  }

  const evidence = [...ev.values()].sort((a, b) => (cls.find((c) => c.msg.id === a.messageId)!.msg.sentAt).localeCompare(cls.find((c) => c.msg.id === b.messageId)!.msg.sentAt));
  const resolved: Item['resolved'] = {};
  for (const f of FIELDS) {
    const r = final[f];
    if (r) resolved[f] = { value: r.value, messageId: r.cl.msg.id, reason: `${shortName(r.cl.msg.authorName)} (${ROLE_LABEL[r.cl.msg.authorRole]})` };
  }

  // A genuine conflict shows the conservative (earlier) option, flagged as needing confirmation.
  let due = final.due?.value as LocalMoment | undefined;
  let start = final.start?.value as LocalMoment | undefined;
  if (conflict && (conflict.field === 'due' || conflict.field === 'start')) {
    const earliest = [...conflict.options].sort((a, b) => (momentToISO(a.value as LocalMoment) ?? '').localeCompare(momentToISO(b.value as LocalMoment) ?? ''))[0];
    if (conflict.field === 'due') due = earliest.value as LocalMoment;
    else start = earliest.value as LocalMoment;
  }

  const titles = events.map((c) => c.claim.title).sort((a, b) => b.length - a.length);
  const winnerClaim = final.due?.cl ?? final.start?.cl ?? lead;
  const scoped = winnerClaim.claim.scope?.only?.includes(student.section);
  const reason = conflict
    ? `${conflict.options.map((o) => shortName(o.cl.msg.authorName)).join(' and ')} have equal authority and disagree — Semora won't guess.`
    : groupChanges.length
      ? `${shortName(winnerClaim.msg.authorName)} (${ROLE_LABEL[winnerClaim.msg.authorRole]}) is the highest-authority in-scope source${scoped ? ` and this applies to your section (${student.section})` : ''}. Newer alone isn't enough.`
      : `Stated by ${shortName(lead.msg.authorName)} (${ROLE_LABEL[lead.msg.authorRole]}).`;

  const status: Item['status'] = final.status?.value === 'canceled' ? 'canceled' : conflict ? 'needs_confirmation' : 'active';
  const kind = lead.claim.kind;
  if (kind === 'office_hours' && lead.claim.extractor !== 'structured') {
    groupChanges.unshift(mkChange('added', 'start', undefined, final.start?.value, lead, `${shortName(lead.msg.authorName)} added office hours`));
  }
  changes.push(...groupChanges);

  const people = events.find((c) => c.claim.people)?.claim.people;
  const item: Item = {
    id: `item:${key}`,
    course: lead.claim.course,
    subject: lead.claim.subject,
    kind,
    title: titles[0] ?? lead.claim.title,
    due,
    start,
    end: final.end?.value as LocalMoment | undefined,
    location: final.location?.value as string | undefined,
    status,
    resolved,
    evidence,
    sources: [...new Set(evidence.map((e) => cls.find((c) => c.msg.id === e.messageId)!.msg.source))],
    changeIds: groupChanges.map((c) => c.id),
    people,
    scopeNote: scoped ? `Applies to Section ${student.section} (your section)` : undefined,
    reason,
    related: events.find((c) => c.claim.related)?.claim.related,
    eventId: lead.msg.structured?.type === 'calendar' ? lead.msg.structured.eventId : undefined,
    createdAt: lead.msg.sentAt,
    updatedAt: cls[cls.length - 1].msg.sentAt,
    detail: kind === 'opportunity' || kind === 'task' ? lead.claim.quote : undefined,
  };
  if (conflict) {
    item.conflict = {
      field: conflict.field,
      options: conflict.options.map((o) => ({ value: o.value, messageId: o.cl.msg.id, authorName: o.cl.msg.authorName, authorRole: o.cl.msg.authorRole, source: o.cl.msg.source })),
    };
  }
  const iso = momentToISO(item.due) ?? momentToISO(item.start, undefined, '09:00');
  void now;
  item.at = iso;
  // A genuine conflict never shows a guessed value: the candidates live in item.conflict.
  if (conflict?.field === 'due') item.due = undefined;
  if (conflict?.field === 'start') item.start = undefined;
  return item;
}

function firstFree(duration: number, beforeDate: string, busy: [number, number][], nowMs: number): { start: string; end: string } | undefined {
  for (let k = 1; k <= 6; k++) {
    const day = addDays(beforeDate, -k);
    for (const t of ['14:00', '10:00', '16:00', '19:00']) {
      const s = Date.parse(isoAt(day, t));
      const e = s + duration;
      if (s < nowMs) continue;
      if (busy.some(([bs, be]) => s < be && e > bs)) continue;
      return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
    }
  }
  return undefined;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (iso: string) => DAY_NAMES[weekdayOf(localDate(iso))];
const dayPart = (iso: string) => {
  const h = Number(localTime(iso).slice(0, 2));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};
const compact = (t: string) => fmtTime(t).replace(' ', '').toLowerCase().replace(':00', '');

export function reconcile(input: ReconcileInput): ReconcileResult {
  const { student, now } = input;
  const nowMs = Date.parse(now);
  const messages = input.messages.filter((m) => Date.parse(m.sentAt) <= nowMs && !m.spam).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const byId = new Map(messages.map((m) => [m.id, m]));
  const ctx: ExtractContext = {
    courses: input.courses.map((c) => c.code),
    studentEmail: student.email,
    directory: input.directory,
    byId: (id) => byId.get(id),
  };

  const claims = new Map<string, Claim[]>();
  const all: Cl[] = [];
  let order = 0;
  for (const msg of messages) {
    const mine = input.claimsFor?.(msg, ctx) ?? extractRules(msg, ctx);
    const req = extractRequest(msg, ctx);
    if (req) mine.push(req);
    claims.set(msg.id, mine);
    for (const claim of mine) all.push({ claim, msg, auth: authority(msg), inScope: inScope(claim, student.section), order: order++ });
  }

  // Match: bind each claim to a (course, subject) entity. Course-less claims borrow the author's course.
  const subjectCourses = new Map<string, Set<string>>();
  for (const c of all) if (c.claim.course) (subjectCourses.get(c.claim.subject) ?? subjectCourses.set(c.claim.subject, new Set()).get(c.claim.subject)!).add(c.claim.course);
  const groups = new Map<string, Cl[]>();
  const fulfillments: Cl[] = [];
  const unmatched: Cl[] = [];
  for (const c of all) {
    if (c.claim.intent === 'fulfillment') {
      fulfillments.push(c);
      continue;
    }
    const local = /^(event|promise|task|opportunity|reply|oh):?/.test(c.claim.subject);
    let course = c.claim.course;
    if (!course && !local) {
      const authorCourse = c.msg.authorEmail ? input.directory[c.msg.authorEmail]?.course : undefined;
      const known = subjectCourses.get(c.claim.subject);
      course = authorCourse && known?.has(authorCourse) ? authorCourse : known?.size === 1 ? [...known][0] : undefined;
      if (!course) {
        unmatched.push(c);
        continue;
      }
      c.claim.course = course;
    }
    const key = `${course ?? 'x'}:${c.claim.subject}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  const changes: Change[] = [];
  const items: Item[] = [];
  for (const [key, cls] of groups) {
    const item = resolveGroup(key, cls, student, changes, now);
    if (item) items.push(item);
  }

  // Ambiguity is never silent: a claim that fits several courses (or none) becomes a visible question.
  for (const c of unmatched) {
    if (c.claim.intent !== 'statement' || !Object.keys(c.claim.fields).length || !c.inScope) continue;
    const cands = [...(subjectCourses.get(c.claim.subject) ?? [])].sort();
    const m = c.msg;
    const item: Item = {
      id: `item:?:${c.claim.subject}:${m.id}`, subject: c.claim.subject, kind: c.claim.kind, title: `${c.claim.title} — which course?`,
      due: c.claim.fields.due, start: c.claim.fields.start, location: c.claim.fields.location, status: 'needs_confirmation', resolved: {},
      evidence: [{ messageId: m.id, role: 'conflict', note: cands.length ? `Could be for ${cands.join(' or ')}` : 'No course could be inferred', quote: c.claim.quote }],
      sources: [m.source], changeIds: [],
      reason: cands.length ? `${shortName(m.authorName)} didn't say which course; ${cands.join(' and ')} both have a ${c.claim.title}. Semora won't guess.` : `${shortName(m.authorName)} didn't say which course this is for.`,
      createdAt: m.sentAt, updatedAt: m.sentAt,
    };
    item.at = momentToISO(item.due) ?? momentToISO(item.start, undefined, '09:00');
    items.push(item);
  }

  // Completion: a later sent message to the same people that delivers the promised object closes the promise.
  for (const item of items) {
    if (item.kind !== 'promise') continue;
    const promise = groups.get(item.id.slice(5))!.find((c) => c.claim.intent === 'promise')!;
    const done = fulfillments.find(
      (f) => f.msg.sentAt > promise.msg.sentAt && f.claim.people?.some((p) => promise.claim.people?.includes(p)) && f.claim.object && f.claim.object === promise.claim.object,
    );
    if (done) {
      item.status = 'done';
      item.completedAt = done.msg.sentAt;
      item.completedBy = 'evidence';
      item.evidence.push({ messageId: done.msg.id, role: 'completion', note: done.msg.attachments?.length ? `Sent with attachment “${done.msg.attachments[0]}”` : 'You sent it', quote: done.claim.quote });
      changes.push({
        id: `chg:${item.id}:done`,
        itemId: item.id,
        type: 'completed',
        at: done.msg.sentAt,
        byName: done.msg.authorName,
        byRole: done.msg.authorRole,
        source: done.msg.source,
        course: item.course,
        messageIds: [promise.msg.id, done.msg.id],
        reason: 'Evidence in your sent mail',
        live: done.msg.live,
      });
    }
  }

  const proposals = cascade(items, changes, input, nowMs);
  applyActions(items, changes, proposals, input.actions, now);
  items.sort((a, b) => (a.at ?? '9').localeCompare(b.at ?? '9') || a.title.localeCompare(b.title));
  changes.sort((a, b) => b.at.localeCompare(a.at));
  return { items, changes, proposals, claims };
}

/** Cascade: when something changes, propose (never perform) what depends on it. */
function cascade(items: Item[], changes: Change[], input: ReconcileInput, nowMs: number): Proposal[] {
  const proposals: Proposal[] = [];
  const busyOf = (skip: string): [number, number][] =>
    items
      .filter((i) => i.id !== skip && i.status !== 'canceled' && i.start?.date && i.start.time)
      .map((i) => {
        const s = Date.parse(momentToISO(i.start)!);
        return [s, i.end?.date && i.end.time ? Date.parse(momentToISO(i.end)!) : s + 3600_000] as [number, number];
      });

  for (const ev of items.filter((i) => i.kind === 'event' && i.related)) {
    const src = items.find((i) => i.subject === ev.related && i.kind !== 'event' && i.changeIds.some((id) => changes.find((c) => c.id === id)?.type === 'due'));
    if (!src || !ev.start?.date || !ev.start.time || !ev.end?.time || !src.due?.date) continue;
    const change = changes.find((c) => src.changeIds.includes(c.id) && c.type === 'due')!;
    const evStart = momentToISO(ev.start)!;
    const evEnd = momentToISO(ev.end.date ? ev.end : { date: ev.start.date, time: ev.end.time })!;
    const slot = firstFree(Date.parse(evEnd) - Date.parse(evStart), src.due.date, busyOf(ev.id), nowMs);
    if (!slot) continue;
    const scoped = src.scopeNote ? ` for Section ${input.student.section}` : '';
    const title = src.title.split(' — ')[0];
    const platform = PLATFORM[change.source];
    const pinned = input.messages.find((m) => m.id === change.messageIds.at(-1))?.pinned;
    const others = (ev.people ?? []).filter((p) => p !== input.student.name);
    const emails = others.map((n) => Object.entries(input.directory).find(([, v]) => v.name === n)?.[0] ?? n);
    const newDue = src.due;
    proposals.push({
      id: `prop:move:${ev.id}`,
      kind: 'move_event',
      itemId: src.id,
      targetId: ev.id,
      title: `Move “${ev.title}” to ${dayName(slot.start)} ${dayPart(slot.start)}`,
      detail: `${title} moved to ${fmtValue(newDue)}. Your session is ${fmtDate(ev.start.date)} — the first free slot before the new deadline is ${fmtDate(localDate(slot.start))}, ${fmtTime(localTime(slot.start))}–${fmtTime(localTime(slot.end))}.`,
      reason: `Triggered by the ${title} deadline change (${change.byName}, ${platform}). Slot found by checking your calendar.`,
      from: { start: evStart, end: evEnd },
      to: slot,
      status: 'proposed',
      requires: 'calendar.write',
      messageIds: change.messageIds,
    });
    if (others.length) {
      proposals.push({
        id: `prop:draft:${ev.id}`,
        kind: 'draft_message',
        itemId: src.id,
        targetId: ev.id,
        title: `Tell ${others.map((n) => n.split(' ')[0]).join(' and ')} about the new date`,
        detail: `A draft to ${others.join(', ')} — nothing is sent until you approve.`,
        reason: `${others.join(', ')} ${others.length > 1 ? 'are' : 'is'} on the ${ev.title} invite.`,
        recipients: emails,
        body: `Heads up — ${shortName(change.byName)} extended ${title} to ${dayName(momentToISO(newDue)!)} ${compact(newDue.time ?? '23:59')}${scoped} (${pinned ? 'pinned on ' : 'posted on '}${platform}). Want to move our ${dayName(evStart)} session to ${dayName(slot.start)} ${dayPart(slot.start)}?`,
        status: 'proposed',
        requires: 'gmail.compose',
        messageIds: change.messageIds,
      });
    }
  }

  for (const item of items.filter((i) => i.status === 'needs_confirmation' && i.conflict)) {
    const [a, ...rest] = item.conflict!.options;
    const asked = rest.find((o) => o.authorRole === 'ta' || o.authorRole === 'instructor') ?? rest[0];
    const askedMsg = input.messages.find((m) => m.id === asked.messageId);
    const first = asked.authorName.split(' ')[0];
    const other = a.authorRole === 'system' ? 'the syllabus' : shortName(a.authorName);
    proposals.push({
      id: `prop:ask:${item.id}`,
      kind: 'ask_staff',
      itemId: item.id,
      title: `Ask ${first} which date is right`,
      detail: `${item.title}: ${other} says ${fmtValue(a.value)}; ${shortName(asked.authorName)} says ${fmtValue(asked.value)}.`,
      reason: 'Two staff sources disagree and neither outranks the other.',
      recipients: askedMsg?.authorEmail ? [askedMsg.authorEmail] : [],
      body: `Hi ${first} — quick check on ${item.title.toLowerCase()}: ${other === 'the syllabus' ? 'the syllabus' : other} says ${fmtValue(a.value)}, but your reminder said ${fmtValue(asked.value)}. Which one should I go by? Thanks!`,
      status: 'proposed',
      requires: 'gmail.compose',
      messageIds: item.conflict!.options.map((o) => o.messageId),
    });
  }
  return proposals;
}

function applyActions(items: Item[], changes: Change[], proposals: Proposal[], actions: UserAction[], now: string) {
  for (const a of [...actions].sort((x, y) => x.at.localeCompare(y.at))) {
    const item = items.find((i) => i.id === a.targetId);
    const prop = proposals.find((p) => p.id === a.targetId);
    if (item) {
      if (a.type === 'done' && item.status !== 'done') {
        item.status = 'done';
        item.completedAt = a.at;
        item.completedBy = 'user';
      } else if (a.type === 'undo_done' && item.status === 'done') {
        item.status = 'active';
        item.completedAt = undefined;
        item.completedBy = undefined;
      } else if (a.type === 'dismiss') item.status = 'dismissed';
      else if (a.type === 'confirm') item.confirmed = true;
      else if (a.type === 'choose' && item.conflict) {
        const opt = item.conflict.options.find((o) => o.messageId === a.value);
        if (opt) {
          if (item.conflict.field === 'due') item.due = opt.value as LocalMoment;
          item.status = 'active';
          item.reason = `You confirmed ${shortName(opt.authorName)}'s date.`;
          item.at = momentToISO(item.due) ?? item.at;
          changes.push({
            id: `chg:${item.id}:chosen`, itemId: item.id, type: 'resolved', field: item.conflict.field, from: 'Needs confirmation', to: opt.value, at: a.at,
            byName: 'You', byRole: 'self', source: opt.source, course: item.course, messageIds: item.conflict.options.map((o) => o.messageId), reason: 'Confirmed by you',
          });
          item.conflict = undefined;
        }
      }
    }
    if (prop) {
      if (a.type === 'approve' && prop.status === 'proposed') {
        prop.status = 'approved';
        if (prop.kind === 'move_event' && prop.targetId && prop.to) {
          const ev = items.find((i) => i.id === prop.targetId);
          if (ev) {
            ev.start = toMoment(prop.to.start);
            ev.end = toMoment(prop.to.end);
            ev.at = prop.to.start;
            ev.movedByUser = true;
          }
        }
      } else if (a.type === 'reject') prop.status = 'dismissed';
    }
  }
  void now;
}
