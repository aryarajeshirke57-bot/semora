# Context: why Semora exists and what wins

Use this to make product and design decisions. When in doubt, choose what makes the demo more trustworthy and more clearly different from existing tools.

## The event
- **ScottyLabs NOVA 2026**, CMU's annual GenAI hackathon. Saturday Nov 7, 2026, Swartz Center (Tepper).
- Hacking 11:00 AM – 5:00 PM. Judging presentations 6:00 – 7:45 PM. People's Choice voting 7:45 – 8:30 PM at the team's table.
- Teams of up to 4. OpenRouter API keys are provided to teams. Pre-existing code must be disclosed at judging.
- Awards: **Grand Prize** ($2,000, best overall), **Most InNOVAtive** (most innovative ideas), **Beyond Limits** (most unique methods), **Looks Good, Works Good** (best user design), **Community Favorite** (People's Choice vote).
- Past winners were narrow, demo-able tools that turn messy input into a clear action for a specific person, with a quantified before/after (e.g. 2025 Grand Prize ReliefIQ: "decision time from hours to seconds"). Generic chatbots don't win.

## The problem
Students' plans break every time the semester changes. Course information is spread across Canvas, Gradescope, Piazza or Ed, email and group chats, and it doesn't stay put: a deadline announced on Canvas, repeated by email, extended on Piazza for one section only, then misquoted by a classmate after the correction. Each change quietly invalidates a study plan, a meeting or a promise to teammates. The hard part isn't finding information; it's knowing which version is current and what to do about it.

## Positioning
- **Tagline:** "Your semester changes. Semora keeps you ahead."
- **One-stop platform:** one place for email, Canvas, Gradescope, Piazza/Ed and calendar, organized by what you need to do, not where it came from.
- **The brain:** cross-source reconciliation — match, authority, scope, intent, completion, uncertainty — then cascade the consequences into the student's plans.

## Competition (be honest about it)
- **Gmail AI Inbox** (Google, rolling out to paid Workspace users from Oct 2026, US English) already extracts to-dos, deliverables and deadlines from email and summarizes status changes. So "AI summarizes your email" or "AI extracts your to-dos" is NOT a differentiator.
- What Gmail does not do: see Canvas, Gradescope or Piazza; deduplicate the same assignment across sources; weigh who said it (instructor vs. student); apply section-specific changes; update dependent plans.
- Canvas and other course platforms stay inside their own walls.

## Feedback we already received (honor it)
1. Don't claim "nobody else does this" without evidence.
2. The interesting problem is **deciding which message wins**. Newer is not automatically authoritative. Show this clearly in the UI.
3. Use three action-oriented views as the heart of the product: **Due soon / This week, Changed, Waiting on me**. Course, Professors, Clubs, Admin are filters, not exclusive categories (one message can contain a deadline and an opportunity).
4. Show coverage and freshness, e.g. "Updated 2 min ago · Gmail + Canvas". Never imply completeness Semora doesn't have.
5. When evidence conflicts, "Needs confirmation" is a good result.
6. Privacy must be honest and consistent with the features: Semora stores minimal extracted facts (task, date, course, section, status) plus links to source messages, not full bodies; the user can see and delete everything it remembers. Reading and acting (writing calendar events, sending drafts) are separate permissions, and every outward action needs a tap.
7. Scam detection is a separate product; keep it out of the core.

## The demo moment judges should remember
"It caught the deadline change my calendar missed — and it didn't fall for my classmate repeating the old date." Then the cascade: the study block moves and a message to the group is drafted. Close on a real number from the seeded data, e.g. "150 messages in, 6 things you actually need to know."

## Long-term vision (for an in-app "About" or roadmap screen, optional)
When many students in a course opt in, Semora becomes a shared, self-correcting source of truth for the course: an instructor's section extension reaches every affected student, stale dates in group chats get flagged for everyone, and instructors see a confusion signal ("many students have conflicting dates for HW5").
