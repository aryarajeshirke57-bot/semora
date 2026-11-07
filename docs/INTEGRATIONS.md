# Integrations

Every connector implements the same interface: authenticate, fetch since a cursor, normalize into Semora's item model, report sync status and freshness. Each one is off until its env vars are set; the seeded demo source is always available. Verify endpoint details against current official docs before relying on them — these notes are a starting point, not gospel.

## OpenRouter (LLM)
- OpenAI-compatible API. Base URL `https://openrouter.ai/api/v1`, header `Authorization: Bearer $OPENROUTER_API_KEY`.
- Use the official OpenAI SDK with `base_url` set. Models are configured by `LLM_MODEL_FAST` and `LLM_MODEL_SMART`; pick sensible defaults and document them.
- Use structured (JSON) outputs for extraction and classification. Cache responses keyed by a hash of the input so re-syncs are free and demos are deterministic.
- Docs: https://openrouter.ai/docs

## Canvas (CMU instance: https://canvas.cmu.edu)
- Auth: a personal access token from Canvas → Account → Settings → "New Access Token", sent as `Authorization: Bearer <token>`. (Some institutions restrict token creation; if so, fall back to the calendar feed.)
- Useful REST endpoints (base `/api/v1`):
  - `GET /courses?enrollment_state=active`
  - `GET /courses/:id/assignments` (due dates, points)
  - `GET /announcements?context_codes[]=course_:id`
  - `GET /calendar_events` and `GET /users/self/upcoming_events`
  - `GET /users/self/todo`
  - `GET /courses/:id/students/submissions?student_ids[]=self&include[]=assignment` (scores)
- Pagination uses the `Link` header.
- **Calendar feed:** Canvas → Calendar → "Calendar Feed" gives a private .ics URL (`CANVAS_ICS_URL`). No token needed; the fastest live win.
- Docs: https://canvas.instructure.com/doc/api/

## Gmail
- Google Cloud project with the Gmail API enabled; OAuth client (Web) with redirect `GOOGLE_REDIRECT_URI`. Keep the OAuth consent screen in **Testing** and add teammates as test users.
- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- `users.messages.list` with `q` (e.g. `newer_than:14d`, `in:sent` for promises), then `users.messages.get` (`format=full` or `metadata`). Use `historyId` for incremental sync.
- Store extracted facts and message IDs/links, not full bodies.
- Money uses the same read-only scope: a third query looks back 120 days for billing-like mail (`receipt OR subscription OR renew …`, excluding Promotions). HTML-only receipts are converted to text with link targets kept, so manage links can be domain-checked.
- Docs: https://developers.google.com/gmail/api

## Google Calendar
- Same Google project and OAuth flow. Read with `https://www.googleapis.com/auth/calendar.readonly`; request `calendar.events` only when the user first approves a write (incremental authorization).
- `events.list` for the week; `events.patch` to move an event after approval.
- Docs: https://developers.google.com/calendar/api

## Gradescope
- No official public API. Community libraries exist that log in with the student's own credentials and read courses, assignments and scores (search PyPI/GitHub, e.g. "gradescope api"); evaluate one, or scrape the student's own dashboard pages with a logged-in session.
- Read only the student's own data, rate-limit politely, and isolate this connector so breakage doesn't affect others. Seeded data covers the demo.

## Piazza
- No official public API. The community `piazza-api` Python package logs in with the student's credentials and reads posts for given network (class) IDs.
- Map posts to courses via `PIAZZA_NETWORK_IDS`. Use the author's role (instructor / student) — critical for authority ranking.

## Ed Discussion
- Ed exposes an API used by its web app; an API token can be generated in Ed's settings, and community wrappers exist (e.g. `edapi`). Region-specific base URL (`ED_REGION`, e.g. `us`).
- Same role mapping as Piazza.

## Normalized item model (suggested)
`id, source, source_id, source_url, course, kind (assignment|exam|event|office_hours|announcement|message|promise|grade|opportunity|admin), title, due_at, starts_at, ends_at, location, section_scope, author_name, author_role (instructor|ta|staff|student|self|system), sent_at, summary, raw_ref, confidence`

Reconciled "truth" records reference the normalized items that support them, the item that won, and why (rule or model, with a short human-readable reason shown in the UI).
