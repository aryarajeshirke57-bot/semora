import type { SourceMessage } from '../../engine/types.ts';
import { env, getJSON, type Connector } from './types.ts';

interface CanvasCourse { id: number; course_code?: string; name?: string }
interface CanvasAnnouncement { id: number; title: string; message: string; posted_at: string; user_name?: string; html_url: string; context_code: string }
interface CanvasAssignment { id: number; name: string; due_at: string | null; html_url: string; points_possible?: number }

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const courseCode = (c: CanvasCourse) => c.course_code?.match(/\d{2}-?\d{3}/)?.[0].replace(/^(\d{2})(\d{3})$/, '$1-$2');

/** Follows Canvas's Link-header pagination. */
async function paged<T>(url: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next && out.length < 500) {
    const { data, headers }: { data: T[]; headers: Headers } = await getJSON<T[]>(next, { authorization: `Bearer ${token}` });
    out.push(...data);
    next = headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return out;
}

/** Calendar feed (.ics): no token required. Parses VEVENTs into calendar messages. */
export function parseICS(text: string): SourceMessage[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap(([, body], i) => {
    const get = (k: string) => body.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, 'm'))?.[1]?.trim();
    const iso = (v?: string) => (v && /^\d{8}T\d{6}Z?$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}${v.endsWith('Z') ? 'Z' : '-05:00'}` : undefined);
    const start = iso(get('DTSTART'));
    const end = iso(get('DTEND')) ?? start;
    const title = get('SUMMARY');
    if (!start || !end || !title) return [];
    const id = get('UID') ?? `ics-${i}`;
    return [{
      id: `canvas-ics-${id}`, source: 'canvas' as const, channel: 'calendar' as const, url: get('URL') ?? 'https://canvas.cmu.edu/calendar',
      course: title.match(/\d{2}-\d{3}/)?.[0], authorName: 'Canvas calendar', authorRole: 'system' as const, sentAt: new Date().toISOString(), subject: title,
      body: `${title}${get('LOCATION') ? ` · ${get('LOCATION')}` : ''}`,
      structured: { type: 'calendar' as const, eventId: id, title, start, end, location: get('LOCATION'), course: title.match(/\d{2}-\d{3}/)?.[0] },
    }];
  });
}

export const canvas: Connector = {
  id: 'canvas',
  label: 'Canvas',
  platform: 'canvas',
  envVars: ['CANVAS_BASE_URL', 'CANVAS_ACCESS_TOKEN', 'CANVAS_ICS_URL'],
  scopes: ['Read-only: courses, announcements, assignments, calendar'],
  configured: () => Boolean(env('CANVAS_ACCESS_TOKEN') || env('CANVAS_ICS_URL')),
  async fetchSince() {
    const messages: SourceMessage[] = [];
    const base = env('CANVAS_BASE_URL') || 'https://canvas.cmu.edu';
    const token = env('CANVAS_ACCESS_TOKEN');
    if (token) {
      const courses = await paged<CanvasCourse>(`${base}/api/v1/courses?enrollment_state=active&per_page=50`, token);
      const codes = new Map(courses.map((c) => [`course_${c.id}`, courseCode(c)]));
      const anns = await paged<CanvasAnnouncement>(`${base}/api/v1/announcements?${courses.map((c) => `context_codes[]=course_${c.id}`).join('&')}&per_page=50`, token);
      for (const a of anns) {
        messages.push({ id: `canvas-ann-${a.id}`, source: 'canvas', channel: 'announcement', url: a.html_url, course: codes.get(a.context_code), authorName: a.user_name ?? 'Instructor', authorRole: /prof|dr\./i.test(a.user_name ?? '') ? 'instructor' : 'staff', sentAt: a.posted_at, subject: a.title, body: strip(a.message) });
      }
      for (const c of courses) {
        for (const a of await paged<CanvasAssignment>(`${base}/api/v1/courses/${c.id}/assignments?per_page=50`, token)) {
          if (!a.due_at) continue;
          messages.push({ id: `canvas-asg-${a.id}`, source: 'canvas', channel: 'assignment', url: a.html_url, course: courseCode(c), authorName: 'Canvas', authorRole: 'system', sentAt: new Date().toISOString(), subject: a.name, body: a.name, structured: { type: 'assignment', title: a.name, due: a.due_at, points: a.points_possible } });
        }
      }
    }
    if (env('CANVAS_ICS_URL')) {
      const res = await fetch(env('CANVAS_ICS_URL'));
      if (!res.ok) throw new Error(`Canvas calendar feed responded ${res.status}`);
      messages.push(...parseICS(await res.text()));
    }
    return { messages };
  },
};
