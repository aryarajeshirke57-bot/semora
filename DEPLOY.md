# Deploying Semora

Semora is one Node process: the Hono server serves the API, live updates (SSE) and the built web app on `$PORT`. It runs fully on seeded demo data with **no secrets**.

## Verified locally
- `npm run build` → `dist/`; `npm run serve` serves it (production mode, one port).
- Deep links survive a refresh (`/subscriptions`, `/storage`, …), unknown `/api/*` paths return JSON 404, `/api/health` returns `{ ok: true }`.
- Security headers on (`secureHeaders`: HSTS, nosniff, frame-options, referrer-policy). No CORS middleware: the API is same-origin only.
- `SEMORA_URL=http://localhost:8100 npm run smoke` passed against the production build (every route at desktop and phone width, sidebar, themes, assistant, trial actions).
- Not verified: an actual deploy to a hosting provider (needs your account).

## Option A — Render (Docker, free tier), ~5 minutes
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. `render.yaml` creates the `semora` web service from the `Dockerfile` with `DEMO_MODE=true` and health check `/api/health`.
3. Optional: set `OPENROUTER_API_KEY` in the service's Environment tab (the assistant and extraction work without it).
4. Open the `.onrender.com` URL. Free instances sleep when idle; the first load after a sleep takes ~30 s, so open it a few minutes before judging.

## Option B — Railway or Fly.io
Both detect the `Dockerfile`. Set `PORT` if the platform doesn't (Railway does), `DEMO_MODE=true`, and point the health check at `/api/health`.

## Option C — any VM
```bash
npm ci && npm run build
PORT=8000 DEMO_MODE=true npm run serve
```
Put it behind HTTPS (Caddy/nginx). Keep response buffering off for `/api/events` (SSE).

## Environment
| Variable | Needed | Notes |
| --- | --- | --- |
| `PORT` | host sets it | Defaults to 8000 |
| `DEMO_MODE` | no | `true` by default: seeded data, frozen clock |
| `OPENROUTER_API_KEY` | no | Server-side only; never sent to the browser |
| `APP_URL` | only for Google sign-in in dev | Leave empty in production (same origin) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | only for real Gmail/Calendar | Redirect URI: `https://<your-domain>/auth/google/callback`, also added to the OAuth client in Google Cloud; keep the consent screen in Testing with your teammates as test users |
| Canvas / Gradescope / Piazza / Ed vars | only for live sync | See `.env.example` |

## Know before the demo
- **Demo state is shared by everyone on the URL.** Approvals, checklist ticks and the live script are stored server-side in `.data/semora.json`. Use **Demo pill → Reset demo** (or `POST /api/demo/reset`) before you present.
- `.data/` lives on the container disk: it resets on redeploy, which is fine for the demo.
- Live connectors are implemented but have not been exercised against real accounts; don't connect a personal Google account on the public demo URL.
