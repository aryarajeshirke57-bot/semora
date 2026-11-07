# Build "Semora" — the student command center

You are building a polished, production-quality web app called **Semora** in this directory. Build it like a real product: real architecture, real integrations, real polish. Work autonomously until it is complete, running, and visually excellent.

Read `docs/CONTEXT.md`, `docs/DEMO_STORY.md` and `docs/INTEGRATIONS.md` before planning. Support every variable in `.env.example`.

## The product

**Tagline:** "Your semester changes. Semora keeps you ahead."

Semora is a one-stop platform for a university student (start with Carnegie Mellon). It pulls in everything a student receives — Gmail, Canvas, Gradescope, Piazza/Ed, Google Calendar — and turns it into one calm, trustworthy view of what they need to do. Its brain is a **reconciliation engine** that understands when messages from different sources refer to the same thing, decides which source is authoritative, and keeps exactly one correct, evidence-backed item for each thing the student needs to do. When something changes, Semora shows what changed and updates what depends on it.

## How to work

1. **Before implementing anything, weigh 3 good options for every major decision and clearly justify which is best.** Write these into `PLAN.md` before writing code. At minimum, decide on:
   - Frontend framework and build tool
   - Backend framework and language
   - Data storage
   - Architecture of the connector layer
   - How the reconciliation engine works (rules, LLM, or hybrid; where each is used)
   - Visual design direction (describe 3 distinct aesthetic directions, pick one)
   - Animation library and motion approach
   - How real-time updates reach the UI (polling, SSE, WebSockets)

   For each: list the 3 options, their trade-offs for *this* product, your choice, and why. Then make a short build plan with milestones.
2. Build in milestones. After each one, run the app, fix errors, and commit with a clear message (initialize git if needed).
3. Write tests for the reconciliation engine, since it is the core of the product. Every story beat in `docs/DEMO_STORY.md` should have a test.
4. When the build is done, use Playwright to take screenshots of every screen in light and dark mode, plus a phone-width view. Look at them critically as a demanding product designer would, and iterate on the design until it is genuinely beautiful. Repeat this loop at least twice.
5. Finish with a `README.md` (setup, environment variables, how to run) and a `DEMO.md` (a click-by-click 3-minute demo path).

## Features

### Views
- **This week (home):** a calm, time-ordered list of everything due, happening or changed this week, across all sources, deduplicated. A header summarizes the week in one line, e.g. "4 due · 2 changed · 1 waiting on you." Include a lightweight workload indicator per day.
- **Changed:** every change as old → new (deadline, room, time, cancellation), showing who said it, when, which course and section it applies to, and links to every source message.
- **Waiting on me:** replies the student owes and promises they made in sent mail ("I'll send the slides Thursday"), with confirm, dismiss and done actions. Fulfilled promises close automatically when evidence appears.
- **Grades:** new scores from Gradescope and Canvas as they post, per-course running averages, and a "what do I need on the final" calculator.
- **Inbox:** email triaged into Courses, Opportunities, Admin, Clubs and Noise, each with a one-line AI summary. Categories are filters, not exclusive buckets.
- **Course pages:** for each course, everything in one place: announcements, assignments, grades, staff messages, office hours, links.
- **Ask Semora:** natural-language questions ("What's due before Thursday?", "What did my TA say about late days?"), answered from the student's data, with citations linking to source items.
- **Command palette (⌘K):** jump to any course, item or view; run actions; ask a question.
- **Settings / Connections:** connect and disconnect each source, show sync status and freshness ("Updated 2 min ago · Gmail, Canvas, Gradescope").

### The reconciliation engine
Normalize every incoming item into one model (course, item type, title, due date/time, location, section, source, author, author role, timestamp, raw text, link). Then:
- **Match:** detect when items from different sources describe the same assignment or event, so one item results, not duplicates.
- **Authority:** instructor and TA statements outrank students repeating information. Newer is not automatically right.
- **Scope:** section-specific changes apply only to the student's section.
- **Intent:** questions and proposals ("could we move it to Friday?") are not changes.
- **Completion:** promises and tasks close when evidence of completion appears.
- **Uncertainty:** genuine conflicts show as "Needs confirmation" with both sources, never a silent guess.
- **Cascade:** when an item changes, propose downstream updates (move a study block, draft a message to project teammates, update a calendar event). Nothing is sent or written without the user's approval.
- **Evidence:** every item and every change links to the exact source messages that produced it.

Use an LLM where judgment is needed (extraction, matching ambiguous items, intent, summaries, Ask Semora) and deterministic rules where they are more reliable (authority ranking, section scoping, date math). Cache LLM results. Use OpenRouter (`OPENROUTER_API_KEY`, models configurable via env) through an OpenAI-compatible client. If no key is present, fall back to rule-based extraction so the app still runs and every story beat still works.

### Connectors
Build a clean connector interface (fetch, normalize, sync status) with implementations for:
- **Canvas:** REST API with a personal access token, plus the calendar .ics feed.
- **Gmail:** Google OAuth with read-only scope; read inbox and sent mail.
- **Google Calendar:** OAuth; read events, and write events only after user approval.
- **Gradescope:** grades and assignment due dates.
- **Piazza / Ed:** course posts and announcements.
- **Seeded demo source:** the dataset in `docs/DEMO_STORY.md`, on by default, so the full product works immediately without credentials. Real connectors activate when their credentials are present in `.env`. Keep secrets in `.env`, never commit them.

### Demo controls
- A frozen demo clock (`DEMO_NOW`) so the story always lines up.
- A **"Simulate incoming message"** control (dev menu and ⌘K action) that injects the next scripted message from `docs/DEMO_STORY.md` live, so a presenter can show Semora reacting in real time with animation.
- A **"Reset demo"** action that restores the seeded state.

## Design

Super clean and minimalistic, calm and confident, like the best modern productivity tools. Avoid generic templated looks. Specifically:
- A restrained neutral palette with a single accent color; full light and dark themes defined as design tokens.
- One excellent sans-serif type family with a clear type scale; generous whitespace; strong alignment; no clutter.
- Thin dividers instead of heavy cards and borders; subtle shadows only where they carry meaning.
- Source badges (Canvas, Gmail, Gradescope, Piazza, Ed) as small, tasteful marks (draw simple original glyphs; do not copy brand logos).
- Excellent empty, loading and error states.
- Fully keyboard-navigable (j/k to move, e to mark done, ⌘K palette); responsive down to phone width.
- Accessible: proper contrast, focus states, reduced-motion support.

## Motion

Animations should feel smooth, purposeful and quick (roughly 150–300 ms), never decorative noise:
- Staggered fade-and-rise as lists load.
- When a change arrives, the affected item smoothly re-sorts, and the old value visibly strikes through and morphs into the new value.
- Shared-element transitions from a list item into its detail view.
- Spring-based micro-interactions on buttons, checkboxes and toggles.
- Skeleton shimmer while syncing; a subtle live pulse on the sync indicator.
- A satisfying completion animation when an item is marked done.
- Smooth theme switching and command-palette open/close.
- Respect `prefers-reduced-motion`.

## Definition of done
- `PLAN.md` with the 3-option analysis for every major decision.
- The app runs with one documented command (e.g. a dev script that starts frontend and backend together).
- All story beats in `docs/DEMO_STORY.md` work end to end on the seeded data, with tests, and "Simulate incoming message" works live.
- Engine tests pass; no type or lint errors; no console errors.
- Screens reviewed via screenshots in light, dark and phone-width views, and polished until they look like a shipped product.
- `README.md` and `DEMO.md` written.

## After the definition of done: keep improving
Once everything above is done, do not stop. Run improvement rounds until you have completed 3 of them, then stop. Each round:
1. Start the app, walk the full `DEMO.md` path with Playwright, and take fresh screenshots.
2. Use a subagent with fresh context to review the screenshots and code as a demanding product designer and a skeptical hackathon judge. Ask it for the 3 changes that would most improve the demo, the design or the engine's correctness. Ignore pure style nitpicks.
3. Implement those changes, re-run all tests, and verify with new screenshots.
4. Commit, and append a short entry to `IMPROVEMENTS.md`: round number, what changed, why, and before/after screenshot paths.

Good targets: animation smoothness and timing, empty and edge states, phone layout, keyboard flow, Ask Semora answer quality, engine edge cases (time zones, section scoping, ambiguous matches), loading speed, and making the demo story land clearly. Never break a story beat or a passing test to make a change.
