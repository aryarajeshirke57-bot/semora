import 'dotenv/config';
import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { COURSES, PEOPLE, STUDENT } from '../engine/seed/courses.ts';
import { DEMO_NOW, LIVE_SCRIPT, demoMessages, liveMessage } from '../engine/seed/index.ts';
import { buildState } from '../engine/state.ts';
import type { ActionType, SemoraState, ConnectionStatus, SourceMessage } from '../engine/types.ts';
import { ask } from './ask.ts';
import { canvas } from './connectors/canvas.ts';
import { ed, gradescope, piazza } from './connectors/community.ts';
import { authUrl, exchangeCode, gcal, gmail, googleDisconnect, moveCalendarEvent } from './connectors/google.ts';
import { env, type Connector } from './connectors/types.ts';
import { llmClaims, llmEnabled, llmFinanceClaims, models, prefetchClaims, prefetchFinance } from './llm.ts';
import * as store from './store.ts';

const DEMO = env('DEMO_MODE') !== 'false';
/** Where to send the browser after OAuth. Production serves the app from this server (same origin); dev runs Vite on :5173. */
const APP_URL = (env('APP_URL') || (fs.existsSync('dist') ? '' : 'http://localhost:5173')).replace(/\/$/, '');
const connectors: Connector[] = [canvas, gmail, gcal, gradescope, piazza, ed];
const real = new Map<string, { messages: SourceMessage[]; at?: string; error?: string; syncing?: boolean }>();
const clock = () => (DEMO ? env('DEMO_NOW') || DEMO_NOW : new Date().toISOString());
let version = 1;

const student = { ...STUDENT, section: env('STUDENT_SECTION') || STUDENT.section, timezone: env('TIMEZONE') || STUDENT.timezone };

function allMessages(): SourceMessage[] {
  const now = clock();
  const out: SourceMessage[] = DEMO ? demoMessages() : [];
  if (DEMO) for (let i = 0; i < store.get().live; i++) out.push(liveMessage(i, now)!);
  for (const r of real.values()) out.push(...r.messages);
  const off = new Set(store.get().disabled);
  return out.filter((m) => !off.has(m.source));
}

async function compute(): Promise<{ state: SemoraState; messages: SourceMessage[] }> {
  const messages = allMessages();
  await prefetchClaims(messages);
  await prefetchFinance(messages);
  const now = clock();
  const demoSync = new Date(Date.parse(now) - (store.get().live ? 0 : 2 * 60_000)).toISOString();
  const connections: ConnectionStatus[] = [
    ...connectors.map((c): ConnectionStatus => {
      const r = real.get(c.id);
      const configured = c.configured();
      const enabled = !store.get().disabled.includes(c.platform);
      return {
        id: c.id, label: c.label, platform: c.platform, configured, enabled,
        mode: !enabled ? 'off' : configured ? 'live' : DEMO ? 'demo' : 'off',
        status: !enabled ? 'off' : r?.syncing ? 'syncing' : r?.error ? 'error' : configured || DEMO ? 'ok' : 'off',
        lastSync: !enabled ? undefined : configured ? r?.at : DEMO ? demoSync : undefined,
        itemCount: messages.filter((m) => m.source === c.platform).length,
        error: r?.error, scopes: c.scopes, envVars: c.envVars,
      };
    }),
    {
      id: 'openrouter', label: 'OpenRouter (LLM)', platform: 'openrouter', configured: llmEnabled(), enabled: true, mode: llmEnabled() ? 'live' : 'off', status: llmEnabled() ? 'ok' : 'off',
      itemCount: 0, scopes: [llmEnabled() ? `Extraction: ${models().fast} · Ask: ${models().smart}` : 'Not configured — Semora uses its built-in rule extractor'], envVars: ['OPENROUTER_API_KEY', 'LLM_MODEL_FAST', 'LLM_MODEL_SMART'],
    },
  ];
  const live = store.get().live;
  const state = buildState({
    messages, actions: store.get().actions, now, student, courses: COURSES, directory: PEOPLE, claimsFor: llmEnabled() ? llmClaims : undefined, financeClaimsFor: llmEnabled() ? llmFinanceClaims : undefined,
    version, demoMode: DEMO, llm: { enabled: llmEnabled(), ...models() }, connections,
    script: { index: live, total: LIVE_SCRIPT.length, next: LIVE_SCRIPT[live] && { label: LIVE_SCRIPT[live].label, description: LIVE_SCRIPT[live].description } },
  });
  return { state, messages };
}

const clients = new Set<(s: SemoraState) => void>();
async function publish() {
  version++;
  const { state } = await compute();
  clients.forEach((send) => send(state));
}

async function sync(c: Connector) {
  if (!c.configured()) return;
  const entry = real.get(c.id) ?? { messages: [] };
  real.set(c.id, { ...entry, syncing: true });
  try {
    const { messages } = await c.fetchSince();
    real.set(c.id, { messages, at: new Date().toISOString() });
  } catch (e) {
    real.set(c.id, { ...entry, syncing: false, error: e instanceof Error ? e.message : String(e), at: entry.at });
  }
  await publish();
}

const app = new Hono();
app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));
// Production-safe errors: no stack traces or message bodies leave the server.
app.onError((err, c) => {
  console.error('[semora] request failed:', c.req.method, c.req.path, err instanceof Error ? err.message : 'unknown error');
  return c.json({ error: 'Something went wrong on the server.' }, 500);
});
app.get('/api/health', (c) => c.json({ ok: true, demoMode: DEMO, llm: llmEnabled() }));

app.get('/api/state', async (c) => c.json((await compute()).state));

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const send = (s: SemoraState) => void stream.writeSSE({ event: 'state', data: JSON.stringify(s) });
    clients.add(send);
    stream.onAbort(() => {
      clients.delete(send);
    });
    send((await compute()).state);
    while (!stream.aborted) {
      await stream.writeSSE({ event: 'ping', data: '1' });
      await stream.sleep(15000);
    }
  }),
);

const ACTIONS: ActionType[] = ['done', 'undo_done', 'dismiss', 'confirm', 'approve', 'reject', 'choose', 'fin_canceled', 'fin_cancel_requested', 'fin_confirm', 'fin_dismiss', 'fin_undo', 'fin_follow', 'fin_ack', 'chk_done', 'chk_undo'];
app.post('/api/actions', async (c) => {
  const body = await c.req.json<{ type: ActionType; targetId: string; value?: string }>();
  if (!ACTIONS.includes(body.type) || !body.targetId) return c.json({ error: 'bad action' }, 400);
  if (body.type === 'approve' && body.targetId.startsWith('prop:move:')) {
    // Real calendar write: only for real Google events, only after this explicit approval.
    const { state } = await compute();
    const prop = state.proposals.find((p) => p.id === body.targetId);
    const ev = state.items.find((i) => i.id === prop?.targetId);
    if (prop?.to && ev?.eventId && gcal.configured() && !DEMO) {
      try {
        await moveCalendarEvent(ev.eventId, prop.to.start, prop.to.end);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'calendar write failed' }, 502);
      }
    }
  }
  store.get().actions.push({ id: crypto.randomUUID(), type: body.type, targetId: body.targetId, value: body.value, at: clock() });
  store.save();
  await publish();
  return c.json({ ok: true });
});

app.post('/api/demo/simulate', async (c) => {
  if (!DEMO) return c.json({ error: 'demo mode is off' }, 400);
  if (store.get().live >= LIVE_SCRIPT.length) return c.json({ done: true });
  store.get().live++;
  store.save();
  await publish();
  return c.json({ injected: LIVE_SCRIPT[store.get().live - 1].label });
});

app.post('/api/demo/reset', async (c) => {
  store.reset();
  await publish();
  return c.json({ ok: true });
});

app.post('/api/ask', async (c) => {
  const { question, history } = await c.req.json<{ question: string; history?: { question: string; answer: string }[] }>();
  if (!question?.trim()) return c.json({ error: 'empty question' }, 400);
  if (question.length > 600) return c.json({ error: 'question too long' }, 400);
  const turns = Array.isArray(history) ? history.slice(-6).map((h) => ({ question: String(h.question ?? '').slice(0, 600), answer: String(h.answer ?? '').slice(0, 1200) })) : [];
  const { state, messages } = await compute();
  return c.json(await ask(question.trim(), state, messages, turns));
});

app.post('/api/connections/:id/toggle', async (c) => {
  const conn = connectors.find((x) => x.id === c.req.param('id'));
  if (!conn) return c.json({ error: 'unknown connection' }, 404);
  const off = store.get().disabled;
  store.get().disabled = off.includes(conn.platform) ? off.filter((p) => p !== conn.platform) : [...off, conn.platform];
  if (store.get().disabled.includes(conn.platform) && conn.id !== 'canvas' && conn.platform === 'gmail') googleDisconnect();
  store.save();
  await publish();
  return c.json({ ok: true });
});

app.post('/api/connections/:id/sync', async (c) => {
  const conn = connectors.find((x) => x.id === c.req.param('id'));
  if (!conn) return c.json({ error: 'unknown connection' }, 404);
  void sync(conn);
  return c.json({ ok: true });
});

// What Semora remembers: your actions and settings only. Deleting is one call.
app.get('/api/memory', (c) => c.json({ ...store.get(), note: 'Message bodies are not stored. Semora keeps your actions, source toggles and the demo position.' }));
app.delete('/api/memory', async (c) => {
  store.reset();
  if (fs.existsSync('.data/llm-cache.json')) fs.rmSync('.data/llm-cache.json');
  await publish();
  return c.json({ ok: true });
});

app.get('/auth/google', (c) => (env('GOOGLE_CLIENT_ID') ? c.redirect(authUrl(c.req.query('write') === '1')) : c.text('GOOGLE_CLIENT_ID is not set', 400)));
app.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('missing code', 400);
  await exchangeCode(code);
  void sync(gmail);
  void sync(gcal);
  return c.redirect(`${APP_URL}/connections`);
});

if (fs.existsSync('dist')) {
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' })); // client routes survive a refresh
}

const port = Number(process.env.PORT || 8000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Semora API on http://localhost:${port}  ·  ${DEMO ? 'demo mode (frozen clock ' + clock() + ')' : 'live mode'}  ·  LLM: ${llmEnabled() ? models().fast : 'rule-based'}`);
  for (const c of connectors) void sync(c);
  setInterval(() => connectors.forEach((c) => void sync(c)), 120_000);
});
