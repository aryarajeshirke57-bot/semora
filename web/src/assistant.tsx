// Ask Semora: one conversation, shown as a slide-over panel anywhere or as the full Ask page.
// Answers come from /api/ask (deterministic handlers first, the LLM only when a key is set).
// Drafts are text to copy or open in Gmail's compose window; Semora itself never sends anything.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import type { AskAnswer, SemoraState } from '../../engine/types';
import { useSemora, type ChatTurn } from './store';
import { Icon, SourceBadge } from './ui';

const SUGGEST = ['What should I prioritize today?', 'Which assignment deadline is correct?', 'What did I miss?', 'What emails need replies?', 'How much am I spending monthly?', 'Did my last payment to Adobe go through?'];
const BASIS: Record<string, string> = { estimate: 'Estimate', inference: "Semora's judgment" };

function Draft({ draft }: { draft: NonNullable<AskAnswer['draft']> }) {
  const [copied, setCopied] = useState(false);
  const compose = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(draft.to.join(','))}&su=${encodeURIComponent(draft.subject ?? '')}&body=${encodeURIComponent(draft.body)}`;
  return (
    <div className="chat-draft">
      <p className="t-small">Draft{draft.to.length ? ` · to ${draft.to.join(', ')}` : ''}{draft.subject ? ` · ${draft.subject}` : ''}</p>
      <pre>{draft.body}</pre>
      <div className="actions">
        <button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(draft.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}><Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}</button>
        <a className="btn sm quiet" href={compose} target="_blank" rel="noreferrer">Open in Gmail compose ↗</a>
      </div>
      <p className="t-small">Nothing is sent unless you press Send in Gmail yourself.</p>
    </div>
  );
}

function Answer({ a, state }: { a: AskAnswer; state: SemoraState }) {
  const { openItem } = useSemora();
  const msgById = new Map(state.messages.map((m) => [m.id, m]));
  return (
    <div className="chat-answer">
      {a.answer && <p className="chat-lead">{a.answer}</p>}
      {a.bullets.length > 0 && (
        <ul>
          {a.bullets.map((b, i) => (
            <motion.li key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2) }}>
              <span>{b.text}{b.basis && BASIS[b.basis] && <span className="chip ghost basis">{BASIS[b.basis]}</span>}</span>
              {b.citations.length > 0 && (
                <span className="row-sub">
                  {b.citations.map((c, k) => {
                    const m = c.messageId ? msgById.get(c.messageId) : undefined;
                    if (c.itemId || c.subscriptionId) return <button key={k} className="chip accent" onClick={() => openItem((c.itemId ?? c.subscriptionId)!)}>{c.label}</button>;
                    return m ? <a key={k} className="chip" href={m.url} target="_blank" rel="noreferrer"><SourceBadge source={m.source} /> {(m.subject ?? m.authorName).slice(0, 48)}</a> : null;
                  })}
                </span>
              )}
            </motion.li>
          ))}
        </ul>
      )}
      {a.draft && <Draft draft={a.draft} />}
      <p className="t-small chat-mode">{a.mode === 'llm' ? `Answered by ${state.llm.smart} over your reconciled data` : 'Answered from your reconciled data · no AI model involved'}</p>
    </div>
  );
}

function Turn({ t, state }: { t: ChatTurn; state: SemoraState }) {
  const { retryChat } = useSemora();
  return (
    <motion.div className="chat-turn" layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <p className="chat-q">{t.question}</p>
      {t.pending && <div className="chat-wait" role="status" aria-label="Semora is thinking"><i /><i /><i /></div>}
      {t.error && (
        <div className="chat-error" role="alert">
          <span>{t.error}</span>
          <button className="btn sm" onClick={() => void retryChat(t.id)}>Retry</button>
        </div>
      )}
      {t.answer && <Answer a={t.answer} state={state} />}
    </motion.div>
  );
}

export function Chat({ state, autoFocus }: { state: SemoraState; autoFocus?: boolean }) {
  const { chat, sendChat, connected } = useSemora();
  const [q, setQ] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const busy = chat.some((t) => t.pending);
  useEffect(() => { if (autoFocus) setTimeout(() => input.current?.focus(), 60); }, [autoFocus]);
  const lastAnswer = chat.at(-1)?.answer;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [chat.length, lastAnswer]);
  const submit = (text = q) => { if (!text.trim() || busy || !connected) return; setQ(''); void sendChat(text); };
  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {chat.length === 0 && (
          <div className="chat-empty">
            <p className="chat-lead">Ask about your week, your courses, your inbox or your subscriptions. Every answer points to its sources.</p>
            <div className="row-sub">{SUGGEST.map((s) => <button key={s} className="chip ghost" onClick={() => submit(s)} disabled={!connected}>{s}</button>)}</div>
          </div>
        )}
        {chat.map((t) => <Turn key={t.id} t={t} state={state} />)}
        <div ref={end} />
      </div>
      {!connected && <p className="chat-offline" role="status">Reconnecting to Semora — answers need the server.</p>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea ref={input} rows={1} value={q} placeholder={chat.length ? 'Ask a follow-up…' : 'Ask Semora…'} aria-label="Ask Semora" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} maxLength={600} />
        <button className="btn primary" type="submit" disabled={!q.trim() || busy || !connected} aria-label="Send question"><Icon name="send" size={16} /></button>
      </form>
    </div>
  );
}

/** Slide-over panel, available on every page except Ask itself. */
export function AssistantPanel({ state, hidden }: { state: SemoraState; hidden: boolean }) {
  const { assistantOpen, setAssistantOpen, clearChat, chat, introOpen, briefOpen, itemId, subId } = useSemora();
  const nav = useNavigate();
  useEffect(() => {
    if (!assistantOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAssistantOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [assistantOpen, setAssistantOpen]);
  if (hidden) return null;
  return (
    <>
      <AnimatePresence>
        {!assistantOpen && !introOpen && !briefOpen && !itemId && !subId && (
          <motion.button key="fab" className="ask-fab" onClick={() => setAssistantOpen(true)} initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} whileTap={{ scale: 0.96 }} aria-label="Ask Semora">
            <Icon name="ask" size={16} /><span className="fab-label">Ask Semora</span><span className="kbd fab-label">⌘J</span>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {assistantOpen && (
          <>
            <motion.div key="scrim" className="scrim assistant-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAssistantOpen(false)} />
            <motion.aside key="panel" className="assistant" role="dialog" aria-modal="true" aria-label="Ask Semora" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
              <header className="assistant-head">
                <span className="row-title"><Icon name="ask" size={16} /> Ask Semora</span>
                <span className="actions">
                  {chat.length > 0 && <button className="btn quiet sm" onClick={clearChat}>Clear</button>}
                  <button className="btn quiet sm" onClick={() => { setAssistantOpen(false); nav('/ask'); }}>Full page</button>
                  <button className="btn quiet sm" aria-label="Close assistant" onClick={() => setAssistantOpen(false)}><Icon name="close" size={16} /></button>
                </span>
              </header>
              <Chat state={state} autoFocus />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
