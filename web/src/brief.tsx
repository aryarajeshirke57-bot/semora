import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { BriefLine, BriefSection, SemoraState } from '../../engine/types';
import { useSemora } from './store';
import { BorderBeam } from './fx';
import { Icon, Sources } from './ui';

const HEAD: Record<BriefSection, string> = { changed: 'Changed', soon: 'Next 48 hours', decide: 'Your call', money: 'Money', heads_up: 'Heads-up' };
const ORDER: BriefSection[] = ['changed', 'soon', 'decide', 'money', 'heads_up'];

function Line({ line, state, onOpen }: { line: BriefLine; state: SemoraState; onOpen: (id: string) => void }) {
  const { act, briefSeen } = useSemora();
  const proposal = line.proposalId ? state.proposals.find((p) => p.id === line.proposalId) : undefined;
  const isNew = line.live && briefSeen.size > 0 && !briefSeen.has(line.id);
  return (
    <motion.li layout className="brief-line" data-section={line.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
      <div className="brief-text">
        {line.parts ? (
          <span>{line.parts.map((p, k) => <span key={p.itemId}>{k > 0 && <span className="sep"> · </span>}<button className="brief-link" onClick={() => onOpen(p.itemId)}>{p.text}</button></span>)}</span>
        ) : (
          <button className="brief-link" onClick={() => line.itemId && onOpen(line.itemId)}>{line.text}</button>
        )}
        {(line.live || isNew) && <span className="chip accent" style={{ marginLeft: 8 }}>Just now</span>}
        {line.note && <span className="brief-note">{line.note}</span>}
      </div>
      <div className="brief-side">
        {line.section === 'decide' && proposal?.kind === 'move_event' ? (
          <span className="actions">
            <button className="btn primary sm" onClick={() => void act('approve', proposal.id)}>Approve</button>
            <button className="btn quiet sm" onClick={() => void act('reject', proposal.id)}>Not now</button>
          </span>
        ) : line.section === 'decide' ? (
          <button className="btn sm" onClick={() => line.itemId && onOpen(line.itemId)}>Review</button>
        ) : (
          <Sources sources={line.sources} />
        )}
      </div>
    </motion.li>
  );
}

/** The brief's sections; shared by the sheet and the Daily Digest page. */
export function BriefGroups({ state, onOpen }: { state: SemoraState; onOpen: (id: string) => void }) {
  const b = state.brief;
  return (
    <>
      {ORDER.filter((s) => b.lines.some((l) => l.section === s)).map((s, k) => (
        <motion.div key={s} className="brief-group" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + k * 0.07 }}>
          <h3>{HEAD[s]}</h3>
          <ul><AnimatePresence initial={false}>{b.lines.filter((l) => l.section === s).map((l) => <Line key={l.id} line={l} state={state} onOpen={onOpen} />)}</AnimatePresence></ul>
        </motion.div>
      ))}
    </>
  );
}

/** The Morning Brief: a one-minute read that opens once a day, then folds into a card on This week. */
export function BriefSheet({ state }: { state: SemoraState }) {
  const { briefOpen, setBriefOpen, openItem } = useSemora();
  const done = useRef<HTMLButtonElement>(null);
  const b = state.brief;
  useEffect(() => {
    if (!briefOpen) return;
    done.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setBriefOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [briefOpen, setBriefOpen]);
  const open = (id: string) => { setBriefOpen(false); openItem(id); };
  const dateLine = new Date(state.now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  return (
    <AnimatePresence>
      {briefOpen && (
        <motion.div key="brief" className="brief-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="scrim" onClick={() => setBriefOpen(false)} />
          <motion.section layoutId="brief-card" className="brief" role="dialog" aria-modal="true" aria-label="Morning brief" initial={{ y: 28, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <header className="brief-head">
              <p className="eyebrow">{dateLine} · <span className="t-mono">~{b.readSeconds} sec read</span></p>
              <h2>{b.greeting}</h2>
              <p className="brief-headline">{b.headline}</p>
            </header>
            <BriefGroups state={state} onOpen={open} />
            <footer className="brief-foot">
              <span className="t-small">{b.overflow ? `+${b.overflow} more on This week · ` : ''}every line links to its sources</span>
              <button ref={done} className="btn primary" onClick={() => setBriefOpen(false)}>Got it <Icon name="arrow" size={16} /></button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The folded brief at the top of This week. */
export function BriefCard({ state }: { state: SemoraState }) {
  const { briefOpen, setBriefOpen, briefSeen } = useSemora();
  const b = state.brief;
  const fresh = briefSeen.size ? b.lines.filter((l) => !briefSeen.has(l.id)).length : 0;
  if (briefOpen) return <div className="brief-card placeholder" aria-hidden="true" />;
  return (
    <motion.button layoutId="brief-card" className="brief-card" onClick={() => setBriefOpen(true)} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <span className="brief-card-icon"><Icon name="sun" size={16} /></span>
      <span className="brief-card-text">
        <b>Morning brief</b>
        <span className="t-small">{b.headline}</span>
      </span>
      {fresh > 0 ? <span className="chip accent">{fresh} new since your brief</span> : <span className="t-small t-mono">~{b.readSeconds} sec</span>}
      {briefSeen.size === 0 && <BorderBeam />}
    </motion.button>
  );
}
