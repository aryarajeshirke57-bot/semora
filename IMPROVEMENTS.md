# Improvement rounds

Each round: walk the demo path with Playwright, fresh screenshots, a fresh-context reviewer (product designer + skeptical judge) names the 3 changes that matter most, implement, re-run tests, verify with new screenshots, commit.

Baseline screenshots: `screenshots/base/` (first build) → `screenshots/polish1/` (two design-critique passes: dev pill collision, loud workload bars, missing office-hours end time, bare "Due" on date-only deadlines, unreadable week-strip pills on phone).

## Round 1
Reviewer's top 3, all implemented:
1. **Changed leads with the headline beat, and the numbers agree.** Changes that triggered a cascade (HW5) and live changes sort first; the Needs-confirmation card moved below the changes. One source count everywhere: the drawer used to say "5 messages" while the row said "3 sources"; it now says "3 sources + 2 related".
2. **A genuine conflict never shows a guessed date.** `reconcile.ts` clears `due`/`start` on conflicted items; rows and the drawer show "Mon Nov 16 or Tue Nov 17 — unconfirmed". New test assertions in beat 11.
3. **Demo end-state reads as resolved.** "Next week" label derives from the data (was hardcoded); approved cascade cards collapse to a one-line "Approved · …" row so the week list is back above the fold; a resolved conflict shows "Resolved by Prof. Okafor" instead of "Changed".

Before: `screenshots/polish1/light-desktop-changed.png`, `screenshots/polish1/light-desktop-live3-week.png`
After: `screenshots/round1/light-desktop-changed.png`, `screenshots/round1/light-desktop-live3-week.png`
Tests: 23/23 pass, typecheck and lint clean, no console errors.

## Round 2
Reviewer's top 3, all implemented:
1. **Ask Semora reconciles instead of keyword-searching.** "Is HW5 still due Friday?" now answers *"Not anymore. HW5 is due Mon Nov 16, 11:59 PM (Applies to Section B)"* with *"Was Fri Nov 13 — Prof. Whitfield changed it on Piazza, Tue Nov 10"* and citations to the evidence. "When is Midterm 2 and where?" reports the new room and the old one. "Before Thursday" is now exclusive (it used to list Thursday items) and, when nothing qualifies, says so and lists what comes right after (`server/ask.ts`).
2. **Phone overlays.** The demo pill is a 40px icon under 640px and hides while the detail sheet is open (it was covering the cascade week strip); old → new values read left-aligned as one unit.
3. **Time-zone trust.** "times in ET" under the This week header; two new engine tests: a Canvas `2026-11-17T04:59:00Z` due date shows as **Mon Nov 16, 11:59 PM** (not Nov 17), and Midterm 2 at 7 PM ET is `00:00Z` Nov 13 across the Nov 1 DST fall-back.

Before: `screenshots/round1/light-phone-changed.png`, `screenshots/round1/dark-phone-detail-hw5.png`
After: `screenshots/round2/light-phone-changed.png`, `screenshots/round2/dark-phone-detail-hw5.png`
Tests: 25/25 pass, typecheck and lint clean, no console errors.

## Round 3
Reviewer's top 3, all implemented (plus two small sheet leftovers: left-aligned old → new, no more "Applies to: Applies to…"):
1. **Every message keeps its own words.** Course pages and the Inbox used to show the *current* HW5 date on the Nov 9 Canvas post and staff email, as if they had said it. They now read "Said HW5 due Fri Nov 13, 11:59 PM — since changed", built from that message's own claim (`engine/state.ts`).
2. **Ambiguity is never silent.** A claim that fits several courses (two "HW5"s) or none is no longer dropped; it becomes a visible *"HW5 — which course?"* Needs-confirmation item with the candidates (`engine/reconcile.ts`). New test.
3. **Inbox agrees with the engine.** Jordan's "still due Friday" was tagged *noise* while linking to HW5; messages linked to a course item are now filed under Courses and carry an *Outdated* / *Question* chip. "Anonymous student" shows as "Piazza student" / "Ed student".

Before: `screenshots/round2/light-desktop-inbox.png`, `screenshots/round2/light-desktop-course-15-122.png`
After: `screenshots/round3/light-desktop-inbox.png`, `screenshots/round3/light-desktop-course-15-122.png`
Tests: 27/27 pass, typecheck and lint clean, no console errors.

## Round 4: custom-designed feel (PLAN.md decision 13)
1. **Editorial display type.** Fraunces (self-hosted) for page titles, sheet titles, the brand and big figures; Inter stays for UI. Paper grain under the ambient wash.
2. **Dashboard at a glance.** The summary sentence became four tiles with counting numbers (Magic UI Number Ticker pattern) that link to This Week, Changes, Waiting and Subscriptions; the greeting focuses in word by word (React Bits Blur Text pattern).
3. **Purposeful motion.** Sidebar highlight glides between pages (Motion `layoutId`); a border beam (Magic UI) circles the Morning Brief until it's opened; dashboard panels and tiles get a pointer spotlight (React Bits Spotlight Card). Subscriptions' monthly total counts up.
Also: added the missing `.gitignore` (node_modules, dist, .data, .env).
Verified: `npm run check` (90/90), `npm run build`, `npm run smoke` against dev and the production server, full screenshot walk via `npm run screenshots -- polish-fx` (light, dark, phone; output is local, not committed): no console errors, page errors or overflow.
