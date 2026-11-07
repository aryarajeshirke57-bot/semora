# Semora — project instructions

**Semora** is a student command center built for the ScottyLabs NOVA 2026 hackathon at CMU. Tagline: *"Your semester changes. Semora keeps you ahead."* It reads Canvas, Gmail, Google Calendar, Gradescope, Piazza and Ed, decides **which message wins** when they disagree (authority, section scope, intent, completion), and cascades the consequences into the student's plans.

## Status: built and demo-ready
The full app works on seeded data with no credentials. Typecheck, lint and all tests pass (`npm run check`). Teammates are now experimenting on top of it, so **keep the demo working**: every story beat in `docs/DEMO_STORY.md` has a test, and those tests must stay green.

## Read first
- `README.md`: run it, env vars, architecture in one page.
- `DEMO.md`: the 3-minute judged demo path. It's the product's most important user.
- `PLAN.md`: every major decision with 3 options weighed (decisions 1–10), plus the phase-2 plan (Morning Brief, opening sequence).
- `PROMPT.md`: the original full build brief (product, design, motion, definition of done).
- `docs/CONTEXT.md`: why the product exists, what judges reward, the competition, and feedback already received. Use it for product decisions.
- `docs/DEMO_STORY.md`: the seeded dataset and story beats. `docs/INTEGRATIONS.md`: how each real connector works.
- `STATUS.md` (what's verified and what isn't) and `IMPROVEMENTS.md` (the design-review log).

## Map
- `engine/`: pure TypeScript, no I/O. `reconcile.ts` (the brain), `extract-rules.ts` (claims from messages), `brief.ts` (Morning Brief), `finance.ts` (Money: subscriptions from billing email; separate from the academic engine), `health.ts` (inbox health, read-only), `state.ts` (builds what the UI gets), `seed/` (the demo dataset and live script), `types.ts` (the shared model).
- `server/`: Hono API on :8000, SSE live updates, connectors (`connectors/`), Ask Semora, OpenRouter client.
- `web/src/`: React 19 + Vite + Motion. `pages.tsx` (all views), `ui.tsx` (shared pieces), `overlays.tsx` (detail sheet, ⌘K, demo menu), `brief.tsx`, `intro.tsx` (chaos → clarity opening), `money.tsx` (Subscriptions view, subscription sheet, trial alert), `views.tsx` (Dashboard, Daily Digest, Storage & Spam, Courses, Connections, Settings), `assistant.tsx` (shared chat: panel + Ask page), `charts.tsx`, `theme.ts` (scheme/season persistence), `styles.css` (design tokens; light and dark).
- `tests/`: Vitest (`engine.test.ts` covers the story beats; `brief.test.ts`; `finance.test.ts`, `brief-money.test.ts`, `ask-money.test.ts` cover Money). `scripts/`: Playwright screenshots (`npm run screenshots -- <name>`, `npm run screenshots:intro -- <name>`).

## Commands
`npm install` · `npm run dev` (http://localhost:5173) · `npm run check` (types + lint + tests) · `npm run smoke` (browser smoke test; app running) · `npm run serve` (production) · deploy: `DEPLOY.md` · `?intro=1` replays the opening, `?intro=0` skips the opening and the brief.

## Working rules
- Before a major change, weigh 3 good options and add the choice to `PLAN.md`.
- Work on a branch named after the experiment (e.g. `exp/notifications`). Commit after each milestone with a clear message.
- Run `npm run check` before every commit. Don't weaken a story-beat test to make it pass; fix the engine instead.
- The app must keep running fully on seeded data with no credentials. Real connectors switch on only when their env vars are present.
- Never commit `.env` or any secret. Use read-only scopes unless the user approves a write. Nothing is sent or written without a tap.
- Every derived item must link to the source messages it came from.
- After UI changes, screenshot the affected screens (light, dark and phone width) with the scripts in `scripts/` and look at them before calling it done.
- Design language: warm editorial on the Semora palette (Espresso, Walnut, Taupe, Sand, Ivory). Use the semantic tokens in `styles.css`; Taupe is for fills, not text. Motion explains state changes. Don't add new colors or fonts casually.
