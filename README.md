# Semora

> Everything important, finally in sync. — *Your semester changes. Semora keeps you ahead.*

Semora pulls everything a student receives (Gmail, Canvas, Gradescope, Piazza/Ed, Google Calendar) into one calm view of what to do. Its brain is a **reconciliation engine**: it matches messages that describe the same thing, decides which source is authoritative, scopes changes to your section, ignores questions, closes promises when evidence appears, and shows "Needs confirmation" instead of guessing. Every item and change links back to the exact source messages.

## Run it (one command)

```bash
npm install
npm run dev        # API on :8000 + web on :5173
```

Open http://localhost:5173. Deploying: see [DEPLOY.md](DEPLOY.md). It runs fully on the seeded demo (Alex Chen, CMU sophomore) with **no credentials**; the clock is frozen at Wed Nov 11, 2026, 9:00 AM ET.

Other commands: `npm run smoke` (browser smoke test of every route, themes, sidebar and assistant), `npm run serve` (production: one process on `$PORT` serving API + built app), `npm test` (engine tests), `npm run typecheck`, `npm run lint`, `npm run check` (all three), `npm run screenshots <name>`, `npm run screenshots:money <name>` (Playwright, with the dev stack running; set `CHROME_PATH` to use a system Chrome), `npm start` (production build + preview).

## Environment variables

Copy `.env.example` to `.env`. Every variable is optional; real connectors switch on when their variables are present.

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE`, `DEMO_NOW`, `STUDENT_SECTION`, `TIMEZONE` | Seeded dataset, frozen clock, your section (default `B`), time zone |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `LLM_MODEL_FAST`, `LLM_MODEL_SMART` | LLM extraction + Ask Semora via OpenRouter (defaults: `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4.5`). Without a key, rule-based extraction runs and every story beat still works. |
| `CANVAS_BASE_URL`, `CANVAS_ACCESS_TOKEN`, `CANVAS_ICS_URL` | Canvas REST and/or the calendar feed |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Gmail (`gmail.readonly`) + Calendar (`calendar.readonly`; `calendar.events` only on approving a write). Visit `/auth/google` |
| `GRADESCOPE_EMAIL`, `GRADESCOPE_PASSWORD` | Gradescope (no official API; your own login, read-only) |
| `PIAZZA_EMAIL`, `PIAZZA_PASSWORD`, `PIAZZA_NETWORK_IDS` | Piazza (unofficial) |
| `ED_API_TOKEN`, `ED_REGION` | Ed Discussion |

**Honesty note:** the seeded demo and every engine path are tested. The live connectors (Canvas, Google, Gradescope, Piazza, Ed) and the LLM extraction path are implemented against the documented endpoints but have **not** been exercised against real accounts or a real API key in this build; the unofficial ones (Gradescope, Piazza) may need adjustment.

## How it works

- `engine/`: pure TypeScript. `reconcile(messages, actions, now)` → items, changes, proposals. Rules own authority (instructor/TA/staff > system/self > student), section scope, intent, completion and date math; an LLM, when configured, only extracts claims (cached by input hash).
- `server/`: Hono API, SSE push (`/api/events`), connector registry (one interface, isolated failures), Ask Semora, LLM client.
- **Morning Brief** (`engine/brief.ts`): a deterministic, cited, ≤7-line / ≤120-word digest built from the reconciled state; it opens once a day and folds into a card on This week.
- **Opening sequence** (`web/src/intro.tsx`, demo mode): the real 135 messages sorted on screen by the engine's own output (noise out → stacks → who wins → 13 things). Space steps, Esc skips, `?intro=1` replays, `?intro=0` skips.
- **Money** (`engine/finance.ts`): subscriptions, trials, renewals, price changes, failed payments and cancellations from billing email, with an estimated monthly total. Merchant comes from the sender, outcomes need the email's own words, totals are deterministic and exclude anything uncertain; look-alike senders are ignored. Semora never cancels or pays: it opens the merchant's page or records what you tell it.
- `web/`: React + Vite + Motion. Dashboard, Inbox, Daily Digest, Ask Semora (panel ⌘J + page), This Week, Changes, Waiting on Me, Courses, Grades, Subscriptions, Storage & Spam, Connections, Settings; ⌘K. Warm Espresso/Walnut/Taupe/Sand/Ivory tokens, light/dark/system plus four seasons, collapsible sidebar.
- **Inbox health** (`engine/health.ts`): composition, noisy senders, large attachments, spam — read-only, no invented storage quota.
- Privacy: Semora persists only your actions and settings; Settings shows and deletes everything. Reading and acting are separate; nothing is sent or written without a tap.
- Decisions and alternatives: see [PLAN.md](PLAN.md). Demo script: [DEMO.md](DEMO.md). Iteration log: [IMPROVEMENTS.md](IMPROVEMENTS.md).

Keyboard: `⌘K` palette · `j`/`k` move · `Enter` open · `e` mark done · `Esc` close.
