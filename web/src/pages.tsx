import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { addDays, fmtDate, fmtMoment, fmtRange, fmtTime, fmtValue, localDate, weekStart, weekdayOf } from '../../engine/time';
import type { SemoraState, InboxCategory, Item } from '../../engine/types';
import { useSemora } from './store';
import { Chat } from './assistant';
import { MoneyChanges, MoneyDecisions } from './money';
import { Check, CourseTag, Empty, ErrorState, Icon, ItemRow, LABEL, Morph, ProposalCard, ROLE_META, Skeleton, SourceBadge, Sources, CHANGE_TYPES, itemDate, roleName, clock } from './ui';

function useReady() {
  const { state, error } = useSemora();
  return { state, error };
}
export function Gate({ children }: { children: (s: SemoraState) => React.ReactNode }) {
  const { state, error } = useReady();
  if (error && !state) return <ErrorState message={error} />;
  if (!state) return <Skeleton />;
  return <>{children(state)}</>;
}
export function useNav(ids: string[]) {
  const { setNavIds } = useSemora();
  const key = ids.join('|');
  useEffect(() => { setNavIds(key ? key.split('|') : []); }, [key, setNavIds]);
}
const dayHead = (date: string, today: string) => (date === today ? `Today · ${fmtDate(date)}` : date === addDays(today, 1) ? `Tomorrow · ${fmtDate(date)}` : fmtDate(date));
const WEIGHT: Record<string, number> = { exam: 3, assignment: 2, presentation: 2, task: 1, promise: 1, reply: 1, event: 0.5, opportunity: 0, office_hours: 0 };
const isOpen = (i: Item) => i.status !== 'done' && i.status !== 'dismissed';

/* ================= This week ================= */
export function Home() {
  return <Gate>{(s) => <HomeView state={s} />}</Gate>;
}
function HomeView({ state }: { state: SemoraState }) {
  const { fresh } = useSemora();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFollow, setShowFollow] = useState(false);
  const today = localDate(state.now);
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const open = state.items.filter(isOpen);
  const attention = open.filter((i) => i.status === 'needs_confirmation');
  const attentionIds = new Set(attention.map((i) => i.id));
  const inWeek = open.filter((i) => !attentionIds.has(i.id) && itemDate(i) && itemDate(i)! >= ws && itemDate(i)! <= we);
  const next = open.filter((i) => !attentionIds.has(i.id) && itemDate(i) && itemDate(i)! > we && itemDate(i)! <= addDays(we, 2));
  const later = open.filter((i) => i.kind !== 'event' && itemDate(i) && itemDate(i)! > addDays(we, 2)).slice(0, 4);
  const byDay = new Map<string, Item[]>();
  for (const i of inWeek) (byDay.get(itemDate(i)!) ?? byDay.set(itemDate(i)!, []).get(itemDate(i)!)!).push(i);
  const days = [...byDay.keys()].sort();
  const doneCount = state.items.filter((i) => i.status === 'done').length;

  const due = inWeek.filter((i) => ['assignment', 'exam', 'presentation', 'task'].includes(i.kind)).length;
  const changed = new Set(state.changes.filter((c) => CHANGE_TYPES.has(c.type) && localDate(c.at) >= ws && localDate(c.at) <= we).map((c) => c.itemId)).size;
  const waiting = open.filter((i) => i.kind === 'promise' || i.kind === 'reply').length;
  const week = Array.from({ length: 7 }, (_, k) => addDays(ws, k));
  const load = week.map((d) => open.filter((i) => itemDate(i) === d).reduce((n, i) => n + (WEIGHT[i.kind] ?? 0), 0));
  const follow = state.proposals.filter((p) => p.kind !== 'ask_staff' && p.status !== 'dismissed');
  const tasks = (d: string) => byDay.get(d)!.filter((i) => i.kind !== 'event');
  const events = (d: string) => byDay.get(d)!.filter((i) => i.kind === 'event');
  // Today and tomorrow stay open; later days fold to one line until clicked.
  const isExpanded = (d: string) => d <= addDays(today, 1) || expanded.has(d);
  const ordered = [...attention, ...days.filter(isExpanded).flatMap(tasks), ...next, ...later].filter((i) => i.kind !== 'event');
  useNav(ordered.map((i) => i.id));
  let n = 0;
  const row = (i: Item, showDate?: boolean) => <ItemRow key={i.id} item={i} state={state} index={n++} showDate={showDate} />;

  return (
    <LayoutGroup>
      <header className="page-head">
        <p className="eyebrow">{new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · times in ET</p>
        <h1 className="t-title">This week</h1>
        <p className="summary" aria-live="polite">
          <span><b>{due}</b> due</span><span className="sep">·</span>
          <span><b>{changed}</b> changed</span><span className="sep">·</span>
          <span><b>{waiting}</b> waiting on you</span>
        </p>
      </header>

      <div className="load" aria-label="Workload per day">
        {week.map((d, k) => (
          <div className="load-day" key={d} data-today={d === today} data-heavy={load[k] >= 4}>
            <div className="load-bar"><motion.span initial={{ height: 3 }} animate={{ height: Math.max(3, Math.min(36, (load[k] / 6) * 36)) }} transition={{ delay: 0.1 + k * 0.03, duration: 0.4 }} /></div>
            <span>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][k]}</span>
          </div>
        ))}
      </div>

      {follow.length > 0 && (
        <section className="group" aria-label="Suggested follow-ups">
          <button className="group-head group-toggle" aria-expanded={showFollow} onClick={() => setShowFollow(!showFollow)}>
            <h2>Because HW5 moved</h2>
            <span className="muted">{follow.filter((p) => p.status === 'proposed').length ? `${follow.filter((p) => p.status === 'proposed').length} suggestion${follow.filter((p) => p.status === 'proposed').length > 1 ? 's' : ''} · nothing happens until you approve` : 'All handled'}</span>
            <span className="toggle-hint">{showFollow ? 'Hide' : 'Review'}</span>
          </button>
          {!showFollow && (
            <ul className="follow-peek">
              {follow.map((p) => <li key={p.id}><span className={`chip ${p.status === 'approved' ? 'ok' : 'accent'}`}>{p.status === 'approved' ? 'Approved' : p.kind === 'move_event' ? 'Calendar' : 'Draft'}</span> {p.title}{p.kind === 'move_event' && p.to ? <span className="muted"> · {fmtRange(p.to.start, p.to.end)}</span> : null}</li>)}
            </ul>
          )}
          <AnimatePresence initial={false}>
            {showFollow && (
              <motion.div className="stack" style={{ marginTop: 14, overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {follow.map((p) => p.status === 'approved' ? <motion.p layout key={p.id} className="t-small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="chip ok">Approved</span> {p.title}{p.to ? ` · ${fmtRange(p.to.start, p.to.end)}` : ''}</motion.p> : <ProposalCard key={p.id} proposal={p} state={state} compact={p.kind === 'draft_message'} />)}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {attention.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Needs your attention</h2><span className="muted">Sources disagree</span></div>
          <ul><AnimatePresence initial>{attention.map((i) => row(i))}</AnimatePresence></ul>
        </section>
      )}

      {days.map((d) => {
        const ev = events(d);
        const evNote = ev.length ? `${ev.length} on your calendar` : '';
        if (!isExpanded(d)) {
          return (
            <section className="group" key={d}>
              <button className="group-head group-toggle" aria-expanded={false} onClick={() => setExpanded(new Set([...expanded, d]))}>
                <h2>{dayHead(d, today)}</h2>
                <span className="muted">{tasks(d).length ? `${tasks(d).length} thing${tasks(d).length > 1 ? 's' : ''}` : ''}{tasks(d).length && evNote ? ' · ' : ''}{evNote}</span>
                <span className="peek">{tasks(d).map((i) => i.title.split(' — ')[0]).join(' · ')}</span>
                <span className="toggle-hint">Show</span>
              </button>
            </section>
          );
        }
        return (
          <section className="group" key={d}>
            <div className="group-head"><h2>{dayHead(d, today)}</h2>{evNote && <span className="muted">{ev.map((e) => `${e.title.split(' — ')[0]} ${e.start?.time ? fmtTime(e.start.time) : ''}`.trim()).join(' · ')}</span>}</div>
            <ul><AnimatePresence initial>{tasks(d).map((i) => row(i))}</AnimatePresence></ul>
            {!tasks(d).length && <p className="t-small" style={{ padding: '10px 0' }}>Nothing due.</p>}
          </section>
        );
      })}

      {next.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Next week</h2><span className="muted">{[...new Set(next.map((i) => itemDate(i)!))].sort().map((d) => fmtDate(d)).join(' – ')}</span></div>
          <ul><AnimatePresence initial>{next.map((i) => row(i, true))}</AnimatePresence></ul>
        </section>
      )}
      {later.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Later</h2><span className="muted">Deadlines worth knowing</span></div>
          <ul><AnimatePresence initial>{later.map((i) => row(i, true))}</AnimatePresence></ul>
        </section>
      )}
      {inWeek.length === 0 && next.length === 0 && <Empty title="A clear week">Nothing is due. Enjoy it.</Empty>}
      {doneCount > 0 && <p className="t-small">{doneCount} item{doneCount > 1 ? 's' : ''} done · {fresh.size ? 'updated live' : 'up to date'}</p>}
      <p className="t-small" style={{ marginTop: 28 }}>{state.stats.messagesIn} messages in · <b style={{ color: 'var(--text)' }}>{state.stats.needToKnow}</b> things you actually need to know · {state.stats.deduped} duplicates folded away</p>
    </LayoutGroup>
  );
}

/* ================= Changed ================= */
export function Changed() {
  return <Gate>{(s) => <ChangedView state={s} />}</Gate>;
}
function ChangedView({ state }: { state: SemoraState }) {
  const { fresh, openItem, act } = useSemora();
  const needs = state.items.filter((i) => i.status === 'needs_confirmation' && i.conflict);
  const triggers = new Set(state.proposals.map((p) => p.itemId));
  const changes = state.changes.filter((c) => c.type !== 'completed').sort((a, b) => Number(triggers.has(b.itemId)) - Number(triggers.has(a.itemId)) || (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.at.localeCompare(a.at));
  const byId = new Map(state.messages.map((m) => [m.id, m]));
  useNav([]);
  return (
    <>
      <header className="page-head">
        <h1 className="t-title">Changed</h1>
        <p className="summary">Every change as old → new, who said it, and why Semora believed them.</p>
      </header>
      {changes.length === 0 && <Empty title="Nothing has changed">When a date, room or time moves, it shows up here.</Empty>}
      <ul>
        <AnimatePresence initial>
          {changes.map((c, idx) => {
            const item = state.items.find((i) => i.id === c.itemId);
            if (!item) return null;
            const isFresh = fresh.has(c.itemId) && Boolean(c.live);
            const label = c.type === 'canceled' ? 'Canceled' : c.type === 'added' ? 'Added' : c.type === 'resolved' ? 'Resolved' : c.type === 'location' ? 'Room' : c.type === 'due' ? 'Deadline' : 'Time';
            return (
              <motion.li layout key={c.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr)', cursor: 'default' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }}>
                <div className="row-main" style={{ gap: 8, padding: '4px 0' }}>
                  <div className="actions" style={{ justifyContent: 'space-between' }}>
                    <span className="row-sub" style={{ gap: 8 }}>
                      <CourseTag state={state} code={item.course} />
                      <span className="chip warn">{label}</span>
                      {c.scopeNote && <span className="chip accent">{c.scopeNote}</span>}
                      {c.live && <span className="chip accent">Just now</span>}
                    </span>
                    <button className="linkout" onClick={() => openItem(item.id)}>Why? →</button>
                  </div>
                  <button className="row-title" style={{ textAlign: 'left', fontSize: 16 }} onClick={() => openItem(item.id)}>{item.title.split(' — ')[0]}</button>
                  <div style={{ fontSize: 17 }}>
                    {c.type === 'canceled' ? <Morph from={fmtMoment(item.start)} to="Canceled" animate={isFresh} /> : c.type === 'added' ? <b>{fmtMoment(item.start)}{item.end?.time ? `–${fmtTime(item.end.time)}` : ''}{item.location ? ` · ${item.location}` : ''}</b> : <Morph from={fmtValue(c.from as never)} to={fmtValue(c.to as never)} animate={isFresh} />}
                  </div>
                  <p className="t-small">{c.byName} · {LABEL[c.source]} · {fmtDate(localDate(c.at))}, {clock(c.at)}</p>
                  <p className="t-small">{c.reason}.</p>
                  <div className="row-sub">
                    {c.messageIds.map((id) => { const m = byId.get(id); const e = item.evidence.find((x) => x.messageId === id); return m ? (
                      <a key={id} href={m.url} target="_blank" rel="noreferrer" className={`chip ${e ? ROLE_META[e.role].cls : ''}`}><SourceBadge source={m.source} /> {m.authorName.replace(/^(Prof\.|Dr\.) \S+ /, '$1 ')}</a>
                    ) : null; })}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {needs.map((item) => (
        <section className="group" key={item.id} style={{ marginTop: 28 }}>
          <div className="card warn">
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <h3><CourseTag state={state} code={item.course} /> &nbsp;{item.title}</h3>
              <span className="chip warn">Needs confirmation</span>
            </div>
            <p className="t-small">Two equally authoritative sources disagree, so Semora isn't guessing.</p>
            <div className="stack-sm">
              {item.conflict!.options.map((o) => {
                const m = byId.get(o.messageId);
                return (
                  <div key={o.messageId} className="actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <div>
                      <b>{fmtValue(o.value as never)}</b>
                      <p className="t-small"><SourceBadge source={o.source} /> {o.authorName} · {m ? roleName(m) : o.authorRole}{m ? ` · “${m.excerpt.slice(0, 70)}”` : ''}</p>
                    </div>
                    <button className="btn" onClick={() => void act('choose', item.id, o.messageId)}>This one</button>
                  </div>
                );
              })}
            </div>
            {state.proposals.filter((p) => p.itemId === item.id && p.kind === 'ask_staff').map((p) => <ProposalCard key={p.id} proposal={p} state={state} compact />)}
          </div>
        </section>
      ))}
      <MoneyChanges state={state} />
    </>
  );
}

/* ================= Waiting on me ================= */
export function Waiting() {
  return <Gate>{(s) => <WaitingView state={s} />}</Gate>;
}
function WaitingView({ state }: { state: SemoraState }) {
  const { act, openItem } = useSemora();
  const all = state.items.filter((i) => i.kind === 'promise' || i.kind === 'reply');
  const active = all.filter((i) => i.status === 'active');
  const closed = all.filter((i) => i.status === 'done');
  useNav(active.map((i) => i.id));
  return (
    <LayoutGroup>
      <header className="page-head">
        <h1 className="t-title">Waiting on me</h1>
        <p className="summary">Replies you owe and promises you made in sent mail. Fulfilled promises close themselves when evidence appears.</p>
      </header>
      {active.length === 0 && <Empty title="You're all caught up">Nothing is waiting on you.</Empty>}
      <ul>
        <AnimatePresence initial>
          {active.map((i, idx) => {
            const q = i.evidence[0];
            return (
              <motion.li layout key={i.id} data-item={i.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr)' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30, transition: { duration: 0.3 } }} transition={{ delay: idx * 0.04 }} onClick={() => openItem(i.id)}>
                <div className="lead"><Check checked={false} label={`Mark ${i.title} done`} onToggle={() => void act('done', i.id)} /></div>
                <div className="row-main" style={{ gap: 8 }}>
                  <span className="row-title">{i.title}</span>
                  <span className="row-sub"><CourseTag state={state} code={i.course} />{i.due?.date && <span className="chip warn">by {fmtDate(i.due.date)}</span>}{i.confirmed && <span className="chip ok">Confirmed</span>}<Sources sources={i.sources} /></span>
                  {q && <blockquote className="t-small" style={{ margin: 0, paddingLeft: 10, borderLeft: '2px solid var(--line-strong)' }}>“{q.quote}”</blockquote>}
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    {!i.confirmed && <button className="btn" onClick={() => void act('confirm', i.id)}>Confirm</button>}
                    <button className="btn primary" onClick={() => void act('done', i.id)}>Done</button>
                    <button className="btn quiet" onClick={() => void act('dismiss', i.id)}>Dismiss</button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {closed.length > 0 && (
        <section className="group" style={{ marginTop: 32 }}>
          <div className="group-head"><h2>Closed</h2></div>
          <ul>
            {closed.map((i) => (
              <motion.li layout key={i.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr)' }} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} onClick={() => openItem(i.id)}>
                <span className="chip ok" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}><Icon name="check" size={14} /></span>
                <div className="row-main">
                  <span className="row-title" style={{ textDecoration: 'line-through', color: 'var(--muted)' }}>{i.title}</span>
                  <span className="t-small">{i.completedBy === 'evidence' ? `Closed automatically — ${i.evidence.find((e) => e.role === 'completion')?.note ?? 'evidence in sent mail'}` : 'Marked done by you'}</span>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
      <MoneyDecisions state={state} />
    </LayoutGroup>
  );
}

/* ================= Grades ================= */
export function Grades() {
  return <Gate>{(s) => <GradesView state={s} />}</Gate>;
}
function GradesView({ state }: { state: SemoraState }) {
  const [code, setCode] = useState(state.courses[0].code);
  const [target, setTarget] = useState(90);
  const cg = state.courseGrades.find((g) => g.course === code)!;
  const course = state.courses.find((c) => c.code === code)!;
  const recent = state.grades.filter((g) => g.course === code).slice(0, 6);
  const fw = cg.finalWeight;
  const needed = cg.current !== null && fw > 0 ? (target - cg.current * (1 - fw)) / fw : null;
  useNav([]);
  return (
    <>
      <header className="page-head">
        <h1 className="t-title">Grades</h1>
        <p className="summary">New scores as they post, running averages, and what you need on the final.</p>
      </header>
      <div className="tabs" role="tablist">
        {state.courseGrades.map((g) => (
          <button key={g.course} className="tab" aria-pressed={g.course === code} onClick={() => setCode(g.course)}>
            {g.course} <span className="n">{g.current === null ? '—' : `${g.current.toFixed(1)}%`}</span>
          </button>
        ))}
      </div>
      <div className="stack" style={{ gap: 28 }}>
        <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p className="t-small"><CourseTag state={state} code={code} /> {course.title}</p>
            <motion.div key={code} className="big" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{cg.current === null ? '—' : `${cg.current.toFixed(1)}%`}</motion.div>
            <p className="t-small">Running average · weighted over graded categories</p>
          </div>
        </div>
        <table className="tbl">
          <thead><tr><th>Category</th><th>Weight</th><th>Graded</th><th>Average</th></tr></thead>
          <tbody>
            {cg.categories.map((c) => <tr key={c.category}><td>{c.category}</td><td>{Math.round(c.weight * 100)}%</td><td>{c.count}</td><td>{c.average === null ? '—' : `${c.average.toFixed(1)}%`}</td></tr>)}
            {fw > 0 && <tr><td>Final</td><td>{Math.round(fw * 100)}%</td><td>0</td><td>—</td></tr>}
          </tbody>
        </table>
        {fw > 0 && (
          <div className="card">
            <h3>What do I need on the final?</h3>
            <label className="actions" style={{ justifyContent: 'space-between' }}>
              <span>I want a final grade of</span><b className="t-mono">{target}%</b>
            </label>
            <input type="range" min={60} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target course grade" />
            <p style={{ fontSize: 15 }}>
              {needed === null ? 'No grades yet to project from.' : needed > 100 ? <>You'd need <b>{needed.toFixed(1)}%</b> on the final — out of reach with the final alone.</> : needed <= 0 ? <b>You've already secured {target}%.</b> : <>You need <b>{needed.toFixed(1)}%</b> on the final.</>}
            </p>
            <p className="t-small">Assumes your remaining coursework lands at your current average.</p>
          </div>
        )}
        <section>
          <div className="group-head"><h2>Recent scores</h2></div>
          <ul>
            {recent.map((g, i) => (
              <motion.li key={g.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', cursor: 'default' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className="row-main"><span className="row-title">{g.assignment} {g.isNew && <span className="chip accent">New</span>}</span><span className="row-sub"><SourceBadge source={g.source} /> Posted {fmtDate(localDate(g.postedAt))}</span></div>
                <div className="row-when"><b style={{ fontSize: 16, color: 'var(--text)' }}>{g.score}/{g.max}</b><a className="linkout" href={state.messages.find((m) => m.id === g.messageId)?.url} target="_blank" rel="noreferrer">Open ↗</a></div>
              </motion.li>
            ))}
            {recent.length === 0 && <Empty title="No grades yet" />}
          </ul>
        </section>
      </div>
    </>
  );
}

/* ================= Inbox ================= */
type Cat = InboxCategory | 'all' | 'needs';
const CATS: { id: Cat; label: string }[] = [
  { id: 'needs', label: 'Needs you' }, { id: 'all', label: 'All' }, { id: 'courses', label: 'Academic' }, { id: 'money', label: 'Subscriptions & billing' }, { id: 'opportunities', label: 'Opportunities' }, { id: 'admin', label: 'Admin' }, { id: 'clubs', label: 'Clubs & social' }, { id: 'noise', label: 'Promotions' }, { id: 'spam', label: 'Spam' },
];
const CAT_CHIP: Partial<Record<InboxCategory, string>> = { courses: 'Academic', money: 'Billing', opportunities: 'Opportunity', admin: 'Admin', clubs: 'Clubs', noise: 'Promotion', spam: 'Spam' };
type Sort = 'newest' | 'oldest' | 'sender';
export function Inbox() {
  return <Gate>{(s) => <InboxView state={s} />}</Gate>;
}
function InboxView({ state }: { state: SemoraState }) {
  const { openItem, sendChat, setAssistantOpen } = useSemora();
  const [params, setParams] = useSearchParams();
  const initial = params.get('cat') as Cat | null;
  const [cat, setCatState] = useState<Cat>(initial && CATS.some((c) => c.id === initial) ? initial : 'needs');
  const setCat = (c: Cat) => { setCatState(c); setParams((p) => { const n = new URLSearchParams(p); if (c === 'needs') n.delete('cat'); else n.set('cat', c); return n; }, { replace: true }); };
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(30);
  const msgs = useMemo(() => state.messages.filter((m) => !['grade', 'calendar', 'assignment', 'syllabus'].includes(m.channel)), [state.messages]);
  const needs = (m: (typeof msgs)[number]) => !m.spam && (m.itemIds.length > 0 || Boolean(m.suspicious) || state.finance.alerts.some((a) => a.urgency >= 60 && a.messageIds.includes(m.id))) && !m.categories.includes('noise');
  const match = (m: (typeof msgs)[number], c: Cat) => (c === 'spam' ? Boolean(m.spam) : m.spam ? false : c === 'all' ? true : c === 'needs' ? needs(m) : m.categories.includes(c));
  const counts = (c: Cat) => msgs.filter((m) => match(m, c)).length;
  const shown = msgs
    .filter((m) => match(m, cat) && (!q || `${m.subject} ${m.authorName} ${m.summary}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === 'oldest' ? a.sentAt.localeCompare(b.sentAt) : sort === 'sender' ? a.authorName.localeCompare(b.authorName) || b.sentAt.localeCompare(a.sentAt) : b.sentAt.localeCompare(a.sentAt)));
  const replyFor = (id: string) => state.items.find((i) => i.kind === 'reply' && i.status === 'active' && i.evidence.some((e) => e.messageId === id));
  useNav([]);
  return (
    <>
      <header className="page-head">
        <h1 className="t-title">Inbox</h1>
        <p className="summary"><b>{state.stats.messagesIn}</b> messages in → <b>{state.stats.needToKnow}</b> things you need to know. Categories come from what each message says; they're filters, not folders.</p>
      </header>
      <div className="inbox-tools">
        <input className="field" type="search" placeholder="Search messages" aria-label="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="select"><span className="sr">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort messages">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="sender">By sender</option>
          </select>
        </label>
      </div>
      <div className="tabs" role="tablist" aria-label="Filter messages">{CATS.map((c) => <button key={c.id} role="tab" className="tab" aria-selected={cat === c.id} aria-pressed={cat === c.id} onClick={() => { setCat(c.id); setLimit(30); }}>{c.label}<span className="n">{counts(c.id)}</span></button>)}</div>
      {cat === 'spam' && <p className="t-small" style={{ marginBottom: 10 }}>Your spam folder, read-only. Semora never reconciles spam; Gmail deletes it after 30 days.</p>}
      {shown.length === 0 && <Empty title="Nothing here">No messages match this filter.</Empty>}
      <ul>
        {shown.slice(0, limit).map((m, i) => {
          const reply = replyFor(m.id);
          return (
            <motion.li key={m.id} layout="position" className="row" data-open={open === m.id} style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.25) }} onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
              <div className="lead"><SourceBadge source={m.source} /></div>
              <div className="row-main">
                <span className="row-title" style={{ fontWeight: 520 }}>{m.subject || m.authorName}</span>
                <span className="t-small" style={{ color: 'var(--text-2)' }}>{m.summary}</span>
                <span className="row-sub">
                  <span>{m.authorName}</span>
                  {m.categories.map((c) => <span key={c} className={`chip ${c === 'opportunities' ? 'accent' : c === 'noise' || c === 'spam' ? 'ghost' : ''}`}>{CAT_CHIP[c] ?? c}</span>)}
                  {m.suspicious && <span className="chip danger">Look-alike sender · ignored</span>}
                  {m.hasAttachment && m.sizeBytes ? <span className="chip ghost">{(m.sizeBytes / 1_000_000).toFixed(1)} MB</span> : null}
                  {m.evidenceRole && ['outdated', 'question', 'superseded', 'stale'].includes(m.evidenceRole) && <span className={`chip ${ROLE_META[m.evidenceRole].cls}`}>{ROLE_META[m.evidenceRole].label}</span>}
                  {m.itemIds.slice(0, 2).map((id) => <button key={id} className="linkout" onClick={(e) => { e.stopPropagation(); openItem(id); }}>→ {state.items.find((x) => x.id === id)?.title.split(' — ')[0]}</button>)}
                  {m.subscriptionIds?.map((id) => <button key={id} className="linkout" onClick={(e) => { e.stopPropagation(); openItem(id); }}>→ {state.finance.subscriptions.find((x) => x.id === id)?.name}</button>)}
                </span>
                <AnimatePresence>
                  {open === m.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <p className="t-small msg-body">{m.excerpt}</p>
                      <div className="actions" onClick={(e) => e.stopPropagation()}>
                        <a className="btn sm" href={m.url} target="_blank" rel="noreferrer">Open in {LABEL[m.source]} ↗</a>
                        {reply && <button className="btn sm primary" onClick={() => { setAssistantOpen(true); void sendChat(`Draft a reply to ${m.authorName}`); }}>Draft a reply</button>}
                        {(m.itemIds[0] || m.subscriptionIds?.[0]) && <button className="btn sm quiet" onClick={() => openItem((m.itemIds[0] ?? m.subscriptionIds![0]))}>Why it matters</button>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="row-when"><span>{fmtDate(localDate(m.sentAt))}</span></div>
            </motion.li>
          );
        })}
      </ul>
      {shown.length > limit && <button className="btn" style={{ marginTop: 16 }} onClick={() => setLimit(limit + 40)}>Show more ({shown.length - limit})</button>}
      {cat === 'needs' && !q && <p className="t-small" style={{ marginTop: 18 }}>{msgs.filter((m) => !m.spam).length - counts('needs')} other messages, including {counts('noise')} promos and newsletters, are set aside. <button className="linkout" onClick={() => setCat('all')}>Show all {msgs.filter((m) => !m.spam).length}</button></p>}
    </>
  );
}

/* ================= Course ================= */
export function CoursePage() {
  const { code } = useParams();
  return <Gate>{(s) => <CourseView state={s} code={code!} />}</Gate>;
}
function CourseView({ state, code }: { state: SemoraState; code: string }) {
  const course = state.courses.find((c) => c.code === code);
  const cg = state.courseGrades.find((g) => g.course === code);
  const items = state.items.filter((i) => i.course === code && i.status !== 'dismissed');
  const msgs = state.messages.filter((m) => m.course === code && !['grade', 'calendar', 'assignment', 'syllabus'].includes(m.channel));
  const staff = msgs.filter((m) => ['instructor', 'ta', 'staff'].includes(m.authorRole));
  useNav(items.filter((i) => i.kind !== 'event').map((i) => i.id));
  if (!course) return <Empty title="Unknown course" />;
  let n = 0;
  return (
    <LayoutGroup>
      <header className="page-head">
        <p className="eyebrow"><CourseTag state={state} code={code} /></p>
        <h1 className="t-title">{course.title}</h1>
        <p className="summary">{course.instructor} · {course.staff.filter((s) => s.role !== 'instructor').map((s) => s.name).join(', ')}{course.section ? ` · you're in Section ${course.section}` : ''}</p>
        <p className="row-sub" style={{ marginTop: 6 }}>{course.links.map((l) => <a key={l.label} className="linkout" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}</p>
      </header>
      <div className="stack" style={{ gap: 30 }}>
        <section>
          <div className="group-head"><h2>Assignments & exams</h2></div>
          {items.length ? <ul><AnimatePresence initial>{items.map((i) => <ItemRow key={i.id} item={i} state={state} index={n++} showDate />)}</AnimatePresence></ul> : <Empty title="Nothing scheduled" />}
        </section>
        <section>
          <div className="group-head"><h2>Grades</h2>{cg?.current != null && <span className="muted">{cg.current.toFixed(1)}% running · <Link to="/grades" className="linkout">details</Link></span>}</div>
          <ul>{state.grades.filter((g) => g.course === code).slice(0, 4).map((g) => <li key={g.id} className="row" style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}><span>{g.assignment} {g.isNew && <span className="chip accent">New</span>}</span><b>{g.score}/{g.max}</b></li>)}</ul>
        </section>
        <section>
          <div className="group-head"><h2>Announcements & staff messages</h2></div>
          <ul>{staff.slice(0, 8).map((m) => <li key={m.id} className="row" style={{ gridTemplateColumns: '24px 1fr auto', cursor: 'default' }}><SourceBadge source={m.source} /><div className="row-main"><span className="row-title" style={{ fontWeight: 520 }}>{m.subject}</span><span className="t-small">{m.summary}</span><span className="t-small">{m.authorName} · {roleName(m)}</span></div><span className="row-when">{fmtDate(localDate(m.sentAt))}</span></li>)}</ul>
        </section>
        <section>
          <div className="group-head"><h2>Office hours</h2></div>
          <ul>{course.officeHours.map((o) => <li key={o} className="row" style={{ gridTemplateColumns: '1fr', cursor: 'default' }}>{o}</li>)}</ul>
        </section>
      </div>
    </LayoutGroup>
  );
}

/* ================= Ask ================= */
export function Ask() {
  return <Gate>{(s) => <AskView state={s} />}</Gate>;
}
function AskView({ state }: { state: SemoraState }) {
  const { sendChat, chat, clearChat } = useSemora();
  const [params, setParams] = useSearchParams();
  const initial = params.get('q');
  useEffect(() => {
    if (initial) { void sendChat(initial); setParams((p) => { const n = new URLSearchParams(p); n.delete('q'); return n; }, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  useNav([]);
  return (
    <>
      <header className="page-head">
        <h1 className="t-title">Ask Semora</h1>
        <p className="summary">Answers come from your own synced data, with a source for every line. Follow-ups keep the thread.{chat.length > 0 && <button className="linkout" onClick={clearChat}>Start over</button>}</p>
      </header>
      <Chat state={state} autoFocus />
    </>
  );
}

export { weekdayOf };
