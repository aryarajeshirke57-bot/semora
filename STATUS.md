# Status

**Done**
- `PLAN.md`: 3-option analysis for all 8 major decisions, plus milestones.
- One command: `npm install && npm run dev` (API :8000 + web :5173). Runs on seeded data with no credentials.
- Engine (`engine/`): match, authority, section scope, intent, completion, uncertainty, cascade, evidence. 27 tests: one per story beat (1–11, 4b), the 3 live-script steps, time zones/DST, ambiguity, determinism.
- App: This week, Changed, Waiting on me, Grades (+ final calculator), Inbox, Course pages, Ask Semora, ⌘K, Connections/Settings, item detail sheet, simulate/reset demo controls, SSE live updates, light/dark, phone layout, keyboard (j/k/e/Enter/Esc/⌘K), reduced-motion support.
- Screenshots of every screen in light, dark and phone width in `screenshots/` (base → polish1 → round1–3); each reviewed. No console errors, page errors or horizontal overflow (`screenshots/round3/console-report.txt`).
- `README.md`, `DEMO.md`, `IMPROVEMENTS.md` (3 committed rounds, each reviewed by a fresh-context subagent).

- **Money** (phase 3): `engine/finance.ts` + 28 seeded billing emails, Money view, subscription sheet, Changed/Waiting/Inbox/⌘K/Brief integration, deterministic Money answers in Ask. 41 new tests (`finance`, `brief-money`, `ask-money`), including a byte-identical check of the academic engine with billing mail present. Screenshots: `screenshots/money2/` (light, dark, phone), plus a full regression walk in `screenshots/regress/` and `regress-intro/` — no console errors or overflow.

- **Semora** (phase 4): rebrand, warm token system with light/dark/system and four seasons, grouped collapsible sidebar, Dashboard, Daily Digest, Storage & Spam, Courses, Connections/Settings, assistant panel with follow-ups, free-trial alert actions, inbox upgrade, deploy hardening. 90 Vitest tests (`semora.test.ts`, `ask-semora.test.ts` new), `npm run smoke` passes against dev and the production build, full regression screenshots in `screenshots/semora-regress/` and `semora-intro/` with no console errors or overflow.

**Not verified / left**
- Semora: no hosted deploy has been run (needs an account; see DEPLOY.md). Read/unread isn't synced from Gmail, so "unread" questions answer with "last 24 hours" and say so. Storage quota is unavailable with read-only Gmail. Cleanup actions are Gmail searches, not deletions. Demo state is shared by everyone on one deployment.
- Money on real Gmail: HTML receipts, the 120-day billing query and the LLM finance extractor are implemented but untested against a real inbox or key. Rule extraction is tuned to common receipt wording; unusual formats need the LLM path.
- Money: no incremental Gmail sync (full re-fetch each poll), no currency conversion (non-USD shown, not totaled), renewal dates are only the ones an email states (no projected next dates), refunds are recorded but not netted against totals.
- Live connectors (Canvas, Gmail, Google Calendar, Gradescope, Piazza, Ed) and the OpenRouter extraction/Ask path are written against the documented APIs but were never run against real accounts or a real API key. Gradescope and Piazza are unofficial and likely need adjustment.
- Calendar write-back (`events.patch`) is implemented but untested; in demo mode approving a move only changes Semora's own state.
- Rule-based extraction is tuned to the seeded story; unseen phrasing will need the LLM path or more rules.
- Ideas not built: undo for approved proposals, per-section "other students' view", opt-in shared course truth (roadmap blurb only).
