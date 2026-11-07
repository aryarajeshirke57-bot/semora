import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { fmtDate, fmtMoment, fmtValue, localDate } from '../../engine/time';
import type { SemoraState } from '../../engine/types';
import { useSemora } from './store';
import { CourseTag, EvidenceList, Icon, ProposalCard, Sources, LABEL, Morph, CHANGE_TYPES, clock, conflictText, sourceCount } from './ui';

/* ================= Item detail (shared-element sheet) ================= */
export function Detail({ state }: { state: SemoraState }) {
  const { itemId, openItem, act } = useSemora();
  const item = state.items.find((i) => i.id === itemId);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (item) closeRef.current?.focus(); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = item ? state.changes.filter((c) => c.itemId === item.id && c.type !== 'completed') : [];
  const props = item ? state.proposals.filter((p) => p.itemId === item.id || p.targetId === item.id) : [];
  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div key="scrim" className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => openItem(null)} />
          <motion.aside key="sheet" className="sheet" role="dialog" aria-modal="true" aria-label={item.title} initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 48, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <span className="row-sub"><CourseTag state={state} code={item.course} />{item.status === 'needs_confirmation' && <span className="chip warn">Needs confirmation</span>}{item.status === 'canceled' && <span className="chip danger">Canceled</span>}{item.status === 'done' && <span className="chip ok">Done</span>}</span>
              <button ref={closeRef} className="btn quiet" aria-label="Close details" onClick={() => openItem(null)}><Icon name="close" /> <span className="kbd">esc</span></button>
            </div>
            <motion.h2 layoutId={`title-${item.id}`}>{item.title}</motion.h2>
            <dl className="kv">
              {item.due && <><dt>Due</dt><dd><b>{fmtMoment(item.due)}</b></dd></>}
              {item.conflict && <><dt>Due</dt><dd><b>{conflictText(item)}</b> <span className="muted">— unconfirmed</span></dd></>}
              {item.start && <><dt>When</dt><dd><b>{fmtMoment(item.start)}{item.end?.time ? ` – ${fmtMoment({ time: item.end.time })}` : ''}</b></dd></>}
              {item.location && <><dt>Where</dt><dd>{item.location}</dd></>}
              {item.scopeNote && <><dt>Applies to</dt><dd>{item.scopeNote.replace(/^Applies to /, '')}</dd></>}
              <dt>Sources</dt><dd><span className="row-sub"><Sources sources={item.sources} /> {sourceCount(item)} source{sourceCount(item) === 1 ? '' : 's'}{item.evidence.length > sourceCount(item) ? ` + ${item.evidence.length - sourceCount(item)} related` : ''} · {item.sources.map((s) => LABEL[s]).join(', ')}</span></dd>
            </dl>
            <div className="card">
              <h3>Why Semora believes this</h3>
              <p style={{ fontSize: 14 }}>{item.reason}</p>
            </div>
            {changes.length > 0 && (
              <section>
                <div className="group-head"><h2>What changed</h2></div>
                {changes.map((c) => (
                  <div key={c.id} className="row" style={{ gridTemplateColumns: '1fr', cursor: 'default' }}>
                    <div style={{ fontSize: 16 }}>{c.type === 'canceled' ? <Morph from={fmtMoment(item.start)} to="Canceled" animate={false} /> : c.type === 'added' ? <b>Added</b> : <Morph from={fmtValue(c.from as never)} to={fmtValue(c.to as never)} animate={false} />}</div>
                    <p className="t-small">{c.byName} · {LABEL[c.source]} · {fmtDate(localDate(c.at))}, {clock(c.at)}{CHANGE_TYPES.has(c.type) ? '' : ''}</p>
                  </div>
                ))}
              </section>
            )}
            {props.length > 0 && <section className="stack">{props.map((p) => <ProposalCard key={p.id} proposal={p} state={state} />)}</section>}
            <section>
              <div className="group-head"><h2>Evidence</h2><span className="muted">Every line links to its source</span></div>
              <EvidenceList item={item} state={state} />
            </section>
            {item.kind !== 'event' && (
              <div className="actions">
                <button className="btn primary" onClick={() => void act(item.status === 'done' ? 'undo_done' : 'done', item.id)}>{item.status === 'done' ? 'Mark not done' : 'Mark done'} <span className="kbd">e</span></button>
                <button className="btn quiet" onClick={() => { void act('dismiss', item.id); openItem(null); }}>Dismiss</button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ================= Command palette ================= */
interface Cmd { id: string; group: string; label: string; hint?: string; run: () => void }
export function Palette({ state }: { state: SemoraState | undefined }) {
  const { paletteOpen, setPaletteOpen, openItem, simulate, reset, theme, setTheme, setBriefOpen, setIntroOpen, setAssistantOpen, sendChat } = useSemora();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => { setPaletteOpen(false); setQ(''); setSel(0); };
  useEffect(() => { if (paletteOpen) setTimeout(() => inputRef.current?.focus(), 30); }, [paletteOpen]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (path: string) => () => { close(); nav(path); };
    const list: Cmd[] = [
      { id: 'v-brief', group: 'Go to', label: 'Morning brief', hint: state ? `~${state.brief.readSeconds} sec read` : undefined, run: () => { close(); setBriefOpen(true); } },
      { id: 'v-dash', group: 'Go to', label: 'Dashboard', run: go('/') },
      { id: 'v-inbox', group: 'Go to', label: 'Inbox', run: go('/inbox') },
      { id: 'v-digest', group: 'Go to', label: 'Daily Digest', run: go('/digest') },
      { id: 'v-ask', group: 'Go to', label: 'Ask Semora', hint: '⌘J', run: () => { close(); setAssistantOpen(true); } },
      { id: 'v-week', group: 'Go to', label: 'This Week', run: go('/week') },
      { id: 'v-changed', group: 'Go to', label: 'Changes', run: go('/changed') },
      { id: 'v-wait', group: 'Go to', label: 'Waiting on Me', run: go('/waiting') },
      { id: 'v-courses', group: 'Go to', label: 'Courses', run: go('/courses') },
      { id: 'v-grades', group: 'Go to', label: 'Grades', run: go('/grades') },
      { id: 'v-money', group: 'Go to', label: 'Subscriptions', hint: state ? `~$${state.finance.summary.monthly.toFixed(2)}/mo est.` : undefined, run: go('/subscriptions') },
      { id: 'v-storage', group: 'Go to', label: 'Storage & Spam', run: go('/storage') },
      { id: 'v-connections', group: 'Go to', label: 'Connections', run: go('/connections') },
      { id: 'v-settings', group: 'Go to', label: 'Settings', run: go('/settings') },
      ...(state?.courses.map((c) => ({ id: `c-${c.code}`, group: 'Courses', label: `${c.code} · ${c.title}`, run: go(`/courses/${c.code}`) })) ?? []),
      ...(state?.items.filter((i) => i.kind !== 'event').map((i) => ({ id: i.id, group: 'Items', label: i.title, hint: `${i.course ?? ''} ${fmtMoment(i.due ?? i.start)}`.trim(), run: () => { close(); openItem(i.id); } })) ?? []),
      ...(state?.finance.subscriptions.map((sb) => ({ id: sb.id, group: 'Subscriptions', label: sb.name, hint: sb.status.replace(/_/g, ' '), run: () => { close(); openItem(sb.id); } })) ?? []),
      { id: 'a-sim', group: 'Actions', label: state?.script.next ? `Simulate incoming message: ${state.script.next.label}` : 'Simulate incoming message (script finished)', run: () => { close(); void simulate(); } },
      { id: 'a-reset', group: 'Actions', label: 'Reset demo', run: () => { close(); void reset(); } },
      { id: 'a-intro', group: 'Actions', label: 'Replay intro: watch Semora sort the inbox', run: () => { close(); nav('/'); setIntroOpen(true); } },
      { id: 'a-theme', group: 'Actions', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, run: () => { close(); setTheme(theme === 'dark' ? 'light' : 'dark'); } },
    ];
    return list;
  }, [state, nav, openItem, simulate, reset, theme, setTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = t ? cmds.filter((c) => `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(t)) : cmds.filter((c) => c.group !== 'Items' && c.group !== 'Subscriptions');
    const ask: Cmd[] = t.length > 2 ? [{ id: 'ask', group: 'Ask', label: `Ask Semora: “${q.trim()}”`, run: () => { const question = q.trim(); close(); setAssistantOpen(true); void sendChat(question); } }] : [];
    return [...hits.slice(0, 12), ...ask];
  }, [cmds, q, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run(); }
    else if (e.key === 'Escape') close();
  };
  let last = '';
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div className="pal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="scrim" onClick={close} />
          <motion.div className="pal" role="dialog" aria-modal="true" aria-label="Command palette" initial={{ y: -12, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 520, damping: 36 }} style={{ position: 'relative', zIndex: 61 }}>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Jump to a course, item or view — or ask a question" aria-label="Command palette search" role="combobox" aria-expanded="true" aria-controls="pal-list" />
            <div className="pal-list" id="pal-list" role="listbox">
              {filtered.map((c, i) => {
                const head = c.group !== last ? <div key={`g-${c.group}`} className="pal-group">{c.group}</div> : null;
                last = c.group;
                return (
                  <div key={c.id}>
                    {head}
                    <button className="pal-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={c.run}>{c.label}{c.hint && <span className="hint">{c.hint}</span>}</button>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="pal-group">No matches</div>}
            </div>
            <div className="pal-foot"><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">↵</span> open</span><span><span className="kbd">esc</span> close</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ================= Toasts + dev menu ================= */
export function Toasts() {
  const { toasts } = useSemora();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout className="toast" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
            <b>{t.title}</b>{t.body && <span>{t.body}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function DevMenu({ state }: { state: SemoraState | undefined }) {
  const { simulate, reset, busy, itemId, subId, setIntroOpen, introOpen, briefOpen } = useSemora();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!state?.demoMode || itemId || subId || introOpen || briefOpen) return null;
  return (
    <div className="dev">
      <AnimatePresence>
        {open && (
          <motion.div className="dev-pop" initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}>
            <button disabled={!state.script.next || busy} onClick={() => void simulate()}>
              <b>{state.script.next ? 'Simulate incoming message' : 'Script finished'}</b>
              <small>{state.script.next ? `${state.script.index + 1}/${state.script.total} · ${state.script.next.description}` : 'Reset to run it again'}</small>
            </button>
            <button onClick={() => { setOpen(false); nav('/'); setIntroOpen(true); }}><b>Replay intro</b><small>Watch {state.stats.messagesIn} messages become {state.stats.needToKnow} things</small></button>
            <button onClick={() => void reset()}><b>Reset demo</b><small>Restore the seeded state</small></button>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="dev-pill" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="bolt" size={14} /><span className="dev-label">Demo {state.script.index}/{state.script.total}</span></button>
    </div>
  );
}
