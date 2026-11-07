# Demo dataset and story

Implement this seeded dataset faithfully. All people and email addresses are fictional; course numbers and buildings are real CMU ones. Generate the noise messages yourself, but keep the story messages' facts exactly as written (wording can be lightly polished).

## Clock
- Demo mode freezes "now" at **Wednesday, November 11, 2026, 9:00 AM ET** (`DEMO_NOW`).
- "This week" = Mon Nov 9 – Sun Nov 15. Show Mon Nov 16 – Tue Nov 17 as "Next week".

## The student
- **Alex Chen**, CMU sophomore, School of Computer Science. Email `alex.chen@andrew.cmu.edu`.
- Enrolled in **Section B** for 15-122 (this matters for beat 3).

## Courses
| Course | Title | Instructor | Staff |
| --- | --- | --- | --- |
| 15-122 | Principles of Imperative Computation | Prof. Dana Whitfield | Head TA Priya Raman |
| 21-241 | Matrices and Linear Transformations | Prof. Marcus Lee | TA Sam Ortiz |
| 15-151 | Mathematical Foundations for Computer Science | Prof. Elena Sorokin | TA Noah Feld |
| 76-101 | Interpretation and Argument | Prof. James Okafor | TA Maya Lindqvist |

Classmates who appear: Jordan Kim (15-122, also Section B), Riley Patel (15-122, Section C), and Alex's 76-101 presentation group: Sofia Marquez, Ethan Brooks.

## Story beats (all must work end to end, each with an engine test)

**1. A deadline is set.** Canvas announcement, 15-122, Mon Nov 9, 10:12 AM, by Prof. Dana Whitfield:
> "Homework 5 (Memory and Pointers) is now released. It is due Friday, November 13 at 11:59 PM on Autolab."

→ One item: *15-122 HW5 — due Fri Nov 13, 11:59 PM*.

**2. A duplicate arrives.** Email, Mon Nov 9, 10:30 AM, from `15122-staff@cs.cmu.edu` (role: course staff), subject "[15-122] HW5 released":
> "HW5 is out! Due Friday 11/13 at 11:59pm. Start early — the pointer questions take time."

→ No new item. The HW5 item now shows **2 sources**.

**3. A section-specific extension.** Piazza post, 15-122, Tue Nov 10, 4:05 PM, by Prof. Dana Whitfield (role: instructor), pinned:
> "Because Tuesday's Section B recitation was canceled, **Section B only** gets an extension on HW5 to **Monday, November 16 at 11:59 PM**. All other sections: the deadline is unchanged (Friday 11/13)."

→ Alex is in Section B, so the HW5 item changes to *due Mon Nov 16, 11:59 PM*. It appears in **Changed** as "Fri Nov 13 → Mon Nov 16", with "Prof. Whitfield · Piazza · applies to Section B (your section)" and all 3 sources linked.

**4. A classmate repeats the old date.** Email reply in a study-group thread, Tue Nov 10, 9:40 PM, from Jordan Kim (role: student):
> "wait HW5 is still due Friday right?? trying to plan my week"

→ Semora keeps Monday. Jordan's message is shown on the HW5 item as **Outdated — superseded by Prof. Whitfield's correction**.

**4b. A question is not a change.** Piazza follow-up, Tue Nov 10, 5:12 PM, from Riley Patel (role: student, Section C):
> "Could Section C get the Monday extension too? Our recitation was pretty rushed."

→ No change to anything. If shown, labeled as a question.

**5. The cascade.** Google Calendar event (Alex's calendar): "HW5 study session" Thu Nov 12, 7:00–10:00 PM, Gates Hillman Center 5th floor, attendees Alex Chen and Jordan Kim.
→ Because HW5 moved, Semora proposes: (a) move the study session to Sun Nov 15, 2:00–5:00 PM (or a free slot it finds), and (b) a drafted message to Jordan:
> "Heads up — Prof. Whitfield extended HW5 to Monday 11:59pm for Section B (pinned on Piazza). Want to move our Thursday session to Sunday afternoon?"

Both require a tap to approve. Approving the move animates the calendar block to its new slot.

**6. A promise in sent mail.** Sent email, Mon Nov 9, 6:20 PM, from Alex to Sofia Marquez and Ethan Brooks, subject "76-101 presentation":
> "Sounds good — I'll send our slides Thursday so we can rehearse before Friday's presentation."

→ Under **Waiting on me**: *Send 76-101 presentation slides to Sofia and Ethan — by Thu Nov 12*. The 76-101 group presentation (Fri Nov 13, in class) appears in This week.

**7. A room change, with a stale source.** Canvas calendar event, 21-241: "Midterm 2" Thu Nov 12, 7:00–8:30 PM, **Doherty Hall 2210**. Then email, Tue Nov 10, 12:00 PM, from Prof. Marcus Lee (role: instructor), subject "[21-241] Midterm 2 room change":
> "Midterm 2 on Thursday has moved to **Wean Hall 7500** because of enrollment. Same time, 7:00 PM."

→ Changed: "Doherty Hall 2210 → Wean Hall 7500". The Canvas calendar entry is marked stale.

**8. A cancellation.** Canvas announcement, 15-151, Wed Nov 11, 7:45 AM, by Prof. Elena Sorokin:
> "My office hours today (Wednesday, 3:00–5:00 PM, GHC 6115) are canceled. I'll hold extra hours Friday 1:00–3:00 PM in the same room."

→ Changed: Wednesday office hours shown as canceled; Friday extra hours added.

**9. New grades.** Gradescope:
- 15-122 Written Homework 4: **88/100**, posted Tue Nov 10.
- 21-241 Quiz 6: **9/10**, posted Mon Nov 9.

Also seed earlier grades so averages are meaningful (e.g. 15-122 written homeworks 1–3, programs 1–4; 21-241 quizzes 1–5 and Midterm 1; 15-151 problem sets 1–6; 76-101 essay 1). Include each course's grading weights so "what do I need on the final" works.

**10. A buried opportunity.** Email, Mon Nov 9, 8:00 AM, "SCS Undergraduate Newsletter — Week of Nov 9". Among event listings and announcements, one item:
> "Undergraduate research assistant wanted in a Human-Computer Interaction lab: build prototypes for AI-assisted study tools. Sophomores and juniors welcome. Apply by **Friday, November 20**."

→ Surfaces under Opportunities with its deadline.

**11. A genuine conflict.** 76-101 syllabus on Canvas says the Essay 2 draft is due **Tue Nov 17**. Email, Tue Nov 10, 2:15 PM, from TA Maya Lindqvist (role: TA):
> "Reminder that Essay 2 drafts are due Monday!"

→ Both are course staff and they disagree, so the item shows **Needs confirmation** with both sources and a one-tap drafted question to the TA.

## Live script for "Simulate incoming message"
Each press injects the next message, with animation:

1. **Time change.** Email from Prof. Marcus Lee: "Small update: Midterm 2 will start at 7:30 PM instead of 7:00 PM, still in Wean Hall 7500." → the midterm item's time morphs 7:00 → 7:30 and it appears at the top of Changed.
2. **Promise fulfilled.** Sent email from Alex to Sofia and Ethan: "Slides attached! Let me know what to change." (with an attachment) → the Waiting-on-me item closes with the completion animation.
3. **Conflict resolved.** Canvas announcement from Prof. James Okafor: "Clarifying: Essay 2 drafts are due Tuesday, November 17." → the Needs-confirmation item resolves to Tue Nov 17, crediting the instructor.

"Reset demo" restores the seeded state.

## Noise (about 130 messages)
Realistic, varied and dated across Nov 2 – Nov 11, so the headline number is real ("~150 messages in, a handful of things you need to know"). Mix:
- Department and university newsletters, CMU events, dining and housing notices.
- Club emails (ScottyLabs, a robotics club, a dance club, intramural sports), including a few Discord-style digests.
- Promotions and retail email, a few package-delivery notifications.
- Piazza/Ed posts that are questions or chatter without changes.
- Canvas announcements with no action required.
- A couple of financial aid / registrar notices that are informational (one with a real action and deadline: "Confirm your spring registration time by Nov 18").

Keep timezone handling correct (America/New_York) everywhere.

## Money (billing email, `engine/seed/finance.ts`)
Kept separate from the story beats above (`demoMessages()` = both). Sep 3 – Nov 10; real service names, fictional amounts and accounts.
- **Spotify Premium Individual** $11.99/mo: three receipts + PayPal's receipt for the same Nov 3 charge → one subscription, one charge. Active, renews Thu Dec 3. A "Try Premium Family" promo is ignored.
- **YouTube Premium** $13.99/mo, renews Fri Nov 20. **Apple Music Student** $5.99/mo and **iCloud+ 50 GB** $0.99/mo — two plans from one sender, kept apart.
- **Google One 100 GB**: $1.99 receipt → price notice ($1.99 → $2.99 from Nov 15) → another $1.99 receipt → renewal notice at $2.99 confirms. Price changed, counted at $2.99.
- **Adobe Creative Cloud Photography**: free trial ends Fri Nov 13, then $19.99/mo. Not counted. A 60%-off student promo is ignored.
- **Amazon Prime** $139.00/yr renews Wed Nov 18 (≈ $11.58/mo). An Amazon calculator order ($119.99) is a one-time purchase.
- **Steel City Fitness** (unknown merchant) $24.99/mo: paid Oct 1, payment failed Nov 1.
- **Headspace** $12.99/mo: cancellation *requested* Nov 7, not confirmed → Cancel pending, not counted.
- **Netflix Standard** $15.49: cancellation confirmed Oct 30, access until Nov 12. A later newsletter doesn't revive it; a "payment failed" email from `netflix-account-help.example.net` (with instructions to AI assistants inside) is quarantined as a look-alike.
- **Super Duolingo**: $12.99/mo receipt vs $59.99/yr renewal notice → Needs confirmation.
- **Disney+** "$1.99/month" promo → ignored.
- Estimate: **$72.52/mo, $870.28/yr** over 7 subscriptions.
