// Semora's few signature effects. Each is adapted from a well-known open-source pattern and rebuilt on
// Semora's own tokens and Motion (no Tailwind, no new runtime dependency; see PLAN.md decision 13):
//   NumberTicker  ← Magic UI "Number Ticker"   (counts settle into place)
//   BlurText      ← React Bits "Blur Text"     (headline words focus in)
//   spotlight     ← React Bits "Spotlight Card" (a warm light follows the pointer)
//   BorderBeam    ← Magic UI "Border Beam"     (one slow light travels the edge of what's new)
// Every effect is decorative: text content, roles and click targets are unchanged, and all of them
// stand still under prefers-reduced-motion.
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

/** Counts from 0 to `value` once it scrolls into view. The final text is always the exact number. */
export function NumberTicker({ value, format = (n) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (n) => format(n));
  useEffect(() => {
    if (!inView) return;
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { type: 'spring', stiffness: 70, damping: 18, restDelta: 0.001 });
    return () => c.stop();
  }, [inView, value, reduce, mv]);
  return <motion.span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</motion.span>;
}

/** Splits a string into words that rise and come into focus one after another. The text itself is unchanged. */
export function BlurText({ text, delay = 0, step = 0.07 }: { text: string; delay?: number; step?: number }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, k) => (
        <motion.span
          key={`${w}-${k}`}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          initial={{ opacity: 0, y: '0.35em', filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, delay: delay + k * step, ease: [0.2, 0.7, 0.2, 1] }}
        >{k < words.length - 1 ? `${w} ` : w}</motion.span>
      ))}
    </>
  );
}

/** A surface whose border and wash brighten under the pointer: spread the result onto any element with class `spotlight`.
 *  Writes CSS variables directly, so moving the pointer never re-renders React. */
export const spotlight = {
  onPointerMove: (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  },
};

/** A single light that travels around the parent's rounded border. The parent needs `position: relative`. */
export function BorderBeam({ duration = 9, delay = 0 }: { duration?: number; delay?: number }) {
  return <span className="beam" aria-hidden="true" style={{ '--beam-dur': `${duration}s`, '--beam-delay': `${delay}s` } as CSSProperties} />;
}
