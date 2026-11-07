// Two small charts, drawn by hand so they use the theme tokens and stay light. Each one has a text
// equivalent for screen readers, handles zero data, and never invents a scale.
import { useState } from 'react';
import { motion } from 'motion/react';

export interface Slice { id: string; label: string; value: number; onClick?: () => void }
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];

/** Donut with a legend. Hover or focus a row to highlight its arc. */
export function Donut({ data, title, center, unit }: { data: Slice[]; title: string; center: string; unit: string }) {
  const [hot, setHot] = useState<string | null>(null);
  const total = data.reduce((n, d) => n + d.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <figure className="chart donut" aria-label={title}>
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-labelledby="donut-t donut-d">
        <title id="donut-t">{title}</title>
        <desc id="donut-d">{total ? data.map((d) => `${d.label}: ${d.value} ${unit}`).join(', ') : `No ${unit}`}</desc>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--hover)" strokeWidth="16" />
        {total > 0 && data.map((d, i) => {
          if (!d.value) return null;
          const len = (d.value / total) * C;
          const off = acc;
          acc += len;
          return (
            <motion.circle
              key={d.id}
              cx="70" cy="70" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={hot === d.id ? 20 : 16}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"
              initial={{ opacity: 0 }} animate={{ opacity: hot && hot !== d.id ? 0.35 : 1 }} transition={{ duration: 0.25, delay: i * 0.04 }}
            >
              <title>{`${d.label}: ${d.value} ${unit}`}</title>
            </motion.circle>
          );
        })}
        <text x="70" y="68" textAnchor="middle" className="donut-n">{center}</text>
        <text x="70" y="86" textAnchor="middle" className="donut-u">{unit}</text>
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.id}>
            <button type="button" onMouseEnter={() => setHot(d.id)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(d.id)} onBlur={() => setHot(null)} onClick={d.onClick} disabled={!d.onClick}>
              <i style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
              <span>{d.label}</span>
              <b className="t-mono">{d.value}</b>
              <span className="muted t-mono">{total ? `${Math.round((d.value / total) * 100)}%` : '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export interface Bar { id: string; label: string; value: number; display: string; note?: string; onClick?: () => void }

/** Horizontal bars on a zero baseline, scaled to the largest value. */
export function Bars({ data, title, empty }: { data: Bar[]; title: string; empty: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max === 0) return <p className="t-small">{empty}</p>;
  return (
    <figure className="chart bars" aria-label={title}>
      <ul>
        {data.map((d, i) => (
          <li key={d.id}>
            <button type="button" onClick={d.onClick} disabled={!d.onClick} aria-label={`${d.label}: ${d.display}${d.note ? `, ${d.note}` : ''}`}>
              <span className="bar-label">{d.label}</span>
              <span className="bar-track" aria-hidden="true"><motion.span initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }} transition={{ duration: 0.45, delay: 0.05 + i * 0.04, ease: [0.2, 0.7, 0.2, 1] }} /></span>
              <span className="bar-value t-mono">{d.display}</span>
            </button>
          </li>
        ))}
      </ul>
    </figure>
  );
}
