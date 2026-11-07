# Semora — Plan

Semora turns ~150 messages from Canvas, Gmail, Gradescope, Piazza/Ed and Google Calendar into one evidence-backed list of what a student actually has to do. The product lives or dies on two things: the **reconciliation engine** being visibly right (it decides which message wins, and why), and the **demo** landing in 3 minutes with no credentials and no network.

Those two constraints drive every decision below: deterministic, testable, offline-first, and fast to polish.

---

## 1. Frontend framework and build tool

| Option | Trade-offs for Semora |
| --- | --- |
| **A. React 19 + Vite + TypeScript** | Largest ecosystem for exactly what we need: Motion (layout/shared-element animation), cmdk-style palettes, Radix-quality a11y patterns. Vite dev server starts instantly, HMR is excellent. Pure SPA, so no SSR complexity. |
| B. Next.js (App Router) | Full-stack in one framework, but server components + client animation libraries fight each other, and route transitions with shared elements are harder. Heavier dev loop; we'd still want a long-lived process for SSE and the engine. |
| C. SvelteKit | Beautiful built-in transitions and small bundles, but `animate:flip` and crossfade are less capable than Motion's `layout`/`layoutId` for the "item re-sorts and morphs" moment, and the team knows React better. |

**Choice: A — React + Vite + TS.** The signature moments (re-sorting list, strike-and-morph values, list→detail shared element) are first-class in React + Motion. Vite keeps the iteration loop for design polish under a second.

## 2. Backend framework and language

| Option | Trade-offs |
| --- | --- |
| **A. Node + TypeScript + Hono** | One language end to end: the item model, engine types and API types are shared by import, so the UI can never drift from the engine. Hono is tiny, fast, has first-class SSE streaming, and runs on `@hono/node-server`. Official OpenAI SDK works against OpenRouter. |
| B. Python + FastAPI | Best ecosystem for the unofficial Gradescope/Piazza libraries (`piazza-api`, `gradescope` scrapers) and for LLM tooling. But it splits types across two languages and adds a second runtime and package manager to "one command". |
| C. Go | Fast and simple to deploy, but slow to iterate on fuzzy text matching and no shared types with the UI. Overkill for a single-user local app. |

**Choice: A — Node/TS/Hono.** Shared types are the biggest correctness win for an evidence-heavy UI. The Python-only advantage (unofficial scrapers) is isolated to two connectors; we implement those against the same HTTP endpoints the community libraries use, behind the connector interface, so breakage is contained.

## 3. Data storage

| Option | Trade-offs |
| --- | --- |
| A. SQLite (node:sqlite / better-sqlite3) | Real relational store and queries. But `node:sqlite` is still experimental in Node 22 (prints a warning → console noise), and `better-sqlite3` needs a native build that can fail on a judge's laptop. Our queries are all "load everything for one student". |
| **B. Event log + derived state, persisted as JSON** | Store the *inputs* (normalized messages, plus user actions like approve/dismiss/done) as an append-only log; the engine is a pure function `reconcile(log, profile, now) → state`. Reset demo = truncate the log to the seed. Persist to `.data/semora.json` (gitignored). Zero native deps. Every derived item is reproducible from evidence, which is exactly the privacy and trust story. |
| C. Postgres | Production-grade, multi-user ready, but needs a running server or Docker — breaks "one command, no credentials". |

**Choice: B — event-sourced log + pure reconcile.** Data volume is ~150 messages per student. Recomputing all state takes milliseconds and makes the engine trivially testable (each story beat = a log prefix → assert state). Privacy: the persisted store keeps extracted facts + source links; for real connectors, raw bodies are dropped after extraction (only a short excerpt is kept for evidence display). The Settings "What Semora remembers" panel shows and deletes it. A storage interface means swapping to SQLite later is a single file.

## 4. Connector layer architecture

| Option | Trade-offs |
| --- | --- |
| **A. Uniform `Connector` interface + registry** | `{ id, label, isConfigured(env), fetchSince(cursor) → RawMessage[], normalize(raw) → SourceMessage, status() }`. A registry enables each connector whose env vars are present; the seeded demo connector is always on. A sync loop pulls, normalizes, appends to the log. Failures are per-connector (status `error`, last good sync kept). |
| B. Webhooks/push per source | Fresher data, but Gmail push needs Pub/Sub, Canvas live events need admin, Piazza has none. Not viable for a student-run app. |
| C. Single ETL script that dumps everything into a file | Simplest, but no freshness/status per source, no incremental sync, and no isolation when Gradescope's HTML changes. |

**Choice: A — interface + registry + polling sync.** It gives honest per-source freshness ("Updated 2 min ago · Gmail, Canvas"), isolation for fragile scrapers, and a clean seam for the demo source. Cursors (Gmail `historyId`, Canvas timestamps) are stored per connector.

## 5. Reconciliation engine (rules, LLM, or hybrid)

| Option | Trade-offs |
| --- | --- |
| A. Pure rules | Deterministic and testable, but brittle extraction from free text ("Due Friday 11/13 at 11:59pm") and poor at fuzzy matching of differently-worded titles. |
| B. Pure LLM ("here are 150 messages, give me the truth") | Handles any wording, but non-deterministic, unexplainable, expensive, and it will happily say "newer wins". Impossible to test beat by beat. Judges' #1 feedback: show *why* a message wins. |
| **C. Hybrid pipeline** | Stage-by-stage, each stage owned by whichever is more reliable. |

**Choice: C — hybrid.** The pipeline:

1. **Extract** (LLM with JSON schema when `OPENROUTER_API_KEY` is set, otherwise a rule-based extractor): from each message produce *claims*: `{ kind, course, subject (e.g. "HW5"), field (due_at | location | starts_at | status), value, section_scope, intent (statement | question | proposal | promise | fulfillment) }`. LLM results are cached by content hash (`.data/llm-cache.json`), so re-syncs are free and demos deterministic.
2. **Match** (rules first, LLM for ambiguous): claims are keyed to an entity by `course + canonical subject` (normalizes "Homework 5", "HW5", "hw 5"). If no rule key matches and a fuzzy title score is in the ambiguous band, the smart model decides (cached).
3. **Intent filter** (LLM-extracted, rule fallback): questions and proposals never change state; they attach as labeled evidence.
4. **Scope** (rules): a claim scoped to sections ≠ the student's section is evidence only ("applies to Section A, C — not you").
5. **Authority** (rules): rank `instructor (4) > ta / staff (3) > system calendar / syllabus (2) > student (1)`. For each field, the winning value is the highest-authority, in-scope, statement-intent claim; ties at the same authority go to the most recent *only if it explicitly corrects* ("Clarifying", "moved", "update"); otherwise a same-authority disagreement → **Needs confirmation**. A lower-authority claim that disagrees with the winner is marked **Outdated — superseded by …**.
6. **Completion** (rules + LLM): promises close when a later sent message from the student to the same recipients matches the promised object (and, e.g., has an attachment).
7. **Cascade** (rules): when an entity's winning value changes, find dependents (calendar events whose title/attendees reference it, promises tied to it) and *propose* actions: move event to a free slot (date math against the student's calendar), draft a message. Nothing executes without approval.
8. **Evidence**: every entity and every change carries the IDs of all supporting messages, the winner, and a human-readable reason (`"Instructor statement outranks earlier staff email"`).

Date math, time zones (America/New_York via `Intl`/date-fns-tz), section scoping and authority are never delegated to the model.

## 6. Visual design direction

| Direction | Description |
| --- | --- |
| A. "Ink & Paper" | Warm off-white paper, near-black ink, a serif display face, editorial rules. Calm and literary, but reads like a newsletter, not a tool you act in; serif + dense data is hard to keep crisp at phone width. |
| B. "Neon Command" | Dark-first, glowing gradients, glassmorphism, bold accent per source. Demo-flashy, but noisy, tiring, and it's the generic "AI startup" template judges have seen all day. Fights "calm and trustworthy". |
| **C. "Quiet Instrument"** | Linear/Things-like precision: neutral graphite scale with a slightly cool tint, one accent (a confident **Semora blue-violet**, `oklch(0.55 0.2 270)`), Inter with tabular numerals, hairline dividers, no cards, rows aligned on a strict 4-px grid. Color is reserved for meaning: accent for focus/action, amber for "Needs confirmation", red only for canceled/strike-through. Source badges are tiny monochrome glyphs. |

**Choice: C — Quiet Instrument.** It is the direct visual expression of "calm and confident": the UI recedes and the changes stand out, because they're the only colored thing on screen. It also wins "Looks Good, Works Good" by being shipped-product precise rather than decorated.

## 7. Animation library and motion approach

| Option | Trade-offs |
| --- | --- |
| **A. Motion (formerly Framer Motion)** | `layout` animations for re-sorting, `layoutId` for list→detail shared elements, `AnimatePresence` for exits, springs, and `useReducedMotion`. Exactly our feature list. ~35 KB. |
| B. CSS transitions + View Transitions API | Zero-dependency and the View Transitions API does shared elements, but cross-browser support is uneven and list re-ordering with FLIP must be hand-rolled. |
| C. GSAP | Most powerful timeline engine, but imperative; fighting React's render cycle for layout animations costs time. |

**Choice: A — Motion**, with a small motion token set (`fast 150ms`, `base 220ms`, `slow 300ms`, one spring `{ stiffness: 500, damping: 34 }`), CSS for shimmer/pulse, and a global `MotionConfig reducedMotion="user"`.

## 8. Real-time updates to the UI

| Option | Trade-offs |
| --- | --- |
| A. Polling | Simplest, but adds 0–N seconds of latency to the "simulate incoming message" moment, which must feel instant and animated. |
| **B. Server-Sent Events** | One-way server→client is exactly our shape (sync finished, new state). Native `EventSource`, auto-reconnect, works through Vite's proxy, trivial with Hono `streamSSE`. Actions go over normal POSTs. |
| C. WebSockets | Bidirectional, but we don't need client→server streaming; more moving parts (heartbeats, reconnection) for no gain. |

**Choice: B — SSE.** The server pushes a `state` event with a version number and a `changes` diff; the client swaps state, and Motion animates whatever moved.

## Other decisions (briefly)
- **Styling:** hand-written CSS with design tokens as CSS custom properties (light/dark under `[data-theme]` + `prefers-color-scheme`). Tailwind was considered; tokens + a small stylesheet give finer control of the type scale and less markup noise.
- **Routing:** `react-router` (lightweight, URL per view so ⌘K and back button work).
- **Testing:** Vitest for the engine (one test per story beat + edge cases), Playwright for screenshots and the demo walk.
- **Lint/types:** `tsc --noEmit` across web/server/shared, ESLint flat config with typescript-eslint + react-hooks.
- **One command:** `npm run dev` runs the API (`tsx watch`, port 8000) and Vite (port 5173) together via `concurrently`.

---

## Build plan (milestones)

1. **Scaffold** — package, tsconfigs, lint, Vite + Hono skeleton, `npm run dev`. *Commit.*
2. **Model + seed** — shared types, demo clock, seeded dataset (all story beats + ~130 generated noise messages + grades + calendar). *Commit.*
3. **Engine** — extraction (rules + LLM path with cache), matching, authority, scope, intent, completion, conflict, cascade, evidence. Tests for every beat and the live script. *Commit.*
4. **API + connectors** — connector registry (demo, Canvas REST + ICS, Gmail, Google Calendar, Gradescope, Piazza, Ed, OpenRouter client), sync status, actions, SSE, simulate/reset, Ask Semora. *Commit.*
5. **UI** — shell, tokens, This week, Changed, Waiting on me, Grades (+ final calculator), Inbox, Course pages, Ask, ⌘K, Settings/Connections, item detail, keyboard nav. *Commit.*
6. **Motion + states** — re-sort, strike-and-morph, shared element, springs, skeletons, completion, theme switch, reduced motion; empty/loading/error states. *Commit.*
7. **Screenshot review loops ×2** — Playwright screenshots (light, dark, phone) of every screen, critique, polish. *Commit each.*
8. **Docs** — README.md, DEMO.md. *Commit.*
9. **Improvement rounds ×10** — subagent review → 3 changes → tests → screenshots → commit + IMPROVEMENTS.md.

---

# Phase 2: Morning Brief + "messy to clear" opening

Feedback after the demo run: (1) add a daily digest, a 60-second read; (2) the app reads as cluttered to a judge on first look. We want the demo to *show* the move from chaos to clarity instead of starting at the end state.

## 9. Daily digest: form factor

| Option | Trade-offs |
| --- | --- |
| A. A page in the sidebar ("Today") | Easy, always reachable, but nobody visits it unprompted and it's just another long list. It doesn't create a moment for the judges. |
| **B. Morning Brief sheet: opens on the first visit of the day, then folds into a card at the top of This week** | It's the first thing you see, it's read once, and afterwards it stays as a one-line summary you can reopen (⌘K "Brief", or click the card). It's a natural bridge from the opening into the app. It needs only a "last seen" timestamp (no message content), so privacy stays as it is. |
| C. Pushed digest (morning email or notification) | This is how real digests live, but it needs a send/write permission and a scheduler, and it can't be shown on a frozen-clock demo. It could come later by rendering the same brief to email. |

**Choice: B.** One sheet, read in under a minute, every line tappable and cited. "60 seconds" is a hard budget: **at most 7 lines and 120 words**, enforced by a test (at about 250 wpm that's about 30 s of reading plus scanning). The sheet shows "~40 sec read". The brief is built **deterministically in the engine** (`buildBrief(state, lastSeen)`) from reconciled items, so it can never contradict the rest of the app and it works with no key. An optional LLM pass may only rephrase the headline, from the same facts.

**Shape (seeded Wed Nov 11, 9:00 AM):**
```
Good morning, Alex                                   ~40 sec read
3 things changed since yesterday · 2 need your call

CHANGED
 HW5 now due Mon Nov 16, 11:59 PM — Prof. Whitfield, Section B   ⓒ✉◎
   Jordan is still saying Friday; that's outdated.
 Midterm 2 moved to Wean Hall 7500 (Thu 7 PM)                    ⓒ✉
 Office hours today canceled → extra hours Fri 1–3 PM            ◎

NEXT 48 HOURS
 Midterm 2 Thu 7 PM · Problem Set 7 Thu 10 PM · Slides to Sofia & Ethan by Thu

YOUR CALL
 Move HW5 study session → Sun 2–5 PM      [Approve] [Not now]
 Essay 2 draft: Mon 16 or Tue 17?         [Ask the TA]

HEADS-UP  HCI research assistant role, apply by Nov 20

                                                   [Got it →]
```
**Ranking:** changes first (by how soon they bite), then anything due within 48 h, then decisions (proposals plus Needs confirmation), then one heads-up (the opportunity). Overflow becomes "+N more on This week", never a longer brief. **Live:** a change that arrives while the brief is open slides in with a "just now" tag. After the brief is closed, the folded card shows "1 new since your brief".

## 10. Showing "chaos → clarity"

| Option | Trade-offs |
| --- | --- |
| **A. "Sort" opening sequence: the real 135 messages as a wall of cards, which Semora visibly triages and collapses into This week, then the Brief opens** | The before/after is the product, shown in about 7 seconds, and every animated card is a real seeded message moved by real engine output (triage category, evidence role, item id), so it's honest. It sets up the "which message wins" beat visually. The risk is that it feels gimmicky, so it's fast, skippable, demo-mode only, and controllable by the presenter. |
| B. Before/after split slider (raw inbox ↔ Semora) | Clear and cheap, but static. Judges have seen comparison sliders, and it doesn't show *how* (dedupe, authority), which is our differentiator. |
| C. Leave it to the pitch (a slide of a messy inbox) and make the app calmer | Zero build risk, but the strongest moment lives outside the product and the app still looks long. |

**Choice: A, plus calming the default views (part of C).** The opening sells the transformation, and the calmer defaults keep what the judge lands on clean.

**Choreography** (each phase auto-advances; in presenter mode Space/→ steps through so the speaker sets the pace; Esc skips):
1. **The mess (0–1.5 s).** About 135 message cards stream into a dense, slightly rotated wall, tinted by source (Gmail, Canvas, Piazza, Ed, Gradescope, Calendar). Counter: "135 new messages · 6 apps". Caption: *Wednesday, 9:00 AM. This is Alex's week.*
2. **Noise out (1.5–2.5 s).** The 48 promo and newsletter cards dim and drop away. Counter 135 → 87. Caption: *48 promos and newsletters set aside.*
3. **Same thing, many places (2.5–3.8 s).** Cards that share an item fly together into stacks (HW5 ×6, Midterm 2 ×3, …). Caption: *HW5 was mentioned 6 times. It's one assignment.*
4. **Who wins (3.8–5.5 s, the hero beat, held longest).** The HW5 stack fans out: Prof. Whitfield's Piazza post lifts with an "Instructor · Section B" badge, while Canvas and the staff email get "Replaced" and **Jordan's "still due Friday right??" gets struck "Outdated"**. Caption: *Newer isn't right. Who said it, and to whom, is.*
5. **Clarity (5.5–7 s).** Each stack morphs (shared `layoutId`) into its row on This week; leftover cards fade. Counter lands: **"135 messages → 13 things you need to know."** The Brief sheet rises.

**Implementation notes.**
- `web/src/intro.tsx` reads only `state.messages` (`categories`, `evidenceRole`, `itemIds`) and `state.items`, so no new engine logic is needed. The wall shows at most about 60 cards on screen and the counter carries the rest, so the animation stays at 60 fps (transform/opacity only).
- Triggers: on first load in demo mode once per session, "Replay intro" in the Demo pill, and `?intro=1`. Under reduced motion it shows a three-frame crossfade with the same captions. On phone, fewer cards and the captions stack below.

**Calmer defaults (what the judge sees after the intro).**
- **This week:** the folded Brief card on top. Today and Tomorrow expanded. Later days collapsed to one line ("Fri · 4 items") that you click to expand. Calendar-only events (IM soccer, dance) are dimmed into the week strip instead of rows.
- **Inbox:** defaults to a **"Needs you"** filter (messages linked to items, about 25) rather than All 135. Noise is one link at the bottom: "48 set aside".
- **Proposals:** the two purple cards become one compact "Because HW5 moved: 2 suggestions" group that expands.

## Build plan (phase 2)
1. **Engine:** `buildBrief()` plus tests (HW5 shows Mon Nov 16 and never Fri; Jordan flagged; ≤ 6 lines and ≤ 120 words; every line cites message ids; live step 1 adds the Midterm time). Persist `lastSeen`. *Commit.*
2. **Brief UI:** the sheet, the folded card, ⌘K entry, inline approve, live slide-in. *Commit.*
3. **Calmer defaults:** This week collapse, Inbox "Needs you", grouped proposals. *Commit.*
4. **Intro sequence:** five phases, presenter stepping, skip, reduced motion, replay. *Commit.*
5. **Verify:** Playwright screenshots of every intro phase plus the Brief (light, dark, phone), and a frame check that the intro holds 60 fps. Update DEMO.md with a new 0:00 ("press Space through the sort, land on the Brief") and README. *Commit.*

**Cut line if time runs short:** 1 → 2 → 4 are the must-haves, then 3. In the intro, phase 3 (stacking) can merge into phase 4. Phase 4 ("who wins") is never cut; it's the differentiator.

---

# Phase 3: Money (financial commitments in the inbox)

Students also lose track of what their inbox commits them to: trials that convert, renewals, price rises, failed payments, cancellations that never went through. Same problem shape as the semester (scattered, contradictory messages; newer isn't automatically right), so it gets the same treatment: evidence-backed records, deterministic decisions, nothing done without a tap.

## 11. Where Money lives in the architecture

| Option | Trade-offs |
| --- | --- |
| A. Extend `reconcile.ts`: subscriptions become `Item`s with new kinds | One pipeline and one evidence UI, but the academic engine's rules (authority ranks, section scope, date fields) don't fit billing, and every academic test and view (This week, counts, the intro's "13 things") would shift. High regression risk to the judged demo. |
| B. LLM-only extractor that returns subscription cards directly | Fastest to build and handles any wording, but it's the "pure LLM" option PLAN decision 5 rejected: it can't be tested beat by beat, and it would happily decide a payment succeeded or a cancellation happened. |
| **C. A parallel, pure module `engine/finance.ts` with the same hybrid shape** | Extract claims (rules; or LLM proposals that `validateClaim` checks against the message text) → deterministic reconcile into subscriptions, events, alerts and totals. Reads the same `SourceMessage`s and `UserAction`s, plugs into `buildState` and `buildBrief` as optional inputs. Academic reconciliation is untouched — a test proves its output is byte-identical with billing mail in the inbox. |

**Choice: C.** Key rules that live in code, not in a model:
- **Merchant = sender**, or the payee named by a payment processor (PayPal). An email can't make claims about another company; a same-name sender from a different domain is quarantined as a look-alike and its links are never offered.
- **Marketing never becomes evidence.** A message must speak about *your* account (receipt, your subscription/plan, renews on, payment failed…) or it's ignored, even if it names a brand and a monthly price.
- **Outcomes need the message's own words**: a receipt for a charge, a failure notice for a failure, a confirmation (not a request) for a cancellation. An LLM-proposed amount or date must literally appear in the email.
- **Status is a deterministic state machine** over each subscription's events: conflict / charge-after-cancel → Needs confirmation; confirmed cancellation → Canceled; request only → Cancel pending; failure newer than last receipt → Payment failed; trial without a later receipt → Trial (→ Needs confirmation once it has ended); recent price change → Price changed; renewal within 7 days → Renews soon.
- **Price changes**: an announcement is a future price; it becomes the price when a later email bills or renews at it, or the effective date passes.
- **Totals**: USD only, only subscriptions the merchant states (or repeated charges show), excluding trials, pending/confirmed cancellations, conflicts, and unknown/foreign currency — each exclusion carries a reason. Weekly ×52/12, quarterly ÷3, yearly ÷12.
- **Duplicates**: the same charge reported twice (merchant + PayPal) is one charge with two pieces of evidence.
- **Actions** (`fin_*`) only record what the user says (asked to cancel, canceled, confirm, not a subscription, undo). Nothing is canceled, paid or submitted; manage buttons open the merchant's own https page, and only when its domain matches the sender.

**UI.** A Money view (figure + "how is this calculated", Needs attention, Next 30 days, filtered list, one-time purchases), a subscription sheet (why, conflict picker, history, evidence, manage), a Money group at the bottom of Changed, "Money · needs a decision" on Waiting on me, Money inbox filter, ⌘K entries. Money items never enter This week's academic list.

**Morning Brief.** One `money` line (the two alerts ≥ 60 urgency) competing for the same 7-line / 120-word budget. Trim order is now heads-up → money → changes beyond two, so a receipt can never push out the HW5 beat. The academic-only brief is unchanged (its tests are untouched).

**Ask Semora.** Money questions are answered by a deterministic handler (`financeAnswer`) with the calculation and citations, even when an LLM key is set; everything else falls through unchanged.

**Seed.** `engine/seed/finance.ts` (28 raw emails) is separate from `seedMessages()`; `demoMessages()` = both, and is what the server serves. This keeps the academic dataset and its tests byte-for-byte as before.

---

# Phase 4: Semora (final merge before deployment)

## 12. How to restructure the app into Semora

| Option | Trade-offs |
| --- | --- |
| A. New dashboard app beside the old one | Fastest to make pretty, but duplicates state, routing and components, and the academic engine's views would drift from the new shell. |
| B. Re-theme only (rename + palette) | Zero regression risk, but leaves no dashboard, no storage view, no persistent assistant, and the flat sidebar that the brief explicitly wants replaced. |
| **C. Same engine and pages, new shell around them** | Keep every engine, page and test; add new views (Dashboard, Daily Digest, Storage & Spam, Courses, Connections/Settings) that only *read* reconciled state; move theming to semantic tokens; one shared chat behind both the panel and the Ask page. |

**Choice: C.** Notes:
- **Palette.** Brand colors are tokens; Taupe (2.85:1 on Ivory) is used only for fills and indicators, text accents use a deepened taupe (5.1:1), primary buttons use Walnut (8.3:1). The sidebar is Espresso in both modes. Seasons change only the fill accent, soft tint and ambient wash.
- **Inbox health** (`engine/health.ts`) is read-only: composition, promo senders, large attachments (Gmail `sizeEstimate`), spam folder. Storage quota is `null` unless an authorized API provides it (Gmail read-only can't). Cleanup steps open Gmail searches; deleting needs `gmail.modify`, not requested.
- **Spam** is flagged on messages and excluded from academic and Money reconciliation (tested byte-identical).
- **Assistant.** New deterministic handlers (priorities, catch-up, replies, drafts, course changes, which deadline wins) run before the LLM; answers mark estimates and Semora's own judgments; drafts are text plus a Gmail compose link, never sent.
- **Routes.** `/` is the Dashboard; This Week moved to `/week`; `/money` redirects to `/subscriptions`.

## 13. A custom-designed feel: display type and signature effects

Goal: the app worked and was warm, but read as a well-made generic dashboard (one sans everywhere, numbers as inline text, flat surfaces). The ask was "award-winning, custom-designed", using Motion plus a few React Bits / Magic UI components, without breaking the demo or Render Free.

| Option | Trade-offs |
| --- | --- |
| A. Install Magic UI / React Bits through their shadcn-style CLI | Fastest path to their exact components, but both assume Tailwind. Adding Tailwind means a second styling system beside `styles.css` tokens, a PostCSS step, and components that ignore seasons and dark mode unless rewritten anyway. |
| **B. Port a few chosen components onto Semora's tokens + Motion, add one display serif** | `web/src/fx.tsx` holds four adapted effects (Number Ticker, Blur Text, Spotlight Card, Border Beam), each a few lines on CSS variables and the Motion we already ship. Fraunces (self-hosted via `@fontsource-variable`, latin subsets only, ~67 KB woff2) gives the editorial voice. No new runtime dependency besides the font; +~1 KB gzipped JS. |
| C. Leave components alone; only restyle CSS | Lowest risk, but nothing moves with purpose, and the dashboard's numbers stay buried in a sentence. |

**Choice: B.** Each effect explains state rather than decorating it: the greeting focuses in on arrival, the four at-a-glance numbers count up and become doors to their views, a slow beam circles the Morning Brief only until you open it, the sidebar highlight glides to the page you chose (Motion `layoutId`), and a warm spotlight follows the pointer on dashboard panels. Fraunces is limited to titles, the brand and big figures; all UI text stays Inter. Everything stops under `prefers-reduced-motion`, text content is unchanged (smoke test reads `Good morning…`), and the font ships inside the build, so the Render container needs no network for it.
