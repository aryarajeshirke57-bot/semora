import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { LocalMoment } from './types.ts';

export const TZ = 'America/New_York';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Local calendar date (YYYY-MM-DD) of an instant, in the student's time zone. */
export function localDate(iso: string | Date, tz = TZ): string {
  return formatInTimeZone(typeof iso === 'string' ? new Date(iso) : iso, tz, 'yyyy-MM-dd');
}

export function localTime(iso: string | Date, tz = TZ): string {
  return formatInTimeZone(typeof iso === 'string' ? new Date(iso) : iso, tz, 'HH:mm');
}

export function toMoment(iso: string, tz = TZ): LocalMoment {
  return { date: localDate(iso, tz), time: localTime(iso, tz) };
}

/** A LocalMoment with a date → absolute ISO instant (UTC). Missing time defaults to end of day. */
export function momentToISO(m: LocalMoment | undefined, tz = TZ, defaultTime = '23:59'): string | undefined {
  if (!m?.date) return undefined;
  return fromZonedTime(`${m.date}T${m.time ?? defaultTime}:00`, tz).toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function weekdayIndex(name: string): number {
  const n = name.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((w) => w.startsWith(n));
}

export function monthIndex(name: string): number {
  const n = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(n));
}

/** Next date on/after `from` that falls on weekday `wd`. */
export function nextWeekday(from: string, wd: number, allowSameDay = true): string {
  const cur = weekdayOf(from);
  let delta = (wd - cur + 7) % 7;
  if (delta === 0 && !allowSameDay) delta = 7;
  return addDays(from, delta);
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function compareMoment(a?: LocalMoment, b?: LocalMoment): boolean {
  // Two moments agree when every part both of them know is equal.
  if (!a || !b) return false;
  if (a.date && b.date && a.date !== b.date) return false;
  if (a.time && b.time && a.time !== b.time) return false;
  return Boolean((a.date && b.date) || (a.time && b.time));
}

/** Merge a partial update onto a known value: a time-only update keeps the known date. */
export function mergeMoment(base: LocalMoment | undefined, update: LocalMoment): LocalMoment {
  return { date: update.date ?? base?.date, time: update.time ?? (update.date && update.date !== base?.date ? undefined : base?.time) };
}

export function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(date: string): string {
  const [, mo, d] = date.split('-').map(Number);
  return `${SHORT_DAYS[weekdayOf(date)]} ${SHORT_MONTHS[mo - 1]} ${d}`;
}

/** "Fri Nov 13, 11:59 PM" / "Fri Nov 13" / "7:30 PM". */
export function fmtMoment(m?: LocalMoment): string {
  if (!m) return '';
  if (m.date && m.time) return `${fmtDate(m.date)}, ${fmtTime(m.time)}`;
  if (m.date) return fmtDate(m.date);
  if (m.time) return fmtTime(m.time);
  return '';
}

export function fmtValue(v: LocalMoment | string | undefined): string {
  if (v === undefined) return '';
  return typeof v === 'string' ? v : fmtMoment(v);
}

/** "Thu Nov 12, 7:00–10:00 PM" for an ISO range. */
export function fmtRange(startISO: string, endISO: string, tz = TZ): string {
  const s = toMoment(startISO, tz);
  const e = toMoment(endISO, tz);
  return `${fmtDate(s.date!)}, ${fmtTime(s.time!).replace(/ (AM|PM)$/, (sfx) => (fmtTime(e.time!).endsWith(sfx.trim()) ? '' : sfx))}–${fmtTime(e.time!)}`;
}

export function isoAt(date: string, time: string, tz = TZ): string {
  return fromZonedTime(`${date}T${time}:00`, tz).toISOString();
}
