// The opening sequence: the real seeded inbox as a wall of cards, sorted on screen by the engine's own output
// (triage category, evidence role, item id), ending on the clear list and the Morning Brief.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { fmtMoment } from '../../engine/time';
import type { SemoraState, EvidenceRole, Item, MessageView } from '../../engine/types';
import { safe, useSemora } from './store';
import { SourceBadge, clock, conflictText, hue } from './ui';

const HIDDEN = ['grade', 'calendar', 'assignment', 'syllabus'];
const TINT: Record<string, number> = { gmail: 25, canvas: 45, piazza: 230, ed: 290, gradescope: 160, gcal: 255 };
const AUTO = [1900, 1500, 1800, 3000, 2400];
const short = (t: string) => t.split(' — ')[0];

// Small deterministic PRNG so the wall looks the same on every run.
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

function Count({ to }: { to: number }) {
  const v = useMotionValue(to);
  const text = useTransform(v, (x) => Math.round(x).toString());
  useEffect(() => { const c = animate(v, to, { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }); return () => c.stop(); }, [to, v]);
  return <motion.span className="t-mono">{text}</motion.span>;
}

const ROLE_TAG: Partial<Record<EvidenceRole, { label: string; cls: string }>> = {
  winner: { label: 'Instructor · your section — wins', cls: 'win' },
  superseded: { label: 'Replaced by the correction', cls: 'old' },
  stale: { label: 'Out of date', cls: 'old' },
  outdated: { label: 'Classmate repeating the old date', cls: 'bad' },
  question: { label: 'Question — changes nothing', cls: 'old' },
  supports: { label: 'Agrees', cls: 'old' },
  other_section: { label: 'Other sections', cls: 'old' },
  origin: { label: 'Original date', cls: 'old' },
};

export function Intro({ state }: { state: SemoraState }) {
  const { introOpen, setIntroOpen, setBriefOpen } = useSemora();
  const [phase, setPhase] = useState(0);
  const [manual, setManual] = useState(false);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const finish = useCallback(() => {
    safe.sset('semora-intro-done', '1');
    setIntroOpen(false);
    setPhase(0);
    setManual(false);
    setTimeout(() => setBriefOpen(true), 380);
  }, [setIntroOpen, setBriefOpen]);
  const next = useCallback(() => { if (phase >= 4) finish(); else setPhase(phase + 1); }, [phase, finish]);

  useEffect(() => {
    if (!introOpen || manual) return;
    const t = setTimeout(next, AUTO[phase]);
    return () => clearTimeout(t);
  }, [introOpen, manual, phase, next]);
  useEffect(() => {
    if (!introOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setManual(true); next(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [introOpen, next, finish]);

  const phone = size.w < 640;
  const model = useMemo(() => buildModel(state, phone), [state, phone]);
  const layout = useMemo(() => place(model, size.w, size.h, phone), [model, size, phone]);

  const captions = [
    { n: model.total, unit: `new messages · ${model.apps} apps`, text: `${weekday(state)}, 9:00 AM. This is ${state.student.name.split(' ')[0]}'s week.` },
    { n: model.total - model.noise, unit: 'left to read', text: `${model.noise} promos and newsletters, set aside.` },
    { n: model.stacks.length, unit: `things, mentioned ${model.mentions} times`, text: `${short(model.hero?.title ?? 'HW5')} came up ${model.heroCards.length} times. It's one assignment.` },
    { n: 1, unit: 'answer', text: "Newer isn't right. Who said it, and to whom, is." },
    { n: state.stats.needToKnow, unit: 'things you need to know', text: `${model.total} messages → ${state.stats.needToKnow} things.` },
  ];
  const cap = captions[phase];

  return (
    <AnimatePresence>
      {introOpen && (
        <motion.div className="intro" role="dialog" aria-modal="true" aria-label="How Semora sorts your week" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }} onClick={() => { setManual(true); next(); }}>
          <header className="intro-head">
            <div className="intro-count"><b><Count to={cap.n} /></b><span>{cap.unit}</span></div>
            <AnimatePresence mode="wait">
              <motion.p key={phase} className="intro-cap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>{cap.text}</motion.p>
            </AnimatePresence>
          </header>

          <div className="intro-stage">
            {model.cards.map((m) => {
              const pos = layout.get(m.id)!;
              const p = pos[phase];
              const tag = phase === 3 ? model.heroRole.get(m.id) : undefined;
              if (phase === 4 && m.id === model.heroWinner) return null;
              return (
                <motion.div
                  key={m.id}
                  layoutId={m.id === model.heroWinner ? 'intro-hero' : undefined}
                  className="intro-card"
                  data-tag={tag ? ROLE_TAG[tag]?.cls : undefined}
                  style={{ width: p.w ?? layout.cardW, ['--tint' as string]: TINT[m.source] ?? 270 }}
                  initial={{ opacity: 0, x: pos[0].x, y: pos[0].y + 24, rotate: pos[0].r }}
                  animate={{ opacity: p.o, x: p.x, y: p.y, rotate: p.r, scale: p.s ?? 1, zIndex: p.z ?? 1 }}
                  transition={{ type: 'spring', stiffness: 170, damping: 24, mass: 0.9, delay: phase === 0 ? pos.delay : p.d ?? 0 }}
                >
                  <SourceBadge source={m.source} />
                  <span className="intro-card-text">
                    <b>{m.authorName}{tag && <span className="intro-when"> · {clock(m.sentAt)}</span>}</b>
                    <span>{tag && model.heroQuote.get(m.id) ? `“${model.heroQuote.get(m.id)}”` : m.subject || m.summary}</span>
                    {tag && ROLE_TAG[tag] && <motion.em initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>{ROLE_TAG[tag]!.label}</motion.em>}
                  </span>
                </motion.div>
              );
            })}

            {phase === 2 && model.stacks.map((s, k) => {
              const at = layout.stacks[k];
              return (
                <motion.span key={s.item.id} className="intro-stack-label" style={{ left: at.x, top: at.y + layout.cardH + 14, width: layout.cardW }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 + k * 0.03 }}>
                  {short(s.item.title)}{s.cards.length > 1 && <b> ×{s.cards.length}</b>}
                </motion.span>
              );
            })}

            {phase === 4 && (
              <div className="intro-list" style={{ left: layout.listX, top: layout.listY, width: layout.listW }}>
                {model.clear.map((i, k) => (
                  <motion.div key={i.id} layoutId={i.id === model.hero?.id ? 'intro-hero' : undefined} className="intro-row" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i.id === model.hero?.id ? 0 : 0.15 + k * 0.05 }}>
                    <span className="dot" style={{ background: i.course ? `oklch(var(--course-l) var(--course-c) ${hue(state, i.course)})` : 'var(--line-strong)' }} />
                    <span className="intro-row-title">{short(i.title)}</span>
                    {i.status === 'needs_confirmation' ? <span className="chip warn">Needs confirmation</span> : i.changeIds.length > 0 ? <span className="chip warn">Changed</span> : null}
                    <span className="intro-row-when">{i.status === 'needs_confirmation' ? conflictText(i) : fmtMoment(i.due ?? i.start)}</span>
                  </motion.div>
                ))}
                {state.stats.needToKnow > model.clear.length && <motion.p className="t-small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>+{state.stats.needToKnow - model.clear.length} more · {state.stats.deduped} duplicates folded away</motion.p>}
              </div>
            )}
          </div>

          <footer className="intro-foot" onClick={(e) => e.stopPropagation()}>
            <span className="intro-dots" aria-hidden="true">{AUTO.map((_, k) => <i key={k} data-on={k <= phase} />)}</span>
            <span className="t-small"><span className="kbd">space</span> next · <span className="kbd">esc</span> skip</span>
            <button className="btn quiet" onClick={finish}>Skip</button>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function weekday(state: SemoraState) {
  return new Date(state.now).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
}

interface Stack { item: Item; cards: MessageView[] }
function buildModel(state: SemoraState, phone: boolean) {
  const all = state.messages.filter((m) => !HIDDEN.includes(m.channel));
  const items = new Map(state.items.map((i) => [i.id, i]));
  const primary = (m: MessageView) => m.itemIds.map((id) => items.get(id)).find((i) => i && i.kind !== 'event' && i.kind !== 'opportunity');
  const isNoise = (m: MessageView) => m.categories.length === 1 && m.categories[0] === 'noise';
  const hero = items.get('item:15-122:hw5') ?? state.items.find((i) => i.changeIds.length);

  const groups = new Map<string, Stack>();
  for (const m of all) {
    const it = primary(m);
    if (!it || isNoise(m)) continue;
    (groups.get(it.id) ?? groups.set(it.id, { item: it, cards: [] }).get(it.id)!).cards.push(m);
  }
  const stacks = [...groups.values()].sort((a, b) => (a.item.id === hero?.id ? -1 : b.item.id === hero?.id ? 1 : b.cards.length - a.cards.length)).slice(0, phone ? 6 : 10);
  const stacked = new Set(stacks.flatMap((s) => s.cards.map((c) => c.id)));
  // Oldest first, so "newer" visibly sits at the bottom and still loses.
  const heroCards = [...(stacks.find((s) => s.item.id === hero?.id)?.cards ?? [])].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const heroQuote = new Map(heroCards.map((c) => [c.id, hero!.evidence.find((e) => e.messageId === c.id)?.quote ?? '']));
  const heroRole = new Map<string, EvidenceRole>(heroCards.map((c) => [c.id, hero!.evidence.find((e) => e.messageId === c.id)?.role ?? 'supports']));
  const heroWinner = heroCards.find((c) => heroRole.get(c.id) === 'winner')?.id;

  const budget = phone ? 34 : 84;
  const rest = all.filter((m) => !stacked.has(m.id));
  const r = rng(7);
  const filler = rest.map((m) => ({ m, k: r() })).sort((a, b) => a.k - b.k).slice(0, Math.max(0, budget - stacked.size)).map((x) => x.m);
  const cards = [...all.filter((m) => stacked.has(m.id)), ...filler];

  const clear = state.items
    .filter((i) => i.kind !== 'event' && i.status !== 'done' && i.status !== 'dismissed' && i.status !== 'canceled' && i.kind !== 'office_hours')
    .sort((a, b) => (a.status === 'needs_confirmation' ? -1 : b.status === 'needs_confirmation' ? 1 : (a.at ?? '9').localeCompare(b.at ?? '9')))
    .slice(0, phone ? 6 : 8);
  if (hero && !clear.some((i) => i.id === hero.id)) clear[clear.length - 1] = hero;

  return {
    cards,
    stacks,
    hero,
    heroCards,
    heroRole,
    heroQuote,
    heroWinner,
    clear,
    total: all.length,
    noise: all.filter(isNoise).length,
    mentions: stacks.reduce((n, s) => n + s.cards.length, 0),
    apps: new Set(state.messages.map((m) => m.source)).size,
    isNoise,
    stacked,
  };
}

interface Pose { x: number; y: number; r: number; o: number; s?: number; z?: number; d?: number; w?: number }
type Poses = Pose[] & { delay: number };

function place(model: ReturnType<typeof buildModel>, W: number, H: number, phone: boolean) {
  const cardW = phone ? 150 : 210;
  const cardH = phone ? 44 : 52;
  const top = phone ? 150 : 170;
  const usableH = H - top - 70;
  const r = rng(42);
  const out = new Map<string, Poses>();

  // Phase 0: a dense, overlapping wall that fills the screen.
  const cols = Math.max(2, Math.floor((W - 32) / (cardW * 0.78)));
  const rows = Math.ceil(model.cards.length / cols);
  const stepX = (W - 32 - cardW) / Math.max(1, cols - 1);
  const stepY = Math.min(cardH * 1.05, (usableH - cardH) / Math.max(1, rows - 1));
  const slots = model.cards.map((_, k) => k).sort(() => r() - 0.5);

  // Phase 2: stacks in a centered grid, the hero first.
  const sCols = phone ? 2 : 5;
  const gapX = phone ? 20 : 34;
  const gapY = phone ? 64 : 78;
  const sRows = Math.ceil(model.stacks.length / sCols);
  const gridW = sCols * cardW + (sCols - 1) * gapX;
  const gx = (W - gridW) / 2;
  const gy = top + Math.max(10, (usableH - (sRows * cardH + (sRows - 1) * gapY)) / 2 - 20);
  const stacks = model.stacks.map((_, k) => ({ x: gx + (k % sCols) * (cardW + gapX), y: gy + Math.floor(k / sCols) * (cardH + gapY) }));

  // Phase 3: the hero stack fans out in the middle.
  const fanW = Math.min(W - 32, phone ? 358 : 520);
  const fx = (W - fanW) / 2;
  const fanH = model.heroCards.length * (cardH + 22);
  const fy = top + Math.max(0, (usableH - fanH) / 2);

  const listW = Math.min(W - 32, 600);
  model.cards.forEach((m, k) => {
    const slot = slots[k];
    const wall: Pose = { x: 16 + (slot % cols) * stepX + (r() - 0.5) * 18, y: top + Math.floor(slot / cols) * stepY + (r() - 0.5) * 10, r: (r() - 0.5) * 7, o: 1 };
    const noise = model.isNoise(m);
    const out1: Pose = noise ? { ...wall, y: wall.y + 90, o: 0, s: 0.9, d: r() * 0.35 } : wall;
    const si = model.stacks.findIndex((s) => s.cards.some((c) => c.id === m.id));
    let p2: Pose;
    let p3: Pose;
    if (si >= 0) {
      const depth = model.stacks[si].cards.findIndex((c) => c.id === m.id);
      p2 = { x: stacks[si].x + depth * 4, y: stacks[si].y + depth * 4, r: (depth % 3 - 1) * 2.2, o: 1, z: 10 + depth, d: depth * 0.04 + si * 0.02 };
      const hi = model.heroCards.findIndex((c) => c.id === m.id);
      p3 = hi >= 0
        ? { x: fx, y: fy + hi * (cardH + 22), r: 0, o: 1, s: 1, z: 30, w: fanW, d: hi * 0.08 }
        : { ...p2, o: 0.08, s: 0.92, z: 1 };
    } else {
      p2 = noise ? out1 : { ...wall, o: 0.07, s: 0.96 };
      p3 = { ...p2, o: 0 };
    }
    const p4: Pose = { ...p3, o: 0, s: 0.94 };
    const poses = [wall, out1, p2, p3, p4] as Poses;
    poses.delay = Math.min(0.9, (slot / model.cards.length) * 0.9);
    out.set(m.id, poses);
  });
  return Object.assign(out, { cardW, cardH, stacks, listW, listX: (W - listW) / 2, listY: top + 6 });
}
