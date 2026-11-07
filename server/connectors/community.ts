import type { SourceMessage } from '../../engine/types.ts';
import { env, type Connector } from './types.ts';

// Gradescope, Piazza and Ed have no official public API. Each connector is isolated so that a breaking
// change upstream only turns that source's status red; the others keep syncing. They read only the
// signed-in student's own data.

const jar = (res: Response) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

export const gradescope: Connector = {
  id: 'gradescope',
  label: 'Gradescope',
  platform: 'gradescope',
  envVars: ['GRADESCOPE_EMAIL', 'GRADESCOPE_PASSWORD'],
  scopes: ['Your own courses, assignments and scores (read-only, your login)'],
  configured: () => Boolean(env('GRADESCOPE_EMAIL') && env('GRADESCOPE_PASSWORD')),
  async fetchSince() {
    const page = await fetch('https://www.gradescope.com/login');
    const token = (await page.text()).match(/name="authenticity_token" value="([^"]+)"/)?.[1];
    if (!token) throw new Error('Gradescope login page changed');
    const login = await fetch('https://www.gradescope.com/login', {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar(page) },
      body: new URLSearchParams({ authenticity_token: token, 'session[email]': env('GRADESCOPE_EMAIL'), 'session[password]': env('GRADESCOPE_PASSWORD'), 'session[remember_me]': '0', commit: 'Log In' }),
    });
    const cookie = jar(login);
    if (!cookie.includes('signed_token')) throw new Error('Gradescope rejected the login');
    const home = await (await fetch('https://www.gradescope.com/account', { headers: { cookie } })).text();
    const messages: SourceMessage[] = [];
    for (const [, id, code] of home.matchAll(/href="\/courses\/(\d+)"[\s\S]*?courseBox--shortname">([^<]+)</g)) {
      const html = await (await fetch(`https://www.gradescope.com/courses/${id}`, { headers: { cookie } })).text();
      const course = code.match(/\d{2}-?\d{3}/)?.[0].replace(/^(\d{2})(\d{3})$/, '$1-$2');
      for (const row of html.matchAll(/<a[^>]*href="\/courses\/\d+\/assignments\/(\d+)[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?submissionStatus--score">\s*([\d.]+)\s*\/\s*([\d.]+)/g)) {
        messages.push({ id: `gs-${row[1]}`, source: 'gradescope', channel: 'grade', url: `https://www.gradescope.com/courses/${id}/assignments/${row[1]}`, course, authorName: 'Gradescope', authorRole: 'system', sentAt: new Date().toISOString(), subject: `${row[2]} graded`, body: `${row[2]}: ${row[3]}/${row[4]}`, structured: { type: 'grade', assignment: row[2].trim(), category: /homework|hw/i.test(row[2]) ? 'Written homework' : 'Assignments', score: Number(row[3]), max: Number(row[4]) } });
      }
    }
    return { messages };
  },
};

interface PiazzaPost { id: string; nr: number; history: { subject: string; content: string; created: string; uid?: string }[]; type: string; tags?: string[]; bucket_name?: string }

export const piazza: Connector = {
  id: 'piazza',
  label: 'Piazza',
  platform: 'piazza',
  envVars: ['PIAZZA_EMAIL', 'PIAZZA_PASSWORD', 'PIAZZA_NETWORK_IDS'],
  scopes: ['Posts in the classes listed in PIAZZA_NETWORK_IDS (read-only, your login)'],
  configured: () => Boolean(env('PIAZZA_EMAIL') && env('PIAZZA_PASSWORD') && env('PIAZZA_NETWORK_IDS')),
  async fetchSince() {
    const rpc = async (method: string, params: unknown, cookie?: string) => {
      const res = await fetch(`https://piazza.com/logic/api?method=${method}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ method, params }) });
      const j = (await res.json()) as { result?: unknown; error?: string };
      if (j.error) throw new Error(`Piazza: ${j.error}`);
      return { result: j.result, cookie: jar(res) };
    };
    const login = await rpc('user.login', { email: env('PIAZZA_EMAIL'), pass: env('PIAZZA_PASSWORD') });
    const messages: SourceMessage[] = [];
    for (const nid of env('PIAZZA_NETWORK_IDS').split(',').map((s) => s.trim()).filter(Boolean)) {
      const feed = (await rpc('network.get_my_feed', { nid, limit: 40, offset: 0 }, login.cookie)).result as { feed?: { id: string }[] };
      for (const { id } of feed.feed ?? []) {
        const post = (await rpc('content.get', { cid: id, nid }, login.cookie)).result as PiazzaPost;
        const h = post.history[0];
        if (!h) continue;
        const staff = post.tags?.includes('instructor-note') || post.type === 'note' || post.bucket_name === 'Pinned';
        messages.push({ id: `piazza-${nid}-${post.nr}`, source: 'piazza', channel: 'post', url: `https://piazza.com/class/${nid}/post/${post.nr}`, authorName: staff ? 'Instructor' : 'Student', authorRole: staff ? 'instructor' : 'student', sentAt: h.created, subject: h.subject, body: h.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), pinned: post.bucket_name === 'Pinned' });
      }
    }
    return { messages };
  },
};

export const ed: Connector = {
  id: 'ed',
  label: 'Ed Discussion',
  platform: 'ed',
  envVars: ['ED_API_TOKEN', 'ED_REGION'],
  scopes: ['Threads in your enrolled courses (read-only token)'],
  configured: () => Boolean(env('ED_API_TOKEN')),
  async fetchSince() {
    const host = `https://${env('ED_REGION') === 'us' || !env('ED_REGION') ? 'us.edstem.org' : `${env('ED_REGION')}.edstem.org`}/api`;
    const headers = { authorization: `Bearer ${env('ED_API_TOKEN')}` };
    const get = async <T>(path: string) => {
      const res = await fetch(`${host}${path}`, { headers });
      if (!res.ok) throw new Error(`Ed responded ${res.status}`);
      return (await res.json()) as T;
    };
    const user = await get<{ courses: { course: { id: number; code: string } }[] }>('/user');
    const messages: SourceMessage[] = [];
    for (const { course } of user.courses) {
      const { threads } = await get<{ threads: { id: number; title: string; document: string; created_at: string; user?: { name: string; course_role?: string }; is_pinned?: boolean; category?: string }[] }>(`/courses/${course.id}/threads?limit=40&sort=new`);
      for (const t of threads) {
        const staff = t.user?.course_role === 'admin' || t.user?.course_role === 'staff';
        messages.push({ id: `ed-${t.id}`, source: 'ed', channel: 'post', url: `https://edstem.org/us/courses/${course.id}/discussion/${t.id}`, course: course.code.match(/\d{2}-?\d{3}/)?.[0], authorName: t.user?.name ?? 'Student', authorRole: staff ? 'instructor' : 'student', sentAt: t.created_at, subject: t.title, body: t.document.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), pinned: t.is_pinned });
      }
    }
    return { messages };
  },
};
