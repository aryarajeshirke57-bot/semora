import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useMatch } from 'react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { addDays, localDate, weekStart } from '../../engine/time';
import { Ask, Changed, CoursePage, Grades, Home, Inbox, Waiting } from './pages';
import { Money, SubSheet } from './money';
import { Connections, Courses, Dashboard, Digest, Settings, Storage } from './views';
import { AssistantPanel } from './assistant';
import { DevMenu, Detail, Palette, Toasts } from './overlays';
import { BriefSheet } from './brief';
import { Intro } from './intro';
import { useSemora } from './store';
import { Icon, hue } from './ui';

interface NavDef { to: string; icon: string; label: string; count?: number; hot?: boolean; end?: boolean }

function NavItem({ n, onGo }: { n: NavDef; onGo: () => void }) {
  return (
    <NavLink to={n.to} end={n.end} className="nav-item" data-tip={n.label} onClick={onGo}>
      {({ isActive }) => (
        <>
          {/* One highlight shared by every item: it glides to the new page instead of blinking. */}
          {isActive && <motion.span layoutId="nav-active" className="nav-active" aria-hidden="true" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
          <Icon name={n.icon} />
          <span className="label">{n.label}</span>
          {n.count ? <span className={`count ${n.hot ? 'hot' : ''}`} aria-label={`${n.count} new`}>{n.count}</span> : null}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const { state, connected, busy, scheme, setTheme, setPaletteOpen, menuOpen, setMenuOpen, compact, setCompact, setAssistantOpen } = useSemora();
  const inCourses = useMatch('/courses/*');
  const [coursesOpen, setCoursesOpen] = useState(true);
  const today = state ? localDate(state.now) : '';
  const ws = state ? weekStart(today) : '';
  const changedCount = state ? new Set(state.changes.filter((c) => c.type !== 'added' && c.type !== 'completed' && localDate(c.at) >= ws && localDate(c.at) <= addDays(ws, 6)).map((c) => c.itemId)).size : 0;
  const waiting = state ? state.items.filter((i) => (i.kind === 'promise' || i.kind === 'reply') && i.status === 'active').length : 0;
  const live = state?.connections.filter((c) => c.mode !== 'off' && c.platform !== 'openrouter' && c.status !== 'error') ?? [];
  const lastSync = state?.connections.find((c) => c.lastSync)?.lastSync;
  const minutes = state && lastSync ? Math.max(0, Math.round((Date.parse(state.now) - Date.parse(lastSync)) / 60000)) : null;
  const go = () => setMenuOpen(false);
  const groups: { label: string; items: NavDef[] }[] = [
    { label: 'Overview', items: [
      { to: '/', icon: 'dashboard', label: 'Dashboard', end: true },
      { to: '/inbox', icon: 'inbox', label: 'Inbox' },
      { to: '/digest', icon: 'digest', label: 'Daily Digest' },
      { to: '/ask', icon: 'ask', label: 'Ask Semora' },
    ] },
    { label: 'Intelligence', items: [
      { to: '/week', icon: 'week', label: 'This Week' },
      { to: '/changed', icon: 'changed', label: 'Changes', count: changedCount, hot: true },
      { to: '/waiting', icon: 'waiting', label: 'Waiting on Me', count: waiting },
      { to: '/courses', icon: 'courses', label: 'Courses' },
      { to: '/grades', icon: 'grades', label: 'Grades' },
    ] },
    { label: 'Management', items: [
      { to: '/subscriptions', icon: 'money', label: 'Subscriptions', count: state?.finance.summary.attention },
      { to: '/storage', icon: 'storage', label: 'Storage & Spam' },
    ] },
    { label: 'System', items: [
      { to: '/connections', icon: 'plug', label: 'Connections' },
      { to: '/settings', icon: 'settings', label: 'Settings' },
    ] },
  ];
  return (
    <>
      <nav className="sidebar" data-open={menuOpen} aria-label="Primary">
        <div className="brand">
          <span className="brand-mark"><Icon name="check" size={16} /></span>
          <span className="label brand-name">Semora</span>
          <button className="side-toggle" onClick={() => setCompact(!compact)} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={compact} data-tip={compact ? 'Expand' : 'Collapse'}><Icon name={compact ? 'expand' : 'collapse'} size={17} /></button>
        </div>
        <button className="nav-item search" data-tip="Search  ⌘K" onClick={() => { go(); setPaletteOpen(true); }}><Icon name="search" /> <span className="label">Search</span><span className="kbd label">⌘K</span></button>
        {groups.map((g) => (
          <div className="nav-group" role="group" aria-label={g.label} key={g.label}>
            <div className="nav-label"><span className="label">{g.label}</span></div>
            {g.items.map((n) => (
              <div key={n.to}>
                {n.to === '/ask'
                  ? <NavItem n={n} onGo={() => { go(); setAssistantOpen(false); }} />
                  : n.to === '/courses' ? (
                    <div className="nav-row">
                      <NavItem n={n} onGo={go} />
                      <button className="nav-caret label" aria-expanded={coursesOpen} aria-label={coursesOpen ? 'Hide courses' : 'Show courses'} onClick={() => setCoursesOpen(!coursesOpen)}><motion.span animate={{ rotate: coursesOpen ? 0 : -90 }} style={{ display: 'grid' }}><Icon name="chevron" size={16} /></motion.span></button>
                    </div>
                  ) : <NavItem n={n} onGo={go} />}
                {n.to === '/courses' && (
                  <AnimatePresence initial={false}>
                    {(coursesOpen || inCourses) && state && (
                      <motion.div className="nav-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                        {state.courses.map((c) => (
                          <NavLink key={c.code} to={`/courses/${c.code}`} className="nav-item sub" data-tip={`${c.code} · ${c.title}`} onClick={go}>
                            <span className="dot" style={{ background: `oklch(var(--course-l) var(--course-c) ${hue(state, c.code)})` }} /> <span className="label">{c.code}</span>
                          </NavLink>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="sync" role="status" data-tip={!state ? 'Syncing' : !connected ? 'Reconnecting' : 'In sync'}>
            <span className={`pulse ${busy ? 'syncing' : !connected && state ? 'err' : ''}`} />
            <span className="label">{!state ? 'Syncing…' : !connected ? 'Reconnecting…' : <>{minutes === null ? 'Updated' : minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`} · {live.length} of 6 sources{state.demoMode && <><br /><span className="demo-tag">Seeded demo data</span></>}</>}</span>
          </div>
          <button className="nav-item" data-tip={scheme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label={`Switch to ${scheme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(scheme === 'dark' ? 'light' : 'dark')}>
            <motion.span key={scheme} initial={{ rotate: -40, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} style={{ display: 'grid' }}><Icon name={scheme === 'dark' ? 'sun' : 'moon'} /></motion.span>
            <span className="label">{scheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </nav>
      {menuOpen && <div className="scrim" style={{ zIndex: 44 }} onClick={() => setMenuOpen(false)} />}
    </>
  );
}

const WIDE = ['/', '/storage'];

export function App() {
  const { state, itemId, subId, openItem, paletteOpen, setPaletteOpen, navIds, selected, setSelected, act, setMenuOpen, briefOpen, introOpen, assistantOpen, setAssistantOpen } = useSemora();
  const loc = useLocation();

  useEffect(() => { setSelected(null); setMenuOpen(false); }, [loc.pathname, setSelected, setMenuOpen]);
  useEffect(() => { document.title = `${{ '/': 'Dashboard', '/inbox': 'Inbox', '/digest': 'Daily Digest', '/ask': 'Ask', '/week': 'This Week', '/changed': 'Changes', '/waiting': 'Waiting on Me', '/courses': 'Courses', '/grades': 'Grades', '/subscriptions': 'Subscriptions', '/storage': 'Storage & Spam', '/connections': 'Connections', '/settings': 'Settings' }[loc.pathname] ?? 'Semora'} · Semora`; }, [loc.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!paletteOpen); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); if (loc.pathname !== '/ask') setAssistantOpen(!assistantOpen); return; }
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || paletteOpen || briefOpen || introOpen || subId || assistantOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && itemId) { openItem(null); return; }
      const idx = selected ? navIds.indexOf(selected) : -1;
      const move = (to: number) => {
        const id = navIds[Math.max(0, Math.min(navIds.length - 1, to))];
        if (!id) return;
        setSelected(id);
        document.querySelector(`[data-item="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      };
      if (e.key === 'j' || (e.key === 'ArrowDown' && !itemId)) { e.preventDefault(); move(idx + 1); }
      else if (e.key === 'k' || (e.key === 'ArrowUp' && !itemId)) { e.preventDefault(); move(idx < 0 ? 0 : idx - 1); }
      else if (e.key === 'Enter' && selected && !itemId) { e.preventDefault(); openItem(selected); }
      else if (e.key === 'e') {
        const id = itemId ?? selected;
        const item = id ? state?.items.find((i) => i.id === id) : undefined;
        if (item && item.kind !== 'event') { e.preventDefault(); void act(item.status === 'done' ? 'undo_done' : 'done', item.id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen, itemId, subId, openItem, navIds, selected, setSelected, act, state, briefOpen, introOpen, assistantOpen, setAssistantOpen, loc.pathname]);

  return (
    <LayoutGroup>
      <a href="#main" className="skip">Skip to content</a>
      <div className="app">
        <Sidebar />
        <div>
          <div className="topbar">
            <button className="btn quiet" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
            <b className="topbar-brand"><span className="brand-mark"><Icon name="check" size={14} /></span> Semora</b>
            <button className="btn quiet" aria-label="Search" onClick={() => setPaletteOpen(true)}><Icon name="search" /></button>
          </div>
          <motion.main id="main" key={loc.pathname} className="main" data-wide={WIDE.includes(loc.pathname)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/digest" element={<Digest />} />
              <Route path="/ask" element={<Ask />} />
              <Route path="/week" element={<Home />} />
              <Route path="/changed" element={<Changed />} />
              <Route path="/waiting" element={<Waiting />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/:code" element={<CoursePage />} />
              <Route path="/grades" element={<Grades />} />
              <Route path="/subscriptions" element={<Money />} />
              <Route path="/money" element={<Navigate to="/subscriptions" replace />} />
              <Route path="/storage" element={<Storage />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </motion.main>
        </div>
      </div>
      {state && <Detail state={state} />}
      {state && <SubSheet state={state} />}
      {state && <BriefSheet state={state} />}
      {state && <Intro state={state} />}
      {state && <AssistantPanel state={state} hidden={loc.pathname === '/ask'} />}
      <Palette state={state} />
      <DevMenu state={state} />
      <Toasts />
    </LayoutGroup>
  );
}
