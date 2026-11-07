// Money: recurring commitments Semora found in billing email. Estimates with evidence, never bank data,
// and every button here either opens something or records what *you* said. Nothing is canceled or paid from here.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { fmtMoney, fmtPrice } from '../../engine/finance';
import { addDays, fmtDate, localDate } from '../../engine/time';
import type { SemoraState, FinanceAlert, FinanceAlertKind, Subscription, SubscriptionStatus } from '../../engine/types';
import { useSemora } from './store';
import { NumberTicker } from './fx';
import { Empty, ErrorState, Icon, Morph, Skeleton, SourceBadge, clock } from './ui';

export const SUB_STATUS: Record<SubscriptionStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: '' },
  renewal_soon: { label: 'Renews soon', cls: 'accent' },
  trial: { label: 'Free trial', cls: 'warn' },
  payment_failed: { label: 'Payment failed', cls: 'danger' },
  price_changed: { label: 'Price changed', cls: 'warn' },
  cancel_pending: { label: 'Cancel pending', cls: 'warn' },
  canceled: { label: 'Canceled', cls: 'ghost' },
  needs_confirmation: { label: 'Needs confirmation', cls: 'warn' },
};
const CERT: Record<Subscription['certainty'], string> = { confirmed: 'Stated by the merchant', inferred: 'Inferred from repeat charges', unverified: 'Unverified', user: 'Confirmed by you' };
const ALERT_CHIP: Record<FinanceAlertKind, { label: string; cls: string }> = {
  payment_failed: { label: 'Payment failed', cls: 'danger' },
  trial_ending: { label: 'Trial ending', cls: 'warn' },
  suspicious: { label: 'Ignored · look-alike', cls: 'danger' },
  price_increase: { label: 'Price up', cls: 'warn' },
  renewal_soon: { label: 'Renews soon', cls: 'accent' },
  cancel_pending: { label: 'Cancel pending', cls: 'warn' },
  needs_confirmation: { label: 'Needs confirmation', cls: 'warn' },
  cancel_confirmed: { label: 'Canceled', cls: 'ok' },
};
const LIVE: SubscriptionStatus[] = ['active', 'renewal_soon', 'price_changed', 'payment_failed'];
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function Mark({ name }: { name: string }) {
  return <span className="badge mark" aria-hidden="true">{name.replace(/[^A-Za-z0-9]/g, '')[0]?.toUpperCase()}</span>;
}

const price = (s: Subscription) =>
  s.status === 'trial' ? `Free → ${fmtPrice(s.trialThen?.amount, s.trialThen?.currency, s.trialThen?.interval)}` : s.conflict ? s.conflict.options.map((o) => o.label).join(' or ') : fmtPrice(s.amount, s.currency, s.interval);

function nextLine(s: Subscription) {
  if (s.status === 'trial' && s.trialEnds) return `Trial ends ${fmtDate(s.trialEnds)}`;
  if (s.status === 'canceled') return s.accessUntil ? `Access until ${fmtDate(s.accessUntil)}` : 'Canceled';
  if (s.renewsOn) return `Renews ${fmtDate(s.renewsOn)}`;
  return 'No renewal date stated';
}

function useMoneyNav() {
  const { setNavIds } = useSemora();
  useEffect(() => setNavIds([]), [setNavIds]);
}

/* ================= Money view ================= */
type Filter = 'all' | 'active' | 'renewing' | 'trials' | 'price' | 'failed' | 'canceled' | 'confirm';
const FILTERS: { id: Filter; label: string; test: (s: Subscription, today: string) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: (s) => LIVE.includes(s.status) },
  { id: 'renewing', label: 'Renewing soon', test: (s, t) => Boolean(s.renewsOn && LIVE.includes(s.status) && s.renewsOn >= t && s.renewsOn <= addDays(t, 7)) },
  { id: 'trials', label: 'Trials', test: (s) => s.status === 'trial' },
  { id: 'price', label: 'Price changes', test: (s) => Boolean(s.priceChange) },
  { id: 'failed', label: 'Failed payments', test: (s) => s.status === 'payment_failed' },
  { id: 'canceled', label: 'Canceled', test: (s) => s.status === 'canceled' },
  { id: 'confirm', label: 'Needs confirmation', test: (s) => s.status === 'needs_confirmation' || s.status === 'cancel_pending' },
];

export function Money() {
  const { state, error } = useSemora();
  useMoneyNav();
  if (error && !state) return <ErrorState message={error} />;
  if (!state) return <Skeleton />;
  return <MoneyView state={state} />;
}

function MoneyView({ state }: { state: SemoraState }) {
  const { openItem } = useSemora();
  const [filter, setFilter] = useState<Filter>('all');
  const [how, setHow] = useState(false);
  const fin = state.finance;
  const today = localDate(state.now);
  const subs = fin.subscriptions.filter((s) => s.userAction !== 'dismissed');
  const dismissed = fin.subscriptions.filter((s) => s.userAction === 'dismissed');
  const attention = fin.alerts.filter((a) => a.urgency >= 60 && a.kind !== 'trial_ending');
  const upcoming = subs
    .flatMap((s) => [
      ...(s.status === 'trial' && s.trialEnds && s.trialEnds >= today ? [{ s, date: s.trialEnds, what: `Trial ends · then ${fmtPrice(s.trialThen?.amount, s.trialThen?.currency, s.trialThen?.interval)}`, trial: true }] : []),
      ...(LIVE.includes(s.status) && s.renewsOn && s.renewsOn >= today && s.renewsOn <= addDays(today, 30) ? [{ s, date: s.renewsOn, what: fmtPrice(s.amount, s.currency, s.interval), trial: false }] : []),
    ])
    .sort((a, b) => a.date.localeCompare(b.date));
  const shown = subs.filter((s) => FILTERS.find((f) => f.id === filter)!.test(s, today));
  const sum = fin.summary;
  const emailCount = new Set(fin.subscriptions.flatMap((s) => s.messageIds)).size;

  if (!fin.subscriptions.length && !fin.purchases.length) {
    return (
      <>
        <header className="page-head"><h1 className="t-title">Subscriptions</h1><p className="summary">Recurring commitments Semora finds in your billing email.</p></header>
        <Empty title="No subscriptions found">When receipts, renewal notices or trial emails arrive, they show up here — with the email they came from.</Empty>
      </>
    );
  }

  return (
    <LayoutGroup>
      <header className="page-head">
        <p className="eyebrow">From {emailCount} billing emails · estimates, not bank records</p>
        <h1 className="t-title">Subscriptions</h1>
        <div className="money-figure">
          <span className="big"><NumberTicker value={sum.monthly} format={(n) => fmtMoney(n, 'USD')} /></span>
          <span className="t-small">a month, estimated · <b className="t-mono" style={{ color: 'var(--text)' }}>{fmtMoney(sum.annual, 'USD')}</b> a year</span>
        </div>
        <p className="summary">
          <span><b>{sum.counted}</b> counted</span><span className="sep">·</span>
          <span><b>{sum.renewingSoon}</b> renewing in 7 days</span><span className="sep">·</span>
          <span><b>{sum.attention}</b> need attention</span><span className="sep">·</span>
          <button className="linkout" onClick={() => setHow(!how)} aria-expanded={how}>{how ? 'Hide the math' : 'How is this calculated?'}</button>
        </p>
      </header>

      <AnimatePresence initial={false}>
        {how && (
          <motion.section className="card" style={{ overflow: 'hidden', marginBottom: 28 }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <h3>How the estimate is built</h3>
            <table className="tbl">
              <thead><tr><th>Subscription</th><th>Billed</th><th>Per month</th></tr></thead>
              <tbody>
                {sum.breakdown.map((b) => <tr key={b.subscriptionId}><td><button className="linkout" style={{ color: 'var(--text)' }} onClick={() => openItem(b.subscriptionId)}>{b.name}</button></td><td>{fmtPrice(b.amount, 'USD', b.interval)}{b.interval === 'yearly' ? ' ÷ 12' : b.interval === 'weekly' ? ' × 52 ÷ 12' : b.interval === 'quarterly' ? ' ÷ 3' : ''}</td><td>{fmtMoney(Math.round(b.monthly * 100) / 100, 'USD')}</td></tr>)}
                <tr><td><b>Total</b></td><td /><td><b>{fmtMoney(sum.monthly, 'USD')}</b></td></tr>
              </tbody>
            </table>
            {sum.excluded.length > 0 && <p className="t-small"><b style={{ color: 'var(--text-2)' }}>Not counted:</b> {sum.excluded.map((e) => `${e.name} (${e.reason.charAt(0).toLowerCase()}${e.reason.slice(1)})`).join(' · ')}.</p>}
            <p className="t-small">Only subscriptions an email confirms are counted, in USD at the price that applies now. Semora reads your email; it can't see your bank or card.</p>
          </motion.section>
        )}
      </AnimatePresence>

      {trialsEndingSoon(state).map((t) => <TrialAlert key={t.id} sub={t} state={state} />)}

      {attention.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Needs attention</h2><span className="muted">{attention.length}</span></div>
          <ul>{attention.map((a, i) => <AlertRow key={a.id} alert={a} state={state} index={i} />)}</ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Next 30 days</h2><span className="muted">Dates the emails state</span></div>
          <ul>
            {upcoming.map(({ s, date, what, trial }, i) => (
              <motion.li key={`${s.id}-${date}`} className="row money-up" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.25) }} onClick={() => openItem(s.id)}>
                <span className="t-mono money-date">{fmtDate(date)}</span>
                <span className="row-title" style={{ fontWeight: 500 }}>{s.name}</span>
                <span className="row-when">{trial ? <span className="chip warn">{what}</span> : what}</span>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      <section className="group">
        <div className="group-head"><h2>Subscriptions</h2><span className="muted">{subs.length} found · {sum.counted} counted</span></div>
        <div className="tabs" style={{ marginTop: 14 }}>
          {FILTERS.map((f) => { const n = subs.filter((s) => f.test(s, today)).length; return <button key={f.id} className="tab" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}<span className="n">{n}</span></button>; })}
        </div>
        {shown.length === 0 && <Empty title="Nothing here">No subscriptions match this filter.</Empty>}
        <ul>
          <AnimatePresence initial>
            {shown.map((s, i) => <SubRow key={s.id} sub={s} state={state} index={i} />)}
          </AnimatePresence>
        </ul>
      </section>

      {fin.purchases.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>One-time purchases</h2><span className="muted">Not subscriptions · not in the estimate</span></div>
          <ul>{fin.purchases.map((p) => { const m = state.messages.find((x) => x.id === p.messageId); return (
            <li key={p.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto', cursor: 'default' }}>
              <Mark name={p.merchant} />
              <div className="row-main"><span className="row-title" style={{ fontWeight: 500 }}>{m?.subject ?? p.merchant}</span><span className="row-sub">{p.merchant} · {fmtDate(localDate(p.at))}{m && <a className="linkout" href={m.url} target="_blank" rel="noreferrer">Open email ↗</a>}</span></div>
              <span className="row-when">{fmtMoney(p.amount, p.currency)}</span>
            </li>
          ); })}</ul>
        </section>
      )}

      {dismissed.length > 0 && <p className="t-small">{dismissed.length} marked "not a subscription": {dismissed.map((s, k) => <span key={s.id}>{k > 0 && ', '}<button className="linkout" onClick={() => openItem(s.id)}>{s.name}</button></span>)}</p>}
      <p className="t-small" style={{ marginTop: 24 }}>Semora reads billing email with read-only access. It never cancels, pays or submits anything — buttons here open the merchant's own page or record what you tell it.</p>
    </LayoutGroup>
  );
}

function AlertRow({ alert, state, index }: { alert: FinanceAlert; state: SemoraState; index: number }) {
  const { openItem } = useSemora();
  const meta = ALERT_CHIP[alert.kind];
  const m = state.messages.find((x) => x.id === alert.messageIds[0]);
  const open = () => (alert.subscriptionId ? openItem(alert.subscriptionId) : undefined);
  return (
    <motion.li className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr)', cursor: alert.subscriptionId ? 'pointer' : 'default' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} onClick={open}>
      <span className={`lead alert-ico ${meta.cls}`}><Icon name={alert.kind === 'suspicious' ? 'shield' : 'money'} size={18} /></span>
      <div className="row-main" style={{ gap: 5 }}>
        <span className="row-title" style={{ fontWeight: 520 }}>{alert.text}</span>
        <span className="row-sub"><span className={`chip ${meta.cls}`}>{meta.label}</span>{m && <span>{m.authorName} · {fmtDate(localDate(m.sentAt))}</span>}{alert.subscriptionId ? <span className="linkout">Why? →</span> : m && <span className="t-small">Sent from {m.authorEmail?.split('@')[1]}</span>}</span>
      </div>
    </motion.li>
  );
}

export function SubRow({ sub: s, state, index }: { sub: Subscription; state: SemoraState; index: number }) {
  const { openItem } = useSemora();
  const st = SUB_STATUS[s.status];
  const n = s.messageIds.length;
  void state;
  return (
    <motion.li layout="position" data-sub={s.id} className={`row ${s.status === 'canceled' ? 'canceled' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.22 } }} transition={{ delay: Math.min(index * 0.03, 0.3) }} onClick={() => openItem(s.id)}>
      <div className="lead"><Mark name={s.merchant} /></div>
      <div className="row-main">
        <motion.span layoutId={`sub-title-${s.id}`} className="row-title">{s.name}</motion.span>
        <span className="row-sub">
          {s.status !== 'active' && <span className={`chip ${st.cls}`}>{st.label}</span>}
          {!s.counted && s.status !== 'canceled' && <span className="chip ghost">Not counted</span>}
          <span>{nextLine(s)}</span>
          <span><SourceBadge source="gmail" /> {n} email{n === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div className="row-when">
        <span style={{ color: 'var(--text)', fontWeight: 550 }}>{price(s)}</span>
        {s.counted && s.interval && s.interval !== 'monthly' && s.monthly !== undefined && <span className="t-small">≈ {fmtMoney(s.monthly, 'USD')}/mo</span>}
      </div>
    </motion.li>
  );
}

/* ================= Subscription sheet ================= */
export function SubSheet({ state }: { state: SemoraState }) {
  const { subId, openItem, act } = useSemora();
  const s = state.finance.subscriptions.find((x) => x.id === subId);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); if (s) closeRef.current?.focus(); }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); openItem(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [s, openItem]);
  const byId = new Map(state.messages.map((m) => [m.id, m]));
  const st = s ? SUB_STATUS[s.status] : undefined;
  const latest = s ? byId.get(s.messageIds.at(-1)!) : undefined;
  return (
    <AnimatePresence>
      {s && st && (
        <>
          <motion.div key="scrim" className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => openItem(null)} />
          <motion.aside key="sheet" className="sheet" role="dialog" aria-modal="true" aria-label={s.name} initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 48, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <span className="row-sub"><Mark name={s.merchant} /> {s.merchant}<span className={`chip ${st.cls || 'ok'}`}>{st.label}</span></span>
              <button ref={closeRef} className="btn quiet" aria-label="Close details" onClick={() => openItem(null)}><Icon name="close" /> <span className="kbd">esc</span></button>
            </div>
            <motion.h2 layoutId={`sub-title-${s.id}`}>{s.name}</motion.h2>
            <dl className="kv">
              <dt>Price</dt><dd><b>{price(s)}</b>{s.priceChange && s.priceChange.from !== undefined && <span className="muted"> · was {fmtPrice(s.priceChange.from, s.currency, s.interval)}</span>}</dd>
              {s.monthly !== undefined && s.interval !== 'monthly' && <><dt>Per month</dt><dd>≈ {fmtMoney(s.monthly, s.currency)} <span className="muted">({fmtMoney(s.amount, s.currency)} ÷ 12)</span></dd></>}
              {s.status === 'trial' && s.trialEnds && <><dt>Trial ends</dt><dd><b>{fmtDate(s.trialEnds)}</b></dd></>}
              {s.renewsOn && <><dt>Renews</dt><dd>{fmtDate(s.renewsOn)}</dd></>}
              {s.accessUntil && <><dt>Access until</dt><dd>{fmtDate(s.accessUntil)}</dd></>}
              <dt>In estimate</dt><dd>{s.counted ? `Yes · ${fmtMoney(s.monthly, 'USD')}/mo` : `No — ${s.excludedReason?.charAt(0).toLowerCase()}${s.excludedReason?.slice(1)}`}</dd>
              <dt>Confidence</dt><dd>{CERT[s.certainty]}</dd>
              <dt>Sources</dt><dd><span className="row-sub"><SourceBadge source="gmail" /> {s.messageIds.length} email{s.messageIds.length === 1 ? '' : 's'} · last {latest ? fmtDate(localDate(latest.sentAt)) : ''}</span></dd>
            </dl>

            <div className="card">
              <h3>Why Semora believes this</h3>
              <p style={{ fontSize: 14 }}>{s.reason}</p>
              {s.priceChange && s.priceChange.from !== undefined && <div style={{ fontSize: 16 }}><Morph from={fmtPrice(s.priceChange.from, s.currency, s.interval)} to={fmtPrice(s.priceChange.to, s.currency, s.interval)} animate={false} /></div>}
            </div>

            {s.conflict && (
              <div className="card warn">
                <h3>Which is right?</h3>
                <p className="t-small">Both came from {s.merchant}. Pick the one that matches your account, or check with {s.merchant}.</p>
                {s.conflict.options.map((o) => { const m = byId.get(o.messageId); return (
                  <div key={o.messageId} className="actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <div><b>{o.label}</b><p className="t-small">{m?.subject} · {m ? fmtDate(localDate(m.sentAt)) : ''}</p></div>
                    <button className="btn" onClick={() => void act('fin_confirm', s.id, o.messageId)}>This one</button>
                  </div>
                ); })}
              </div>
            )}

            <section>
              <div className="group-head"><h2>History</h2><span className="muted">Oldest first</span></div>
              <ol className="fin-history">
                {s.events.map((e) => (
                  <li key={e.id} data-dup={Boolean(e.duplicateOf)}>
                    <span className="t-mono t-small">{fmtDate(localDate(e.at))}</span>
                    <span><b style={{ fontWeight: 550 }}>{e.note}</b>{e.amount !== undefined && <span className="muted"> · {fmtPrice(e.amount, e.currency, e.type === 'charge' ? undefined : e.interval)}</span>}{e.date && e.type !== 'charge' && <span className="muted"> · {fmtDate(e.date)}</span>}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <div className="group-head"><h2>Evidence</h2><span className="muted">Every line links to its email</span></div>
              <div className="evidence">
                {s.events.map((e) => { const m = byId.get(e.messageId); if (!m) return null; return (
                  <div key={e.id} className={`ev ${e.duplicateOf ? 'dim-soft' : ''}`}>
                    <SourceBadge source="gmail" />
                    <div>
                      <div className="ev-head"><b>{m.authorName}</b><span className="muted">{m.authorEmail}</span><span className="t-small">{fmtDate(localDate(m.sentAt))} · {clock(m.sentAt)}</span></div>
                      <blockquote>{e.quote}</blockquote>
                      <p className="ev-note">{e.note}</p>
                      <a className="linkout" href={m.url} target="_blank" rel="noreferrer">Open in Gmail ↗</a>
                    </div>
                  </div>
                ); })}
              </div>
            </section>

            <section className="card">
              <h3>Manage</h3>
              <div className="actions">
                {s.manageUrl ? <a className="btn primary" href={s.manageUrl} target="_blank" rel="noreferrer">Open {host(s.manageUrl)} <Icon name="ext" size={15} /></a> : <span className="t-small">No account link from {s.merchant}'s own domain in these emails.</span>}
                {latest && <a className="btn" href={latest.url} target="_blank" rel="noreferrer">Open latest email ↗</a>}
              </div>
              {s.unverifiedLinks.length > 0 && <p className="t-small"><Icon name="shield" size={14} /> Not offered as buttons (not on {s.merchant}'s domain): {s.unverifiedLinks.map(host).join(', ')}</p>}
              <div className="actions" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                {s.status !== 'canceled' && s.status !== 'cancel_pending' && <button className="btn" onClick={() => void act('fin_cancel_requested', s.id)}>I asked to cancel</button>}
                {s.status !== 'canceled' && (confirming
                  ? <><span className="t-small">Only if {s.merchant} has canceled it.</span><button className="btn primary" onClick={() => { setConfirming(false); void act('fin_canceled', s.id); }}>Yes, mark canceled</button><button className="btn quiet" onClick={() => setConfirming(false)}>Back</button></>
                  : <button className="btn" onClick={() => setConfirming(true)}>Mark canceled…</button>)}
                {s.status === 'needs_confirmation' && !s.conflict && <button className="btn" onClick={() => void act('fin_confirm', s.id)}>It's still active</button>}
                {s.userAction !== 'dismissed' && <button className="btn quiet" onClick={() => void act('fin_dismiss', s.id)}>Not a subscription</button>}
                {s.userAction && <button className="btn quiet" onClick={() => void act('fin_undo', s.id)}>Undo my changes</button>}
              </div>
              <p className="t-small">Semora never cancels, pays or submits anything. These only record what you tell it; a cancellation counts as confirmed when {s.merchant}'s email arrives.</p>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ================= Pieces for Changed and Waiting on me ================= */
export function MoneyChanges({ state }: { state: SemoraState }) {
  const { openItem } = useSemora();
  const changes = state.finance.changes;
  if (!changes.length) return null;
  const byId = new Map(state.messages.map((m) => [m.id, m]));
  const LABEL: Record<string, { l: string; c: string }> = { price: { l: 'Price', c: 'warn' }, canceled: { l: 'Canceled', c: 'ok' }, payment_failed: { l: 'Payment failed', c: 'danger' }, trial_started: { l: 'Trial', c: 'warn' }, cancel_requested: { l: 'Cancel requested', c: 'warn' }, conflict: { l: 'Needs confirmation', c: 'warn' } };
  return (
    <section className="group" style={{ marginTop: 32 }}>
      <div className="group-head"><h2>Subscriptions & billing</h2><span className="muted">From billing email · last 45 days</span></div>
      <ul>
        {changes.map((c, i) => { const s = state.finance.subscriptions.find((x) => x.id === c.subscriptionId)!; const m = byId.get(c.messageIds.at(-1)!); return (
          <motion.li key={c.id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr)' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }} onClick={() => openItem(s.id)}>
            <div className="row-main" style={{ gap: 6, padding: '2px 0' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <span className="row-sub" style={{ gap: 8 }}><Mark name={s.merchant} /><b style={{ color: 'var(--text)', fontWeight: 550 }}>{s.name}</b><span className={`chip ${LABEL[c.type].c}`}>{LABEL[c.type].l}</span></span>
                <span className="linkout">Why? →</span>
              </div>
              <div style={{ fontSize: 16 }}><Morph from={c.from} to={c.to ?? ''} animate={false} /></div>
              <p className="t-small">{c.text} · {m ? `${m.authorName}, ${fmtDate(localDate(m.sentAt))}` : ''}</p>
            </div>
          </motion.li>
        ); })}
      </ul>
    </section>
  );
}

export function MoneyDecisions({ state }: { state: SemoraState }) {
  const { openItem } = useSemora();
  const rows = state.finance.alerts.filter((a) => a.subscriptionId && (a.kind === 'payment_failed' || a.kind === 'trial_ending'));
  if (!rows.length) return null;
  return (
    <section className="group" style={{ marginTop: 32 }}>
      <div className="group-head"><h2>Subscriptions · needs a decision</h2><span className="muted">Nothing happens unless you act</span></div>
      <ul>{rows.map((a) => (
        <li key={a.id} className="row" style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }} onClick={() => openItem(a.subscriptionId!)}>
          <span className={`lead alert-ico ${ALERT_CHIP[a.kind].cls}`}><Icon name="money" /></span>
          <span className="row-title" style={{ fontWeight: 500 }}>{a.text}</span>
          <span className="row-when"><span className="linkout">Review →</span></span>
        </li>
      ))}</ul>
    </section>
  );
}

/* ================= Free-trial alert ================= */
function remaining(now: string, date: string) {
  const end = Date.parse(`${date}T23:59:00-05:00`);
  const h = Math.max(0, Math.round((end - Date.parse(now)) / 3600_000));
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} left`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}${h % 24 ? ` ${h % 24} h` : ''} left`;
}

/** "Your free trial may convert to a paid subscription soon." Every button opens something real or records what you said. */
export function TrialAlert({ sub: s, state }: { sub: Subscription; state: SemoraState }) {
  const { openItem, act } = useSemora();
  const src = state.messages.find((m) => m.id === s.events.find((e) => e.type === 'trial')?.messageId);
  if (s.acknowledged) {
    return (
      <div className="trial-alert done" role="status">
        <span className="t-small"><b style={{ color: 'var(--text-2)' }}>{s.name}</b> trial acknowledged{s.trialEnds ? ` · ends ${fmtDate(s.trialEnds)}` : ''}{s.followUp ? ' · following up' : ''}</span>
        <button className="btn quiet sm" onClick={() => void act('fin_undo', s.id)}>Undo</button>
      </div>
    );
  }
  return (
    <motion.section className="trial-alert" aria-label={`${s.name} free trial`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <p className="trial-head"><Icon name="money" size={16} /> Your free trial may convert to a paid subscription soon.</p>
      <dl className="trial-facts">
        <div><dt>Service</dt><dd>{s.name}</dd></div>
        <div><dt>Expected charge</dt><dd>{fmtPrice(s.trialThen?.amount, s.trialThen?.currency, s.trialThen?.interval)}</dd></div>
        <div><dt>Trial ends</dt><dd>{s.trialEnds ? fmtDate(s.trialEnds) : 'Not stated'}</dd></div>
        <div><dt>Time left</dt><dd className="t-mono">{s.trialEnds ? remaining(state.now, s.trialEnds) : '—'}</dd></div>
      </dl>
      <p className="t-small">Source: {src ? <a className="linkout" href={src.url} target="_blank" rel="noreferrer">“{src.subject}” · {src.authorName}, {fmtDate(localDate(src.sentAt))} ↗</a> : 'trial email'}</p>
      <div className="actions">
        <button className="btn primary sm" onClick={() => openItem(s.id)}>Review subscription</button>
        {s.manageUrl ? <a className="btn sm" href={s.manageUrl} target="_blank" rel="noreferrer">Open {host(s.manageUrl)} ↗</a> : <span className="t-small">No verified cancellation link in the email</span>}
        <button className="btn sm" aria-pressed={Boolean(s.followUp)} onClick={() => void act('fin_follow', s.id)}>{s.followUp ? '✓ Following up' : 'Mark for follow-up'}</button>
        <button className="btn quiet sm" onClick={() => void act('fin_ack', s.id)}>Acknowledge</button>
      </div>
      <p className="t-small">Semora won't cancel anything. Opening the link isn't a cancellation — it counts once {s.merchant}'s confirmation email arrives.</p>
    </motion.section>
  );
}

export const trialsEndingSoon = (state: SemoraState) =>
  state.finance.subscriptions.filter((s) => s.status === 'trial' && s.trialEnds && s.trialEnds >= localDate(state.now) && s.trialEnds <= addDays(localDate(state.now), 7) && s.userAction !== 'dismissed');
