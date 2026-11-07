import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { ActionType, AskAnswer, SemoraState } from '../../engine/types';
import { fmtValue, localDate } from '../../engine/time';

import { applyTheme, parseScheme, parseSeason, SEASON_KEY, SIDEBAR_KEY, THEME_KEY, type Season } from './theme';

export type Theme = 'system' | 'light' | 'dark';
export type { Season };
export interface Toast { id: number; title: string; body?: string }
export interface ChatTurn { id: number; question: string; answer?: AskAnswer; error?: string; pending?: boolean }

interface Ctx {
  state?: SemoraState;
  error?: string;
  connected: boolean;
  busy: boolean;
  /** Item ids changed live since this page loaded — these animate. */
  fresh: Set<string>;
  act: (type: ActionType, targetId: string, value?: string) => Promise<void>;
  simulate: () => Promise<void>;
  reset: () => Promise<void>;
  ask: (q: string) => Promise<AskAnswer>;
  toggleConnection: (id: string) => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** The scheme actually showing (system resolved). */
  scheme: 'light' | 'dark';
  season: Season;
  setSeason: (s: Season) => void;
  compact: boolean;
  setCompact: (v: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (v: boolean) => void;
  /** One conversation, shared by the assistant panel and the Ask page. */
  chat: ChatTurn[];
  sendChat: (q: string) => Promise<void>;
  retryChat: (id: number) => Promise<void>;
  clearChat: () => void;
  toasts: Toast[];
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  itemId: string | null;
  /** Opens an item, or a subscription when the id starts with "sub:". */
  openItem: (id: string | null) => void;
  subId: string | null;
  navIds: string[];
  setNavIds: (ids: string[]) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  /** Morning Brief sheet; closing it records today's brief as read. */
  briefOpen: boolean;
  setBriefOpen: (v: boolean) => void;
  /** Brief line ids present when the brief was last closed — newer ones get "new since your brief". */
  briefSeen: Set<string>;
  introOpen: boolean;
  setIntroOpen: (v: boolean) => void;
}

const C = createContext<Ctx | null>(null);
export const useSemora = () => {
  const v = useContext(C);
  if (!v) throw new Error('SemoraProvider missing');
  return v;
};

export const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  sget: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export function SemoraProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SemoraState>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => parseScheme(safe.get(THEME_KEY)));
  const [season, setSeasonState] = useState<Season>(() => parseSeason(safe.get(SEASON_KEY)));
  const [prefersDark, setPrefersDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [compact, setCompactState] = useState(() => safe.get(SIDEBAR_KEY) === 'compact');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>(() => { try { return (JSON.parse(sessionStorage.getItem('semora-chat') ?? '[]') as ChatTurn[]).filter((t) => t.answer); } catch { return []; } });
  const chatRef = useRef<ChatTurn[]>([]);
  chatRef.current = chat;
  useEffect(() => { safe.sset('semora-chat', JSON.stringify(chat.filter((t) => t.answer).slice(-20))); }, [chat]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navIds, setNavIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [briefOpen, setBriefOpenState] = useState(false);
  const [briefSeen, setBriefSeen] = useState<Set<string>>(new Set());
  const [introOpen, setIntroOpen] = useState(false);
  const decided = useRef(false);
  const [params, setParams] = useSearchParams();
  const prev = useRef<SemoraState | undefined>(undefined);
  const toastId = useRef(0);

  const toast = useCallback((title: string, body?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const apply = useCallback((next: SemoraState) => {
    const before = prev.current;
    if (before) {
      const known = new Set(before.changes.map((c) => c.id));
      const added = next.changes.filter((c) => !known.has(c.id));
      if (added.length) {
        setFresh((f) => new Set([...f, ...added.map((c) => c.itemId)]));
        for (const c of added) {
          const item = next.items.find((i) => i.id === c.itemId);
          if (c.type === 'completed') toast(`Closed: ${item?.title ?? 'item'}`, 'Semora saw the evidence in your sent mail.');
          else toast(`${item?.title ?? 'Item'} changed`, `${c.byName} · ${fmtValue(c.from as never)} → ${fmtValue(c.to as never)}`);
        }
      }
    }
    prev.current = next;
    setState(next);
    setError(undefined);
  }, [toast]);

  useEffect(() => {
    let es: EventSource | undefined;
    let cancelled = false;
    fetch('/api/state').then((r) => r.json()).then((s: SemoraState) => !cancelled && !prev.current && apply(s)).catch(() => !cancelled && setError('Could not reach the Semora server. Is `npm run dev` running?'));
    es = new EventSource('/api/events');
    es.addEventListener('state', (e) => { setConnected(true); apply(JSON.parse((e as MessageEvent).data) as SemoraState); });
    es.onerror = () => setConnected(false);
    return () => { cancelled = true; es?.close(); es = undefined; };
  }, [apply]);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => applyTheme(document.documentElement, theme, season, prefersDark), [theme, season, prefersDark]);
  const scheme: 'light' | 'dark' = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.classList.add('theming');
    setTimeout(() => document.documentElement.classList.remove('theming'), 350);
    safe.set(THEME_KEY, t);
    setThemeState(t);
  }, []);
  const setSeason = useCallback((v: Season) => {
    document.documentElement.classList.add('theming');
    setTimeout(() => document.documentElement.classList.remove('theming'), 350);
    safe.set(SEASON_KEY, v);
    setSeasonState(v);
  }, []);
  const setCompact = useCallback((v: boolean) => {
    safe.set(SIDEBAR_KEY, v ? 'compact' : 'full');
    if (v) document.documentElement.setAttribute('data-sidebar', 'compact');
    else document.documentElement.removeAttribute('data-sidebar');
    setCompactState(v);
  }, []);

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try { return await fn(); } finally { setBusy(false); }
  }, []);

  const act = useCallback(async (type: ActionType, targetId: string, value?: string) => {
    await guard(() => post('/api/actions', { type, targetId, value })).catch((e: Error) => toast('That did not go through', e.message));
  }, [guard, toast]);

  const simulate = useCallback(async () => {
    const r = await guard(() => post<{ done?: boolean }>('/api/demo/simulate')).catch(() => undefined);
    if (r?.done) toast('Script finished', 'Reset the demo to run it again.');
  }, [guard, toast]);

  const reset = useCallback(async () => {
    await guard(() => post('/api/demo/reset'));
    setFresh(new Set());
    toast('Demo reset', 'Back to the seeded state.');
  }, [guard, toast]);

  const ask = useCallback((q: string) => guard(() => post<AskAnswer>('/api/ask', { question: q })), [guard]);
  const runTurn = useCallback(async (id: number, question: string) => {
    const history = chatRef.current.filter((t) => t.answer && t.id < id).slice(-4).map((t) => ({ question: t.question, answer: [t.answer!.answer, ...t.answer!.bullets.map((b) => b.text)].join(' ').slice(0, 1000) }));
    try {
      const answer = await post<AskAnswer>('/api/ask', { question, history });
      setChat((c) => c.map((t) => (t.id === id ? { ...t, answer, pending: false, error: undefined } : t)));
    } catch (e) {
      setChat((c) => c.map((t) => (t.id === id ? { ...t, pending: false, error: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : "Semora couldn't reach its server." } : t)));
    }
  }, []);
  const sendChat = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question) return;
    const id = Date.now();
    setChat((c) => [...c, { id, question, pending: true }]);
    await runTurn(id, question);
  }, [runTurn]);
  const retryChat = useCallback(async (id: number) => {
    const t = chatRef.current.find((x) => x.id === id);
    if (!t) return;
    setChat((c) => c.map((x) => (x.id === id ? { ...x, pending: true, error: undefined } : x)));
    await runTurn(id, t.question);
  }, [runTurn]);
  const clearChat = useCallback(() => setChat([]), []);
  const toggleConnection = useCallback(async (id: string) => { await guard(() => post(`/api/connections/${id}/toggle`)); }, [guard]);

  // First load: the demo opens on the sort sequence once per session, otherwise on today's brief once per day.
  useEffect(() => {
    if (!state || decided.current) return;
    decided.current = true;
    const flag = params.get('intro');
    if (flag === '0') { safe.sset('semora-intro-done', '1'); safe.set('semora-brief-day', localDate(state.now)); return; }
    if (flag === '1' || (state.demoMode && !safe.sget('semora-intro-done') && !params.get('item') && !params.get('sub'))) { setIntroOpen(true); return; }
    if (safe.get('semora-brief-day') !== localDate(state.now) && !params.get('item') && !params.get('sub')) setBriefOpenState(true);
  }, [state, params]);

  const setBriefOpen = useCallback((v: boolean) => {
    setBriefOpenState(v);
    if (!v && prev.current) {
      safe.set('semora-brief-day', localDate(prev.current.now));
      setBriefSeen(new Set(prev.current.brief.lines.map((l) => l.id)));
    }
  }, []);

  const itemId = params.get('item');
  const subId = params.get('sub');
  const openItem = useCallback((id: string | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('item');
      n.delete('sub');
      if (id) n.set(id.startsWith('sub:') ? 'sub' : 'item', id);
      return n;
    }, { replace: false });
  }, [setParams]);

  const value = useMemo<Ctx>(() => ({
    state, error, connected, busy, fresh, act, simulate, reset, ask, toggleConnection, theme, setTheme, scheme, season, setSeason, compact, setCompact, assistantOpen, setAssistantOpen, chat, sendChat, retryChat, clearChat, toasts, paletteOpen, setPaletteOpen,
    itemId, openItem, subId, navIds, setNavIds, selected, setSelected, menuOpen, setMenuOpen, briefOpen, setBriefOpen, briefSeen, introOpen, setIntroOpen,
  }), [state, error, connected, busy, fresh, act, simulate, reset, ask, toggleConnection, theme, setTheme, scheme, season, setSeason, compact, setCompact, assistantOpen, chat, sendChat, retryChat, clearChat, toasts, paletteOpen, itemId, openItem, subId, navIds, selected, menuOpen, briefOpen, setBriefOpen, briefSeen, introOpen]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
