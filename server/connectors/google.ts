import fs from 'node:fs';
import type { SourceMessage } from '../../engine/types.ts';
import { env, getJSON, type Connector } from './types.ts';

// Google OAuth (Gmail + Calendar). Read-only scopes by default; calendar.events is requested
// incrementally, only when the user first approves a calendar write.

const TOKEN_FILE = '.data/google-token.json';
export const SCOPES = { read: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'], write: ['https://www.googleapis.com/auth/calendar.events'] };

interface Token { access_token: string; refresh_token?: string; expires_at: number; scope?: string }
const load = (): Token | undefined => (fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) : undefined);
const save = (t: Token) => { fs.mkdirSync('.data', { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify(t)); };
export const googleConnected = () => Boolean(env('GOOGLE_CLIENT_ID') && load());
export const googleDisconnect = () => fs.existsSync(TOKEN_FILE) && fs.rmSync(TOKEN_FILE);

export function authUrl(write = false): string {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: env('GOOGLE_REDIRECT_URI') || 'http://localhost:8000/auth/google/callback', response_type: 'code',
    scope: [...SCOPES.read, ...(write ? SCOPES.write : [])].join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<Token> {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...body }) });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  const t = { access_token: j.access_token, refresh_token: j.refresh_token ?? load()?.refresh_token, expires_at: Date.now() + j.expires_in * 1000 - 60_000, scope: j.scope };
  save(t);
  return t;
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: env('GOOGLE_REDIRECT_URI') || 'http://localhost:8000/auth/google/callback' });

async function accessToken(): Promise<string> {
  let t = load();
  if (!t) throw new Error('Google is not connected — open Settings → Connections');
  if (Date.now() > t.expires_at && t.refresh_token) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  return t.access_token;
}

interface GPart { mimeType?: string; body?: { data?: string }; parts?: GPart[] }
const b64 = (s?: string) => (s ? Buffer.from(s, 'base64url').toString('utf8') : '');
function plain(p: GPart): string {
  if (p.mimeType === 'text/plain' && p.body?.data) return b64(p.body.data);
  return (p.parts ?? []).map(plain).join('\n');
}
function html(p: GPart): string {
  if (p.mimeType === 'text/html' && p.body?.data) return b64(p.body.data);
  return (p.parts ?? []).map(html).join('\n');
}
/** HTML → text for receipts that have no plain part. Link targets are kept ("Manage (https://…)") so Money can check their domain. */
export function htmlToText(h: string): string {
  return h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => `${label.replace(/<[^>]+>/g, ' ').trim()} (${href})`)
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&(?:euro);/g, '€').replace(/&(?:pound);/g, '£')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
const text = (p: GPart) => plain(p).trim() || htmlToText(html(p));
const hasFile = (p: GPart & { filename?: string }): boolean => Boolean(p.filename) || (p.parts ?? []).some((x) => hasFile(x as GPart & { filename?: string }));

export const gmail: Connector = {
  id: 'gmail',
  label: 'Gmail',
  platform: 'gmail',
  envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  scopes: ['gmail.readonly — read inbox, sent mail and billing emails; cannot send, modify or pay'],
  configured: googleConnected,
  async fetchSince() {
    const auth = { authorization: `Bearer ${await accessToken()}` };
    const messages: SourceMessage[] = [];
    const seen = new Set<string>();
    // Billing needs a longer look-back (monthly and yearly cycles) but only for mail that reads like billing. Same read-only scope.
    const BILLING = 'newer_than:120d (receipt OR subscription OR membership OR renew OR renews OR trial OR invoice OR "payment failed" OR "payment received" OR cancellation OR refund) -category:promotions';
    // Spam is read (never changed) so Storage & Spam can show it; it's kept out of reconciliation.
    for (const q of ['in:inbox newer_than:14d', 'in:sent newer_than:14d', `in:inbox ${BILLING}`, 'in:spam newer_than:30d']) {
      const box = q.startsWith('in:sent') ? 'in:sent' : q.startsWith('in:spam') ? 'in:spam' : 'in:inbox';
      const list = await getJSON<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=60`, auth);
      for (const { id } of list.data.messages ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const { data } = await getJSON<{ id: string; threadId: string; internalDate: string; sizeEstimate?: number; payload: GPart & { headers: { name: string; value: string }[] } }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, auth);
        const h = (n: string) => data.payload.headers.find((x) => x.name.toLowerCase() === n)?.value ?? '';
        const from = h('from').match(/^(.*?)\s*<(.+)>$/);
        const sent = box === 'in:sent';
        messages.push({
          id: `gmail-${id}`, source: 'gmail', channel: sent ? 'sent' : 'email', url: `https://mail.google.com/mail/u/0/#${sent ? 'sent' : box === 'in:spam' ? 'spam' : 'inbox'}/${id}`,
          authorName: sent ? 'You' : (from?.[1] || h('from')).replace(/"/g, ''), authorEmail: (from?.[2] ?? h('from')).toLowerCase(), authorRole: sent ? 'self' : 'external',
          to: h('to').split(',').map((s) => s.match(/<(.+)>/)?.[1] ?? s.trim()).filter(Boolean), sentAt: new Date(Number(data.internalDate)).toISOString(),
          subject: h('subject'), threadId: data.threadId, body: text(data.payload).slice(0, 4000),
          sizeBytes: data.sizeEstimate, hasAttachment: hasFile(data.payload) || undefined, spam: box === 'in:spam' || undefined,
        });
      }
    }
    return { messages };
  },
};

export const gcal: Connector = {
  id: 'gcal',
  label: 'Google Calendar',
  platform: 'gcal',
  envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  scopes: ['calendar.readonly — read events', 'calendar.events — requested only when you approve moving an event'],
  configured: googleConnected,
  async fetchSince() {
    const auth = { authorization: `Bearer ${await accessToken()}` };
    const q = new URLSearchParams({ timeMin: new Date(Date.now() - 7 * 86400_000).toISOString(), timeMax: new Date(Date.now() + 21 * 86400_000).toISOString(), singleEvents: 'true', orderBy: 'startTime' });
    const { data } = await getJSON<{ items: { id: string; summary?: string; htmlLink: string; location?: string; start: { dateTime?: string }; end: { dateTime?: string }; attendees?: { displayName?: string; email: string }[] }[] }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, auth);
    return {
      messages: data.items.filter((e) => e.start.dateTime && e.end.dateTime).map((e) => ({
        id: `gcal-${e.id}`, source: 'gcal' as const, channel: 'calendar' as const, url: e.htmlLink, authorName: 'You', authorRole: 'self' as const, sentAt: e.start.dateTime!, subject: e.summary ?? '(no title)',
        body: `${e.summary ?? ''}${e.location ? ` · ${e.location}` : ''}`,
        structured: { type: 'calendar' as const, eventId: e.id, title: e.summary ?? '(no title)', start: e.start.dateTime!, end: e.end.dateTime!, location: e.location, attendees: e.attendees?.map((a) => a.displayName ?? a.email) },
      })),
    };
  },
};

/** Writes happen only after the user approves a proposal; needs the calendar.events scope. */
export async function moveCalendarEvent(eventId: string, start: string, end: string): Promise<void> {
  const t = load();
  if (!t?.scope?.includes('calendar.events')) throw new Error('Calendar write access has not been granted — approve it in Settings first');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, { method: 'PATCH', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ start: { dateTime: start }, end: { dateTime: end } }) });
  if (!res.ok) throw new Error(`Google Calendar responded ${res.status}`);
}
