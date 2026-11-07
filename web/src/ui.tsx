import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { addDays, fmtDate, fmtMoment, fmtRange, fmtTime, fmtValue, localDate, weekStart, weekdayOf } from '../../engine/time';
import type { Change, SemoraState, EvidenceRole, Item, MessageView, Platform, Proposal } from '../../engine/types';
import { useSemora } from './store';

/* ---------- Glyphs (original marks, not brand logos) ---------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const GLYPH: Record<string, ReactNode> = {
  canvas: <><circle cx="9" cy="9" r="5.2" {...P} /><circle cx="9" cy="9" r="1.8" {...P} /></>,
  gmail: <><rect x="3" y="4.5" width="12" height="9" rx="2" {...P} /><path d="M3.8 5.6 9 9.8l5.2-4.2" {...P} /></>,
  gcal: <><rect x="3.2" y="4" width="11.6" height="10.4" rx="2" {...P} /><path d="M3.4 7.6h11.2M6.6 2.8v2.4M11.4 2.8v2.4" {...P} /></>,
  gradescope: <><path d="M4 13.6V9.2M7.4 13.6V5.4M10.8 13.6v-6M14.2 13.6V3.8" {...P} /></>,
  piazza: <><path d="M4 5.2c0-1 .8-1.8 1.8-1.8h6.4c1 0 1.8.8 1.8 1.8v4.4c0 1-.8 1.8-1.8 1.8H8.6L5.6 14v-2.6h-.2C4.6 11.4 4 10.6 4 9.6Z" {...P} /></>,
  ed: <><circle cx="9" cy="9" r="5.4" {...P} /><path d="M6.6 9h4.4c0-1.4-1-2.2-2.2-2.2S6.6 7.8 6.6 9s1 2.2 2.2 2.2c.7 0 1.3-.3 1.7-.8" {...P} /></>,
  openrouter: <><path d="M4 9h3.5c1.6 0 1.4-3.6 3.2-3.6H14M4 9h3.5c1.6 0 1.4 3.6 3.2 3.6H14" {...P} /></>,
};
export function SourceBadge({ source, title }: { source: Platform | 'openrouter' | 'demo'; title?: string }) {
  return (
    <span className="badge" title={title ?? LABEL[source as Platform] ?? source} aria-label={title ?? LABEL[source as Platform] ?? source}>
      <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">{GLYPH[source] ?? GLYPH.canvas}</svg>
    </span>
  );
}
export const LABEL: Record<Platform, string> = { canvas: 'Canvas', gmail: 'Gmail', gcal: 'Google Calendar', gradescope: 'Gradescope', piazza: 'Piazza', ed: 'Ed' };
export const Sources = ({ sources }: { sources: Platform[] }) => (
  <span className="badges">{sources.map((s) => <SourceBadge key={s} source={s} />)}</span>
);

const ICONS: Record<string, ReactNode> = {
  week: <><rect x="3.5" y="4.5" width="13" height="12" rx="2.5" {...P} /><path d="M3.8 8.5h12.4M7.4 3v3M12.6 3v3" {...P} /></>,
  changed: <><path d="M4 7h9.5M10.5 4l3 3-3 3M16 13H6.5M9.5 10l-3 3 3 3" {...P} /></>,
  waiting: <><circle cx="10" cy="10" r="6.5" {...P} /><path d="M10 6.5V10l2.4 1.6" {...P} /></>,
  grades: <><path d="M4 16V9M8.7 16V4.5M13.4 16v-5M17 16H3" {...P} /></>,
  inbox: <><path d="M3.5 10.5 5.6 4.8c.2-.5.7-.8 1.2-.8h6.4c.5 0 1 .3 1.2.8l2.1 5.7v3.8c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5Z" {...P} /><path d="M3.5 10.5h4l.8 1.8h3.4l.8-1.8h4" {...P} /></>,
  ask: <><path d="m10 3.5 1.4 3.6 3.6 1.4-3.6 1.4L10 13.5 8.6 9.9 5 8.5l3.6-1.4Z" {...P} /><path d="m15 13 .6 1.4 1.4.6-1.4.6L15 17l-.6-1.4-1.4-.6 1.4-.6Z" {...P} /></>,
  settings: <><circle cx="10" cy="10" r="2.6" {...P} /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6 15 15M15 5l-1.4 1.4M6.4 13.6 5 15" {...P} /></>,
  menu: <><path d="M3.5 6h13M3.5 10h13M3.5 14h13" {...P} /></>,
  search: <><circle cx="9" cy="9" r="5" {...P} /><path d="m13 13 3.5 3.5" {...P} /></>,
  close: <><path d="m5 5 10 10M15 5 5 15" {...P} /></>,
  sun: <><circle cx="10" cy="10" r="3.4" {...P} /><path d="M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M5 5l1.1 1.1M13.9 13.9 15 15M15 5l-1.1 1.1M6.1 13.9 5 15" {...P} /></>,
  moon: <><path d="M15.5 11.6A6.2 6.2 0 0 1 8.4 4.5a6.2 6.2 0 1 0 7.1 7.1Z" {...P} /></>,
  bolt: <><path d="M10.8 2.8 5 10.6h4l-.6 6.6 5.8-7.8h-4Z" {...P} /></>,
  cal: <><rect x="3.5" y="4.5" width="13" height="12" rx="2.5" {...P} /><path d="M3.8 8.5h12.4" {...P} /></>,
  check: <path d="m5 10.5 3.2 3.2L15 6.6" {...P} strokeWidth={2.2} />,
  empty: <><circle cx="10" cy="10" r="7" {...P} strokeWidth={1.2} /><path d="m6.8 10.3 2.2 2.2 4.2-4.6" {...P} strokeWidth={1.2} /></>,
  arrow: <path d="M4 10h11M11 6l4 4-4 4" {...P} />,
  dashboard: <><rect x="3.5" y="3.5" width="5.5" height="7" rx="1.6" {...P} /><rect x="11" y="3.5" width="5.5" height="4.5" rx="1.6" {...P} /><rect x="3.5" y="12.5" width="5.5" height="4" rx="1.6" {...P} /><rect x="11" y="10" width="5.5" height="6.5" rx="1.6" {...P} /></>,
  digest: <><path d="M5 3.8h7.5L15.5 7v9.2H5Z" {...P} /><path d="M12.4 3.8V7h3.1M7.6 10h5M7.6 13h3.4" {...P} /></>,
  courses: <><path d="M3.5 6.2 10 3.5l6.5 2.7L10 8.9Z" {...P} /><path d="M6 7.4v4.2c0 1.2 1.8 2.4 4 2.4s4-1.2 4-2.4V7.4M16.5 6.2v4.6" {...P} /></>,
  storage: <><ellipse cx="10" cy="5.5" rx="6" ry="2.2" {...P} /><path d="M4 5.5v9c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-9M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2" {...P} /></>,
  plug: <><path d="M7.5 3.5v3.2M12.5 3.5v3.2M5.5 6.7h9v2.6a4.5 4.5 0 0 1-9 0ZM10 13.8v2.7" {...P} /></>,
  collapse: <><rect x="3.5" y="4" width="13" height="12" rx="2.5" {...P} /><path d="M8 4v12M12.6 8.2 10.8 10l1.8 1.8" {...P} /></>,
  expand: <><rect x="3.5" y="4" width="13" height="12" rx="2.5" {...P} /><path d="M8 4v12M11 8.2l1.8 1.8L11 11.8" {...P} /></>,
  chevron: <path d="m7.5 8 2.5 2.5L12.5 8" {...P} />,
  copy: <><rect x="7" y="7" width="9" height="9" rx="2" {...P} /><path d="M4 12.5V5.6C4 4.7 4.7 4 5.6 4h6.9" {...P} /></>,
  send: <path d="M4 10 16 4.5 12.5 16l-2.7-4.8Z M9.8 11.2 16 4.5" {...P} />,
  trash: <><path d="M4.5 6h11M8.2 6V4.3h3.6V6M6 6l.7 10h6.6L14 6" {...P} /></>,
  money: <><rect x="3" y="5" width="14" height="10" rx="2.2" {...P} /><path d="M3.4 8.4h13.2M6.2 12.2h2.6" {...P} /></>,
  shield: <><path d="M10 3.2 4.6 5.2v4.3c0 3.3 2.3 5.9 5.4 7.1 3.1-1.2 5.4-3.8 5.4-7.1V5.2Z" {...P} /><path d="M10 7.2v3.4M10 13v.1" {...P} /></>,
  ext: <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16h8a1.5 1.5 0 0 0 1.5-1.5V12M11 4h5v5M16 4l-7 7" {...P} />,
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none' }}>{ICONS[name]}</svg>;
}

/* ---------- Small pieces ---------- */
export const hue = (state: SemoraState, code?: string) => state.courses.find((c) => c.code === code)?.color ?? '270';
export function CourseTag({ state, code }: { state: SemoraState; code?: string }) {
  if (!code) return null;
  return (
    <span className="course">
      <span className="dot" style={{ background: `oklch(var(--course-l) var(--course-c) ${hue(state, code)})` }} />
      {code}
    </span>
  );
}

export function Check({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const [pop, setPop] = useState(false);
  const on = checked || pop;
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className="check"
      whileTap={{ scale: 0.86 }}
      animate={pop ? { scale: [1, 1.22, 1] } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 18 }}
      onClick={(e) => {
        e.stopPropagation();
        if (checked) return onToggle();
        setPop(true);
        setTimeout(onToggle, 420);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
        <motion.path d="m5 10.5 3.2 3.2L15 6.6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.22 }} />
      </svg>
    </motion.button>
  );
}

/** Old value strikes through, then collapses into the new one. */
export function Morph({ from, to, animate }: { from?: string; to: string; animate: boolean }) {
  const [showOld, setShowOld] = useState(true);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setShowOld(false), 2600);
    return () => clearTimeout(t);
  }, [animate]);
  if (!from) return <span className="morph"><span className="new">{to}</span></span>;
  return (
    <span className="morph">
      <AnimatePresence initial={false}>
        {(animate ? showOld : true) && (
          <motion.span key="old" className="old" initial={animate ? { opacity: 0, x: -4 } : false} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, width: 0, marginRight: -6 }} transition={{ duration: 0.3 }}>
            {from}
          </motion.span>
        )}
      </AnimatePresence>
      {!animate || showOld ? <span className="arrow" aria-hidden="true">→</span> : null}
      <motion.span key={to} className="new" initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: animate ? 0.5 : 0, duration: 0.3 }}>
        {to}
      </motion.span>
    </span>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Syncing">
      <div className="skel" style={{ height: 30, width: '40%' }} />
      <div className="skel" style={{ height: 18, width: '62%' }} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height: 54, opacity: 1 - i * 0.12 }} />)}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="empty" size={40} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty" role="alert">
      <h3>Semora can't reach its server</h3>
      <p>{message}</p>
      <button className="btn" onClick={() => location.reload()}>Try again</button>
    </div>
  );
}

/* ---------- Evidence ---------- */
export const ROLE_META: Record<EvidenceRole, { label: string; cls: string }> = {
  winner: { label: 'Current', cls: 'accent' },
  supports: { label: 'Agrees', cls: 'ok' },
  superseded: { label: 'Replaced', cls: '' },
  outdated: { label: 'Outdated', cls: 'danger' },
  stale: { label: 'Stale', cls: 'danger' },
  question: { label: 'Question', cls: 'ghost' },
  other_section: { label: 'Other section', cls: 'ghost' },
  conflict: { label: 'Conflict', cls: 'warn' },
  completion: { label: 'Closes this', cls: 'ok' },
  origin: { label: 'Origin', cls: '' },
};

export function when(m?: Parameters<typeof fmtMoment>[0]) { return fmtMoment(m); }

export function EvidenceList({ item, state }: { item: Item; state: SemoraState }) {
  const byId = new Map(state.messages.map((m) => [m.id, m]));
  return (
    <div className="evidence">
      {item.evidence.map((e) => {
        const m = byId.get(e.messageId);
        if (!m) return null;
        const meta = ROLE_META[e.role];
        const dim = e.role === 'outdated' || e.role === 'stale' || e.role === 'superseded';
        return (
          <div key={e.messageId} className={`ev ${dim ? 'dim' : ''}`}>
            <SourceBadge source={m.source} />
            <div>
              <div className="ev-head">
                <b>{m.authorName}</b>
                <span className="muted">{roleName(m)}</span>
                <span className={`chip ${meta.cls}`}>{meta.label}</span>
                <span className="t-small">{fmtDate(localDate(m.sentAt))} · {clock(m.sentAt)}</span>
              </div>
              <blockquote>{e.quote}</blockquote>
              <p className="ev-note">{e.note}</p>
              <a className="linkout" href={m.url} target="_blank" rel="noreferrer">Open in {LABEL[m.source]} ↗</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export const roleName = (m: Pick<MessageView, 'authorRole' | 'source' | 'channel'>) =>
  ({ instructor: 'Instructor', ta: 'TA', staff: 'Course staff', system: 'System', student: 'Student', self: 'You', external: 'Sender' })[m.authorRole] + (m.channel === 'syllabus' ? ' · syllabus' : '');
export const clock = (iso: string) => fmtTime(new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }));

/* ---------- Cascade ---------- */
export function WeekStrip({ state, proposal }: { state: SemoraState; proposal: Proposal }) {
  const anchor = localDate(proposal.to?.start ?? proposal.from!.start);
  const ws = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const target = state.items.find((i) => i.id === proposal.targetId);
  const events = state.items.filter((i) => i.kind === 'event' && i.id !== proposal.targetId && i.start?.date);
  const short = (t?: string) => (t ? fmtTime(t).replace(':00', '') : '');
  return (
    <div className="weekstrip" aria-label="Your week">
      {days.map((d) => (
        <div className="wk-col" key={d}>
          <span className="d">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekdayOf(d)]} {Number(d.slice(8))}</span>
          {events.filter((e) => e.start!.date === d).map((e) => <span key={e.id} className="wk-pill" title={e.title}>{short(e.start!.time)}<span className="wk-title"> {e.title}</span></span>)}
          {target?.start?.date === d && (
            <motion.span layoutId={`blk-${proposal.id}`} className="wk-pill hero" transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
              {short(target.start.time)}–{short(target.end?.time)}<span className="wk-title"> {target.title}</span>
            </motion.span>
          )}
          {proposal.status === 'proposed' && proposal.to && localDate(proposal.to.start) === d && <span className="wk-pill ghost">{short(new Date(proposal.to.start).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }))} new slot</span>}
        </div>
      ))}
    </div>
  );
}

export function ProposalCard({ proposal, state, compact }: { proposal: Proposal; state: SemoraState; compact?: boolean }) {
  const { act } = useSemora();
  const approved = proposal.status === 'approved';
  const dismissed = proposal.status === 'dismissed';
  const verb = proposal.kind === 'move_event' ? 'Approve & move' : proposal.kind === 'draft_message' ? 'Approve draft' : 'Approve question';
  return (
    <motion.div layout className={`card suggest`} style={{ opacity: dismissed ? 0.55 : 1 }}>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h3>{proposal.title}</h3>
        {approved && <span className="chip ok">Approved</span>}
        {dismissed && <span className="chip">Dismissed</span>}
      </div>
      {!compact && <p className="t-small">{proposal.detail}</p>}
      {proposal.kind === 'move_event' && proposal.from && proposal.to && (
        <>
          <p style={{ fontSize: 14 }}>
            <span className="muted" style={{ textDecoration: approved ? 'line-through' : undefined }}>{fmtRange(proposal.from.start, proposal.from.end)}</span>
            {'  →  '}<b>{fmtRange(proposal.to.start, proposal.to.end)}</b>
          </p>
          <WeekStrip state={state} proposal={proposal} />
        </>
      )}
      {proposal.body && (
        <div>
          <p className="t-small" style={{ marginBottom: 6 }}>To {proposal.recipients?.join(', ')}</p>
          <div className="draft">{proposal.body}</div>
        </div>
      )}
      {proposal.status === 'proposed' && (
        <div className="actions">
          <motion.button whileTap={{ scale: 0.95 }} className="btn primary" onClick={() => void act('approve', proposal.id)}>{verb}</motion.button>
          <button className="btn quiet" onClick={() => void act('reject', proposal.id)}>Not now</button>
          <span className="t-small">{proposal.requires === 'calendar.write' ? 'Needs calendar write access · nothing changes until you tap' : 'Opens as a draft · nothing is sent until you tap'}</span>
        </div>
      )}
      {!compact && <p className="t-small">Why: {proposal.reason}</p>}
    </motion.div>
  );
}

/* ---------- Item rows ---------- */
export const CHANGE_TYPES = new Set(['due', 'time', 'location', 'canceled', 'resolved']);
export const itemDate = (i: Item) => (i.due ?? i.start)?.date;
export const latestChange = (state: SemoraState, item: Item): Change | undefined => state.changes.find((c) => c.itemId === item.id && CHANGE_TYPES.has(c.type));

export const sourceCount = (i: Item) => i.evidence.filter((e) => !['question', 'outdated', 'other_section'].includes(e.role)).length;
export function conflictText(item: Item): string {
  return item.conflict ? item.conflict.options.map((o) => (typeof o.value === 'string' ? o.value : o.value.date ? fmtDate(o.value.date) : '')).join(' or ') : '';
}

export function timeText(item: Item): string {
  if (item.conflict) return conflictText(item);
  if (item.kind === 'event' || item.kind === 'exam' || item.kind === 'office_hours' || item.kind === 'presentation') {
    if (item.start?.time && item.end?.time) return `${fmtTime(item.start.time).replace(':00', '')}–${fmtTime(item.end.time).replace(':00', '')}`;
    return item.start?.time ? fmtTime(item.start.time) : 'In class';
  }
  if (item.due?.time) return `Due ${fmtTime(item.due.time)}`;
  return item.due?.date ? `Due ${fmtDate(item.due.date)}` : '';
}

export function ItemRow({ item, state, index, showDate }: { item: Item; state: SemoraState; index: number; showDate?: boolean }) {
  const { act, openItem, fresh, selected, setSelected } = useSemora();
  const change = latestChange(state, item);
  const isFresh = fresh.has(item.id) && Boolean(change);
  const isEvent = item.kind === 'event';
  const canceled = item.status === 'canceled';
  const n = sourceCount(item);
  const open = () => { setSelected(item.id); openItem(item.id); };
  return (
    <motion.li
      layout="position"
      layoutId={`row-${item.id}`}
      className={`row ${isEvent ? 'event' : ''} ${canceled ? 'canceled' : ''}`}
      data-selected={selected === item.id}
      data-item={item.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 28, transition: { duration: 0.26 } }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.24 }}
      onClick={isEvent ? undefined : open}
    >
      <div className="lead">
        {isEvent ? <span className="muted"><Icon name="cal" size={18} /></span> : <Check checked={item.status === 'done'} label={`Mark ${item.title} done`} onToggle={() => void act(item.status === 'done' ? 'undo_done' : 'done', item.id)} />}
      </div>
      <div className="row-main">
        <motion.span layoutId={`title-${item.id}`} className="row-title">{item.title}</motion.span>
        <span className="row-sub">
          <CourseTag state={state} code={item.course} />
          {item.location && <span>{item.location}</span>}
          {showDate && itemDate(item) && <span>{fmtDate(itemDate(item)!)}</span>}
          {item.status === 'needs_confirmation' && <span className="chip warn">Needs confirmation</span>}
          {canceled && <span className="chip danger">Canceled</span>}
          {change && !canceled && item.status !== 'needs_confirmation' && (change.type === 'resolved' ? <span className="chip ok">Resolved by {change.byName.replace(/^(Prof\.|Dr\.) \S+ /, '$1 ')}</span> : <span className="chip warn">Changed</span>)}
          {item.scopeNote && <span className="chip accent">Section B</span>}
          {!isEvent && n > 0 && <><Sources sources={item.sources} /><span>{n} source{n > 1 ? 's' : ''}</span></>}
        </span>
      </div>
      <div className="row-when">
        {isFresh && change ? (
          <Morph from={fmtValue(change.from as never)} to={fmtValue(change.to as never)} animate />
        ) : (
          <span>{timeText(item)}</span>
        )}
        {item.status === 'needs_confirmation' && item.conflict && <span className="t-small">{item.conflict.options.length} sources disagree</span>}
      </div>
    </motion.li>
  );
}

export { fmtMoment, fmtValue };
