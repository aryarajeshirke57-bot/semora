// Semora's newer views: Dashboard, Daily Digest, Storage & Spam, Courses, Connections, Settings.
// They only rearrange what the engine already decided; no view computes a fact of its own.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { fmtMoney, fmtPrice } from '../../engine/finance';
import { CATEGORY_LABEL } from '../../engine/health';
import { addDays, fmtDate, fmtMoment, fmtTime, fmtValue, localDate, weekStart } from '../../engine/time';
import type { Change, HealthChecklistItem, Item, SemoraState } from '../../engine/types';
import { BriefCard, BriefGroups } from './brief';
import { Bars, Donut } from './charts';
import { trialsEndingSoon, TrialAlert } from './money';
import { Gate, useNav } from './pages';
import { useSemora } from './store';
import { SEASONS, type Season } from './theme';
import { CourseTag, Empty, Icon, Morph, SourceBadge, clock, hue } from './ui';
import { BlurText, NumberTicker, spotlight } from './fx';

const stagger = (k: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay: 0.04 + k * 0.05, ease: [0.2, 0.7, 0.2, 1] as const } });
const mb = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;
const isOpen = (i: Item) => i.status !== 'done' && i.status !== 'dismissed';
const gmailLive = (s: SemoraState) => s.connections.some((c) => c.id === 'gmail' && c.mode === 'live');
const gmailSearch = (q: string) => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;

/** A Gmail search the student runs themselves. In demo mode the data isn't in their Gmail, so it's shown, not linked. */
function GmailSearch({ state, query, label = 'Search in Gmail' }: { state: SemoraState; query: string; label?: string }) {
  if (gmailLive(state)) return <a className="btn sm" href={gmailSearch(query)} target="_blank" rel="noreferrer">{label} ↗</a>;
  return <span className="gmail-q" title="Seeded demo data isn't in your Gmail. Connect Gmail to open this search."><code>{query}</code> <span className="muted">· Gmail search, live mode</span></span>;
}

/* ================= Priorities (shared by Dashboard) ================= */
interface Priority { id: string; kind: 'due' | 'decide' | 'confirm' | 'money' | 'reply'; title: string; when?: string; open: () => void; cls: string; label: string }
function priorities(state: SemoraState, openItem: (id: string) => void, go: (to: string) => void): Priority[] {
  const now = Date.parse(state.now);
  const out: Priority[] = [];
  for (const i of state.items.filter((x) => isOpen(x) && x.status === 'active' && x.at && Date.parse(x.at) > now && Date.parse(x.at) <= now + 48 * 3600_000 && ['assignment', 'exam', 'presentation', 'promise', 'task', 'reply'].includes(x.kind)).sort((a, b) => a.at!.localeCompare(b.at!)))
    out.push({ id: i.id, kind: i.kind === 'reply' || i.kind === 'promise' ? 'reply' : 'due', title: `${i.course ? `${i.course} · ` : ''}${i.title.split(' — ')[0]}`, when: fmtMoment(i.due ?? i.start), open: () => openItem(i.id), cls: '', label: i.kind === 'exam' ? 'Exam' : i.kind === 'promise' ? 'You promised' : 'Due' });
  for (const p of state.proposals.filter((x) => x.status === 'proposed' && x.kind === 'move_event'))
    out.push({ id: p.id, kind: 'decide', title: p.title.replace(/“|”/g, ''), when: `Because ${state.items.find((i) => i.id === p.itemId)?.title.split(' — ')[0]} moved`, open: () => go('/week'), cls: 'accent', label: 'Your call' });
  for (const i of state.items.filter((x) => isOpen(x) && x.status === 'needs_confirmation'))
    out.push({ id: i.id, kind: 'confirm', title: i.title, when: 'Sources disagree', open: () => openItem(i.id), cls: 'warn', label: 'Needs confirmation' });
  for (const a of state.finance.alerts.filter((x) => x.urgency >= 60 && x.subscriptionId))
    out.push({ id: a.id, kind: 'money', title: a.short, when: a.kind === 'payment_failed' ? 'Payment failed' : a.kind === 'trial_ending' ? 'Trial converts soon' : 'Subscription', open: () => openItem(a.subscriptionId!), cls: a.kind === 'payment_failed' ? 'danger' : 'warn', label: 'Billing' });
  return out;
}

function changeText(c: Change, item: Item) {
  return c.type === 'canceled' ? { from: fmtMoment(item.start), to: 'Canceled' } : c.type === 'added' ? { from: undefined, to: `Added · ${fmtMoment(item.start)}` } : { from: fmtValue(c.from as never), to: fmtValue(c.to as never) };
}

/* ================= Dashboard ================= */
export function Dashboard() {
  return <Gate>{(s) => <DashboardView state={s} />}</Gate>;
}
function DashboardView({ state }: { state: SemoraState }) {
  const { openItem } = useSemora();
  const nav = useNavigate();
  useNav([]);
  const today = localDate(state.now);
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const open = state.items.filter(isOpen);
  const due = open.filter((i) => ['assignment', 'exam', 'presentation', 'task'].includes(i.kind) && (i.due ?? i.start)?.date && (i.due ?? i.start)!.date! >= today && (i.due ?? i.start)!.date! <= we).length;
  const triggers = new Set(state.proposals.map((p) => p.itemId));
  const changes = state.changes.filter((c) => c.type !== 'completed' && c.type !== 'added' && localDate(c.at) >= ws && localDate(c.at) <= we).sort((a, b) => Number(triggers.has(b.itemId)) - Number(triggers.has(a.itemId)) || b.at.localeCompare(a.at));
  const changedItems = [...new Map(changes.map((c) => [c.itemId, c])).values()];
  const waiting = open.filter((i) => (i.kind === 'promise' || i.kind === 'reply') && i.status === 'active').length;
  const pri = priorities(state, openItem, nav);
  const since = Date.parse(state.now) - 48 * 3600_000;
  const important = state.messages.filter((m) => !m.spam && Date.parse(m.sentAt) >= since && Date.parse(m.sentAt) <= Date.parse(state.now) && (m.itemIds.length || m.subscriptionIds?.length) && ['instructor', 'ta', 'staff'].includes(m.authorRole)).slice(0, 4);
  const upcoming = open.filter((i) => i.start?.date && i.start.time && i.start.date >= today && i.start.date <= addDays(today, 3) && i.status !== 'canceled' && i.kind !== 'office_hours').sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).slice(0, 5);
  const fin = state.finance;
  const h = state.health;
  const nextRenew = fin.subscriptions.filter((s) => s.counted && s.renewsOn && s.renewsOn >= today).sort((a, b) => a.renewsOn!.localeCompare(b.renewsOn!))[0];
  const steps = h.checklist.filter((c) => !c.done).length;
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · times in ET{state.demoMode ? ' · seeded demo data' : ''}</p>
        <h1 className="t-title t-display"><BlurText text={state.brief.greeting} /></h1>
      </header>
      <ul className="stats" aria-label="At a glance">
        {([
          { n: due, label: 'due this week', to: '/week' },
          { n: changedItems.length, label: 'changed', to: '/changed', hot: changedItems.length > 0 },
          { n: waiting, label: 'waiting on you', to: '/waiting' },
          { n: fin.summary.attention, label: 'billing alerts', to: '/subscriptions', warn: fin.summary.attention > 0 },
        ] as const).map((t, k) => (
          <motion.li key={t.to} {...stagger(k)}>
            <Link to={t.to} className="stat spotlight" data-tone={'hot' in t && t.hot ? 'hot' : 'warn' in t && t.warn ? 'warn' : undefined} {...spotlight}>
              <NumberTicker className="stat-n" value={t.n} />
              <span className="stat-label">{t.label}</span>
              <span className="stat-go" aria-hidden="true">→</span>
            </Link>
          </motion.li>
        ))}
      </ul>
      <BriefCard state={state} />
      <div className="dash">
        <div className="dash-main">
          <motion.section className="group" {...stagger(0)}>
            <div className="group-head"><h2>Today's priorities</h2><span className="muted">Next 48 hours, then decisions</span></div>
            {pri.length === 0 ? <p className="t-small" style={{ padding: '12px 0' }}>Nothing urgent. A good day to get ahead.</p> : (
              <ul>{pri.slice(0, 7).map((p, k) => (
                <motion.li key={p.id} className="row pri-row" onClick={p.open} {...stagger(k)}>
                  <span className={`chip ${p.cls}`}>{p.label}</span>
                  <span className="row-main"><span className="row-title">{p.title}</span>{p.when && <span className="t-small">{p.when}</span>}</span>
                  <span className="linkout" aria-hidden="true">→</span>
                </motion.li>
              ))}</ul>
            )}
          </motion.section>

          <motion.section className="group" {...stagger(1)}>
            <div className="group-head"><h2>What changed</h2><span className="muted">and which source won</span><Link className="linkout" style={{ marginLeft: 'auto' }} to="/changed">All changes →</Link></div>
            <ul>{changedItems.slice(0, 3).map((c) => {
              const item = state.items.find((i) => i.id === c.itemId)!;
              const t = changeText(c, item);
              return (
                <li key={c.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr)' }} onClick={() => openItem(item.id)}>
                  <span className="row-main" style={{ gap: 4 }}>
                    <span className="row-sub"><CourseTag state={state} code={item.course} /><b style={{ color: 'var(--text)', fontWeight: 550 }}>{item.title.split(' — ')[0]}</b>{c.scopeNote && <span className="chip accent">Your section</span>}</span>
                    <span style={{ fontSize: 15 }}><Morph from={t.from} to={t.to} animate={false} /></span>
                    <span className="t-small">{c.byName} · {fmtDate(localDate(c.at))} — {c.reason}</span>
                  </span>
                </li>
              );
            })}</ul>
          </motion.section>

          {important.length > 0 && (
            <motion.section className="group" {...stagger(2)}>
              <div className="group-head"><h2>Important emails</h2><span className="muted">From staff, last 48 hours</span><Link className="linkout" style={{ marginLeft: 'auto' }} to="/inbox">Inbox →</Link></div>
              <ul>{important.map((m) => (
                <li key={m.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }} onClick={() => openItem(m.itemIds[0] ?? m.subscriptionIds![0])}>
                  <SourceBadge source={m.source} />
                  <span className="row-main"><span className="row-title" style={{ fontWeight: 520 }}>{m.subject ?? m.authorName}</span><span className="t-small" style={{ color: 'var(--text-2)' }}>{m.summary}</span><span className="t-small">{m.authorName}</span></span>
                  <span className="row-when">{fmtDate(localDate(m.sentAt))}</span>
                </li>
              ))}</ul>
            </motion.section>
          )}
        </div>

        <aside className="dash-side">
          {trialsEndingSoon(state).filter((s) => !s.acknowledged).slice(0, 1).map((s) => <TrialAlert key={s.id} sub={s} state={state} />)}

          <motion.section className="panel spotlight" {...stagger(1)} {...spotlight}>
            <div className="panel-head"><h2>Coming up</h2><Link className="linkout" to="/week">This week →</Link></div>
            {upcoming.length ? <ul className="mini-list">{upcoming.map((i) => (
              <li key={i.id}><span className="t-mono t-small">{fmtDate(i.start!.date!).slice(0, 3)} {fmtTime(i.start!.time!).replace(':00', '')}</span><span>{i.title.split(' — ')[0]}{i.location ? <span className="muted"> · {i.location}</span> : null}</span></li>
            ))}</ul> : <p className="t-small">Nothing on the calendar in the next three days.</p>}
          </motion.section>

          <motion.section className="panel spotlight" {...stagger(2)} {...spotlight}>
            <div className="panel-head"><h2>Subscriptions</h2><Link className="linkout" to="/subscriptions">Manage →</Link></div>
            <p className="panel-figure"><b><NumberTicker value={fin.summary.monthly} format={(n) => fmtMoney(n, 'USD')} /></b><span className="t-small"> /mo estimated · {fin.summary.counted} counted</span></p>
            {nextRenew && <p className="t-small">Next renewal: {nextRenew.name}, {fmtDate(nextRenew.renewsOn!)} · {fmtPrice(nextRenew.amount, nextRenew.currency, nextRenew.interval)}</p>}
            <Bars title="Monthly cost by subscription" empty="No counted subscriptions." data={fin.summary.breakdown.slice().sort((a, b) => b.monthly - a.monthly).slice(0, 4).map((b) => ({ id: b.subscriptionId, label: b.name.replace(/ (Premium|Individual|Student).*$/, ''), value: b.monthly, display: `${fmtMoney(b.monthly, 'USD')}`, onClick: () => openItem(b.subscriptionId) }))} />
          </motion.section>

          <motion.section className="panel spotlight" {...stagger(3)} {...spotlight}>
            <div className="panel-head"><h2>Inbox health</h2><Link className="linkout" to="/storage">Clean up →</Link></div>
            <p className="t-small">{h.total} messages · <b style={{ color: 'var(--text)' }}>{h.actionable}</b> tied to something you need to do · {h.promotional} promos · {h.spam.count} in spam</p>
            <div className="health-bar" role="img" aria-label={h.categories.map((c) => `${c.label} ${c.count}`).join(', ')}>
              {h.categories.filter((c) => c.count).map((c, k) => <motion.span key={c.id} title={`${c.label}: ${c.count}`} style={{ background: `var(--chart-${k + 1})` }} initial={{ flexGrow: 0 }} animate={{ flexGrow: c.count }} transition={{ duration: 0.5, delay: 0.1 + k * 0.04 }} />)}
            </div>
            <p className="t-small">{steps ? `${steps} step${steps > 1 ? 's' : ''} to a calmer inbox` : 'Checklist done.'}</p>
          </motion.section>
        </aside>
      </div>
    </>
  );
}

/* ================= Daily Digest ================= */
export function Digest() {
  return <Gate>{(s) => <DigestView state={s} />}</Gate>;
}
function DigestView({ state }: { state: SemoraState }) {
  const { openItem } = useSemora();
  useNav([]);
  const b = state.brief;
  const today = localDate(state.now);
  const shown = new Set(b.lines.flatMap((l) => [l.itemId, ...(l.parts?.map((p) => p.itemId) ?? []), ...l.messageIds]));
  const cal = state.items.filter((i) => isOpen(i) && i.status !== 'canceled' && i.start?.date && i.start.time && i.start.date >= today && i.start.date <= addDays(today, 1)).sort((x, y) => (x.at ?? '').localeCompare(y.at ?? ''));
  const owe = state.items.filter((i) => (i.kind === 'reply' || i.kind === 'promise') && i.status === 'active' && !shown.has(i.id));
  const since = Date.parse(state.now) - 24 * 3600_000;
  const emails = state.messages.filter((m) => !m.spam && Date.parse(m.sentAt) >= since && Date.parse(m.sentAt) <= Date.parse(state.now) && (m.itemIds.length || m.subscriptionIds?.length || m.suspicious) && !shown.has(m.id)).slice(0, 5);
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{new Date(state.now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })} · <span className="t-mono">~{b.readSeconds} sec read</span></p>
        <h1 className="t-title">Daily Digest</h1>
        <p className="summary">{b.greeting.replace(/, .*/, '')}, {state.student.name.split(' ')[0]}. {b.headline}.</p>
      </header>
      <div className="digest">
        <BriefGroups state={state} onOpen={openItem} />
        {b.overflow > 0 && <p className="t-small">+{b.overflow} more on <Link className="linkout" to="/week">This week</Link> — the brief stays a one-minute read.</p>}
      </div>
      <h2 className="digest-more">Also today</h2>
      {cal.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Calendar · today and tomorrow</h2></div>
          <ul className="mini-list">{cal.map((i) => <li key={i.id}><span className="t-mono t-small">{fmtDate(i.start!.date!).slice(0, 3)} {fmtTime(i.start!.time!)}</span><span>{i.title.split(' — ')[0]}{i.location ? <span className="muted"> · {i.location}</span> : null}{i.movedByUser && <span className="chip ok" style={{ marginLeft: 6 }}>Moved</span>}</span></li>)}</ul>
        </section>
      )}
      {owe.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Waiting on you</h2><Link className="linkout" style={{ marginLeft: 'auto' }} to="/waiting">All →</Link></div>
          <ul>{owe.map((i) => <li key={i.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} onClick={() => openItem(i.id)}><span className="row-title" style={{ fontWeight: 500 }}>{i.title}</span><span className="row-when">{i.due?.date ? `by ${fmtDate(i.due.date)}` : ''}</span></li>)}</ul>
        </section>
      )}
      {emails.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Other emails that matter · last 24 hours</h2></div>
          <ul>{emails.map((m) => <li key={m.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }} onClick={() => (m.itemIds[0] || m.subscriptionIds?.[0]) && openItem((m.itemIds[0] ?? m.subscriptionIds![0]))}><SourceBadge source={m.source} /><span className="row-main"><span className="row-title" style={{ fontWeight: 500 }}>{m.authorName}</span><span className="t-small">{m.summary}</span></span><span className="row-when">{clock(m.sentAt)}</span></li>)}</ul>
        </section>
      )}
      <p className="t-small" style={{ marginTop: 20 }}>Read/unread status isn't synced, so "since yesterday" means sent in the last 24 hours. Every line links to its sources.</p>
    </>
  );
}

/* ================= Storage & Spam ================= */
export function Storage() {
  return <Gate>{(s) => <StorageView state={s} />}</Gate>;
}
function Step({ c, state }: { c: HealthChecklistItem; state: SemoraState }) {
  const { act, openItem } = useSemora();
  const nav = useNavigate();
  return (
    <motion.li layout className="row step" data-done={c.done} style={{ gridTemplateColumns: '24px minmax(0,1fr)', cursor: 'default' }}>
      <button type="button" role="checkbox" aria-checked={c.done} aria-label={`Mark "${c.title}" done`} className="check" onClick={() => void act(c.done ? 'chk_undo' : 'chk_done', c.id)}>
        {c.done && <Icon name="check" size={14} />}
      </button>
      <div className="row-main" style={{ gap: 6 }}>
        <span className="row-title">{c.title}</span>
        <span className="t-small">{c.detail}</span>
        <span className="actions">
          {c.subscriptionId ? <button className="btn sm" onClick={() => openItem(c.subscriptionId!)}>Review</button> : c.route ? <button className="btn sm" onClick={() => nav(c.route!)}>Open</button> : null}
          {c.gmailQuery && <GmailSearch state={state} query={c.gmailQuery} />}
        </span>
      </div>
    </motion.li>
  );
}
function StorageView({ state }: { state: SemoraState }) {
  const nav = useNavigate();
  useNav([]);
  const h = state.health;
  const live = gmailLive(state);
  const spamMsgs = state.messages.filter((m) => m.spam);
  const left = h.checklist.filter((c) => !c.done).length;
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{live ? 'From Gmail · read-only' : 'Seeded demo mailbox · read-only'}</p>
        <h1 className="t-title">Storage & Spam</h1>
        <p className="summary"><span><b>{h.total}</b> messages</span><span className="sep">·</span><span><b>{h.actionable}</b> need you</span><span className="sep">·</span><span><b>{h.promotional}</b> promos</span><span className="sep">·</span><span><b>{mb(h.attachmentBytes)}</b> in large attachments</span><span className="sep">·</span><span><b>{h.spam.count}</b> in spam</span></p>
      </header>

      <div className="storage-note card">
        <h3>Storage quota</h3>
        {h.storage ? <p>{mb(h.storage.usedBytes)} of {mb(h.storage.totalBytes)} · {h.storage.source}</p> : (
          <p className="t-small">Not available. Semora reads Gmail with <code>gmail.readonly</code>, which can't see your Google storage quota, so it won't guess one. Sizes below are Gmail's own per-message estimates{live ? '' : ' (seeded for the demo)'}. Seeing the quota would need Google Drive's <code>drive.metadata.readonly</code> scope.</p>
        )}
      </div>

      <div className="dash" style={{ marginTop: 28 }}>
        <div className="dash-main">
          <section className="group">
            <div className="group-head"><h2>Steps to a calmer inbox</h2><span className="muted">{left ? `${left} left` : 'All done'}</span></div>
            <ul>{h.checklist.map((c) => <Step key={c.id} c={c} state={state} />)}</ul>
            <p className="t-small" style={{ marginTop: 10 }}>Semora can't delete, archive or unsubscribe for you: that needs <code>gmail.modify</code>, which it doesn't request. Each step opens the right place; ticking it only updates this checklist.</p>
          </section>

          <section className="group">
            <div className="group-head"><h2>Large attachments</h2><span className="muted">Over 5 MB · {mb(h.attachmentBytes)} total</span></div>
            {h.attachments.length ? <table className="tbl">
              <thead><tr><th>Email</th><th>From</th><th>Size</th></tr></thead>
              <tbody>{h.attachments.map((a) => <tr key={a.messageId}><td>{a.subject}<span className="t-small muted"> · {fmtDate(localDate(a.at))}</span></td><td>{a.from}</td><td>{mb(a.sizeBytes)}</td></tr>)}</tbody>
            </table> : <p className="t-small">No attachments over 5 MB.</p>}
          </section>

          <section className="group">
            <div className="group-head"><h2>Spam folder</h2><span className="muted">{h.spam.count} · Gmail empties spam after 30 days</span></div>
            {spamMsgs.length ? <ul>{spamMsgs.map((m) => (
              <li key={m.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto', cursor: 'default' }}>
                <span className="lead alert-ico"><Icon name="shield" size={16} /></span>
                <span className="row-main"><span className="row-title" style={{ fontWeight: 500 }}>{m.subject}</span><span className="t-small">{m.authorName} · {m.authorEmail}</span></span>
                <span className="row-when">{fmtDate(localDate(m.sentAt))}</span>
              </li>
            ))}</ul> : <Empty title="Spam is empty" />}
            {h.spam.suspiciousInInbox > 0 && <p className="t-small" style={{ marginTop: 8 }}>Plus {h.spam.suspiciousInInbox} look-alike in your inbox that Gmail missed — Semora flagged it and ignores it.</p>}
          </section>
        </div>
        <aside className="dash-side">
          <section className="panel">
            <div className="panel-head"><h2>Inbox composition</h2></div>
            <Donut title="Inbox by category" center={String(h.total)} unit="messages" data={h.categories.map((c) => ({ id: c.id, label: c.label, value: c.count, onClick: () => nav(`/inbox?cat=${c.id}`) }))} />
            <p className="t-small">Each message counted once, by its main category. Click a category to open it in Inbox.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Noisiest senders</h2></div>
            <Bars title="Emails per sender, promotions and notifications" empty="No repeat senders." data={h.promoSenders.map((s) => ({ id: s.email ?? s.name, label: s.name, value: s.count, display: String(s.count), onClick: undefined }))} />
            <p className="t-small">{CATEGORY_LABEL.noise}, last {Math.max(1, Math.round((Date.parse(h.window.to) - Date.parse(h.window.from)) / 86400_000))} days.</p>
          </section>
          {state.finance.alerts.some((a) => a.kind === 'suspicious') && (
            <section className="panel">
              <div className="panel-head"><h2>Look-alikes</h2></div>
              {state.finance.alerts.filter((a) => a.kind === 'suspicious').map((a) => <p key={a.id} className="t-small">{a.text}</p>)}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/* ================= Courses ================= */
export function Courses() {
  return <Gate>{(s) => <CoursesView state={s} />}</Gate>;
}
function CoursesView({ state }: { state: SemoraState }) {
  useNav([]);
  const today = localDate(state.now);
  return (
    <>
      <header className="page-head"><h1 className="t-title">Courses</h1><p className="summary">Everything for each class in one place: deadlines, changes, grades, staff messages.</p></header>
      <ul className="course-grid">
        {state.courses.map((c, k) => {
          const items = state.items.filter((i) => i.course === c.code && isOpen(i) && i.kind !== 'event');
          const next = items.filter((i) => (i.due ?? i.start)?.date && (i.due ?? i.start)!.date! >= today).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))[0];
          const changed = new Set(state.changes.filter((x) => x.course === c.code && x.type !== 'completed').map((x) => x.itemId)).size;
          const g = state.courseGrades.find((x) => x.course === c.code);
          return (
            <motion.li key={c.code} {...stagger(k)}>
              <Link to={`/courses/${c.code}`} className="course-card">
                <span className="row-sub"><span className="dot" style={{ background: `oklch(var(--course-l) var(--course-c) ${hue(state, c.code)})` }} /> <b style={{ color: 'var(--text)' }}>{c.code}</b>{changed > 0 && <span className="chip warn">{changed} changed</span>}</span>
                <span className="row-title">{c.title}</span>
                <span className="t-small">{c.instructor}{c.section ? ` · Section ${c.section}` : ''}</span>
                <span className="t-small">{next ? `Next: ${next.title.split(' — ')[0]} · ${fmtMoment(next.due ?? next.start)}` : 'Nothing upcoming'}</span>
                <span className="t-small">{g?.current != null ? `${g.current.toFixed(1)}% running` : 'No grades yet'}</span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </>
  );
}

/* ================= Connections ================= */
export function Connections() {
  return <Gate>{(s) => <ConnectionsView state={s} />}</Gate>;
}
function ConnectionsView({ state }: { state: SemoraState }) {
  const { toggleConnection } = useSemora();
  const [mem, setMem] = useState<{ actions: unknown[]; disabled: string[]; live: number; note: string }>();
  const [memErr, setMemErr] = useState(false);
  useEffect(() => { void fetch('/api/memory').then((r) => r.json()).then(setMem).catch(() => setMemErr(true)); }, [state.version]);
  useNav([]);
  const ago = (iso?: string) => { if (!iso) return 'never'; const m = Math.max(0, Math.round((Date.parse(state.now) - Date.parse(iso)) / 60000)); return m < 1 ? 'just now' : `${m} min ago`; };
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <header className="page-head">
        <h1 className="t-title">Connections</h1>
        <p className="summary">Reading and acting are separate permissions. Every outward action needs a tap.</p>
      </header>
      <ul>
        {state.connections.map((c) => (
          <li key={c.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto', cursor: 'default' }}>
            <SourceBadge source={c.platform} />
            <div className="row-main">
              <span className="row-title">{c.label} <span className={`chip ${c.mode === 'live' ? 'ok' : c.mode === 'demo' ? 'accent' : 'ghost'}`}>{c.mode === 'demo' ? 'Seeded demo data' : c.mode === 'live' ? 'Live' : 'Off'}</span>{c.status === 'error' && <span className="chip danger">Error</span>}</span>
              <span className="t-small">{c.scopes.join(' · ')}</span>
              <span className="t-small">{c.id === 'openrouter' ? (c.configured ? '' : 'Set OPENROUTER_API_KEY on the server to enable') : c.mode === 'off' && !c.enabled ? 'Disconnected' : `Updated ${ago(c.lastSync)} · ${c.itemCount} items`}{!c.configured && c.id !== 'openrouter' ? ` · live sync needs ${c.envVars.join(', ')}` : ''}{c.error ? ` · ${c.error}` : ''}</span>
              {(c.id === 'gmail' || c.id === 'gcal') && !c.configured && <a className="linkout" href="/auth/google">Connect with Google (read-only) ↗</a>}
            </div>
            {c.id !== 'openrouter' && <button role="switch" aria-checked={c.enabled} aria-label={`${c.label} enabled`} className="switch" onClick={() => void toggleConnection(c.id)}><motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} style={{ left: c.enabled ? 19 : 3 }} /></button>}
          </li>
        ))}
      </ul>
      <section className="group" style={{ marginTop: 36 }}>
        <div className="group-head"><h2>Permissions</h2></div>
        <ul className="perm-list">
          <li><b>Granted when you connect:</b> <code>gmail.readonly</code>, <code>calendar.readonly</code>. Canvas token or calendar feed. Gradescope, Piazza and Ed with your own login, read-only.</li>
          <li><b>Asked for only when you approve a move:</b> <code>calendar.events</code>.</li>
          <li><b>Never requested:</b> <code>gmail.send</code>, <code>gmail.modify</code> (so no deleting or archiving), payment access of any kind.</li>
        </ul>
      </section>
      <section className="group">
        <div className="group-head"><h2>What Semora remembers</h2></div>
        <p className="t-small" style={{ margin: '10px 0' }}>{memErr ? "Couldn't load this right now." : `${mem?.note ?? '…'} Right now: ${mem?.actions.length ?? 0} action${mem?.actions.length === 1 ? '' : 's'}, ${mem?.disabled.length ?? 0} source${mem?.disabled.length === 1 ? '' : 's'} switched off.`} Every derived item links back to its source messages.</p>
        <button className="btn" disabled={deleting} onClick={() => { setDeleting(true); void fetch('/api/memory', { method: 'DELETE' }).finally(() => setDeleting(false)); }}>{deleting ? 'Deleting…' : 'Delete everything Semora remembers'}</button>
      </section>
    </>
  );
}

/* ================= Settings ================= */
const SEASON_INFO: Record<Season, { label: string; swatch: string }> = {
  classic: { label: 'Classic', swatch: '#A68A73' },
  autumn: { label: 'Autumn', swatch: '#B07A52' },
  winter: { label: 'Winter', swatch: '#9C9389' },
  spring: { label: 'Spring', swatch: '#8E9D7F' },
  summer: { label: 'Summer', swatch: '#C49A5A' },
};
export function Settings() {
  return <Gate>{(s) => <SettingsView state={s} />}</Gate>;
}
function SettingsView({ state }: { state: SemoraState }) {
  const { theme, setTheme, season, setSeason, compact, setCompact, simulate, reset, setIntroOpen } = useSemora();
  const nav = useNavigate();
  useNav([]);
  return (
    <>
      <header className="page-head"><h1 className="t-title">Settings</h1><p className="summary">Appearance, layout and the demo.</p></header>
      <section className="group">
        <div className="group-head"><h2>Mode</h2></div>
        <div className="seg" role="radiogroup" aria-label="Color mode" style={{ marginTop: 12 }}>{(['system', 'light', 'dark'] as const).map((t) => <button key={t} role="radio" aria-checked={theme === t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
      </section>
      <section className="group">
        <div className="group-head"><h2>Season</h2><span className="muted">Same Semora, different light</span></div>
        <div className="season-picker" role="radiogroup" aria-label="Seasonal theme">
          {SEASONS.map((s) => (
            <button key={s} role="radio" aria-checked={season === s} className="season" onClick={() => setSeason(s)}>
              <span className="season-swatch" style={{ background: `linear-gradient(135deg, ${SEASON_INFO[s].swatch}, #F5F0E8)` }} aria-hidden="true" />
              {SEASON_INFO[s].label}
            </button>
          ))}
        </div>
      </section>
      <section className="group">
        <div className="group-head"><h2>Sidebar</h2></div>
        <label className="actions" style={{ marginTop: 12 }}>
          <button role="switch" aria-checked={compact} aria-label="Compact sidebar" className="switch" onClick={() => setCompact(!compact)}><motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} style={{ left: compact ? 19 : 3 }} /></button>
          <span>Compact (icons only, labels on hover)</span>
        </label>
      </section>
      {state.demoMode && (
        <section className="group">
          <div className="group-head"><h2>Demo</h2><span className="muted">Frozen clock: {fmtDate(localDate(state.now))}, {fmtTime('09:00')}</span></div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => void simulate()} disabled={!state.script.next}>{state.script.next ? `Simulate: ${state.script.next.label}` : 'Script finished'}</button>
            <button className="btn" onClick={() => { nav('/'); setIntroOpen(true); }}>Replay intro</button>
            <button className="btn" onClick={() => void reset()}>Reset demo</button>
          </div>
          <p className="t-small" style={{ marginTop: 8 }}>Everything in demo mode is seeded. Nothing here touches a real inbox, calendar or account.</p>
        </section>
      )}
      <section className="group">
        <div className="group-head"><h2>Where this goes</h2></div>
        <p className="t-small" style={{ marginTop: 10 }}>When many students in a course opt in, Semora becomes a shared, self-correcting source of truth: an instructor's section extension reaches every affected student, stale dates in group chats get flagged for everyone, and instructors see a confusion signal when many students hold conflicting dates for the same assignment.</p>
      </section>
    </>
  );
}
