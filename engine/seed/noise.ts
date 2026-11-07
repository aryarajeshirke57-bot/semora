import type { Platform, Role, SourceMessage } from '../types.ts';
import { CANVAS_IDS, PIAZZA_NETWORKS } from './courses.ts';
import { ALEX } from './story.ts';

// ~130 realistic messages a CMU sophomore gets in ten days. None of them change anything,
// except the few "extras" that carry a real action (a registrar deadline, a reply owed).

interface Spec {
  id: string;
  source?: Platform;
  channel?: SourceMessage['channel'];
  course?: string;
  from: string;
  email?: string;
  role?: Role;
  at: string; // "11-03 08:15"
  subject: string;
  body: string;
  section?: string;
  threadId?: string;
}

const iso = (at: string) => `2026-${at.replace(' ', 'T')}:00-05:00`;
let seq = 0;
const hex = () => (0x18f0a00000000000n + BigInt(++seq) * 0x9e3779b1n).toString(16);

function build(s: Spec): SourceMessage {
  const source = s.source ?? 'gmail';
  const channel = s.channel ?? (source === 'gmail' ? 'email' : source === 'canvas' ? 'announcement' : 'post');
  const url =
    source === 'gmail'
      ? `https://mail.google.com/mail/u/0/#inbox/${hex()}`
      : source === 'canvas'
        ? `https://canvas.cmu.edu/courses/${CANVAS_IDS[s.course ?? '15-122']}/discussion_topics/${300000 + seq++}`
        : source === 'piazza'
          ? `https://piazza.com/class/${PIAZZA_NETWORKS[s.course ?? '15-122']}/post/${300 + seq++}`
          : `https://edstem.org/us/courses/61204/discussion/${4100000 + seq++}`;
  return {
    id: s.id,
    source,
    channel,
    url,
    course: s.course,
    section: s.section,
    authorName: s.from,
    authorEmail: s.email,
    authorRole: s.role ?? 'external',
    to: source === 'gmail' ? [ALEX] : undefined,
    sentAt: iso(s.at),
    subject: s.subject,
    body: s.body,
    threadId: s.threadId,
  };
}

const DAYS = ['11-02', '11-03', '11-04', '11-05', '11-06', '11-07', '11-08', '11-09', '11-10', '11-11'];

const dining: Spec[] = DAYS.slice(0, 9).map((d, i) => ({
  id: `n-dining-${i}`,
  from: 'CMU Dining Services',
  email: 'dining@andrew.cmu.edu',
  at: `${d} 07:30`,
  subject: ['Today at The Exchange: harvest bowls', 'Taco Tuesday at Schatz', 'New at Tartan Express: ramen bar', 'Pop-up: apple cider donuts at Rothberg’s', 'Weekend hours for campus dining', 'Sunday brunch at Resnik', 'Late-night menu at The Underground', 'This week’s chef specials', 'Vegan options at Entropy+'][i],
  body: ['Harvest bowls with roasted squash and farro are on the menu at The Exchange today, 11 AM–2 PM.', 'Schatz Dining Room is serving build-your-own tacos tonight from 5 PM.', 'Tartan Express now has a ramen bar weekdays from 11 AM to 8 PM.', 'Apple cider donuts are back at Rothberg’s Roasters while supplies last.', 'Most campus dining locations open late and close early this weekend; check the dining app for hours.', 'Resnik Servery brunch runs 10 AM–2 PM on Sundays all semester.', 'The Underground late-night menu now runs until 2 AM on weeknights.', 'Chef specials this week include a lentil curry and a roasted chicken plate.', 'Entropy+ has expanded its grab-and-go vegan shelf.'][i],
}));

const packages: Spec[] = ['11-03 14:02', '11-05 11:40', '11-08 16:15', '11-10 13:20'].map((at, i) => ({
  id: `n-pkg-${i}`,
  from: 'CMU Mail Services',
  email: 'mailservices@andrew.cmu.edu',
  at,
  subject: 'Package ready for pickup',
  body: `A package (tracking ending ${['4471', '0938', '2215', '7760'][i]}) is ready for pickup at the University Center mail room. Bring your CMU ID.`,
}));

const PROMOS: [string, string, string][] = [
  ['Threadline', 'Up to 40% off fall layers', 'Our fall layers sale is on: flannels, fleeces and puffers up to 40% off this week only.'],
  ['Brew & Bean', 'Your free drink is waiting', 'You have a reward ready: one free drink at any Brew & Bean location near campus.'],
  ['StudyPal Premium', 'Unlock unlimited flashcards', 'Upgrade to StudyPal Premium for unlimited flashcards and offline mode, 50% off for students.'],
  ['Pittsburgh Ride Share', 'Rides home for Thanksgiving', 'Book your Thanksgiving ride home early and save 15% with code TARTAN15.'],
  ['Campus Store', 'Cyber week preview', 'Get a sneak peek at Campus Store cyber week deals on hoodies and laptops.'],
  ['Threadline', 'Last chance: free shipping', 'Free shipping on all orders ends tonight at midnight.'],
  ['Pixel Audio', 'Students save on headphones', 'Noise-cancelling headphones are 30% off with student verification.'],
  ['Brew & Bean', 'Pumpkin season is here', 'The pumpkin spice lineup is back for a limited time.'],
  ['FreshCart', '$20 off your first grocery order', 'New customers get $20 off groceries delivered to campus housing.'],
  ['StudyPal Premium', 'Your streak is at risk', 'You have not reviewed your deck in 3 days. Keep your streak alive!'],
  ['Lumen Bank', 'Your student account statement', 'Your monthly statement for your student checking account is ready to view.'],
  ['Pittsburgh Symphony', 'Student rush tickets this weekend', '$15 student rush tickets are available for Saturday’s performance.'],
  ['Pixel Audio', 'Gift guide for the holidays', 'Our holiday gift guide is here, with picks for every budget.'],
  ['FreshCart', 'Your cart misses you', 'You left 3 items in your cart. Complete your order for delivery tomorrow.'],
  ['CineMax Square', 'Two-for-one Tuesday', 'Bring a friend: two tickets for the price of one every Tuesday.'],
  ['Threadline', 'New arrivals just dropped', 'Fresh winter arrivals are here, including our best-selling parka.'],
  ['Campus Store', 'CMU gear for the holidays', 'Holiday CMU gear is in stock now; members get early access.'],
  ['Lumen Bank', 'Set up direct deposit', 'Get paid up to two days early when you set up direct deposit.'],
  ['TechTrade', 'Sell your old laptop', 'Get an instant quote for your old laptop and get paid in 48 hours.'],
  ['Brew & Bean', 'Double points weekend', 'Earn double points on every order this weekend.'],
];
const promos: Spec[] = PROMOS.map(([from, subject, body], i) => ({
  id: `n-promo-${i}`,
  from,
  email: `hello@${from.toLowerCase().replace(/[^a-z]/g, '')}.example.com`,
  at: `${DAYS[i % 10]} ${String(9 + (i % 9)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
  subject,
  body,
}));

const CLUBS: [string, string, string, string][] = [
  ['ScottyLabs', 'scottylabs@andrew.cmu.edu', 'ScottyLabs weekly — Sunday 11 AM', 'Our weekly meeting is Sunday at 11 AM in GHC 4401. We are planning NOVA logistics and TartanHacks sponsors.'],
  ['ScottyLabs', 'scottylabs@andrew.cmu.edu', 'NOVA 2026 is this Saturday!', 'NOVA, our GenAI hackathon, is this Saturday at the Swartz Center. Hacking runs 11 AM to 5 PM.'],
  ['ScottyLabs', 'scottylabs@andrew.cmu.edu', 'TartanHacks volunteers wanted', 'We are looking for volunteers to help run TartanHacks in February. Reply if you are interested.'],
  ['CMU Robotics Club', 'roboclub@andrew.cmu.edu', 'Build night this Thursday', 'Build night is Thursday 8 PM in the Roboclub shop. We are finishing the combat bot chassis.'],
  ['CMU Robotics Club', 'roboclub@andrew.cmu.edu', 'Shop training sign-ups', 'New shop training sessions are posted on the club calendar for next week.'],
  ['CMU Robotics Club', 'roboclub@andrew.cmu.edu', 'Photos from Mobot practice', 'Thanks to everyone who came out to Mobot practice. Photos are in the shared drive.'],
  ['Infinite Motion Dance', 'infinitemotion@andrew.cmu.edu', 'Rehearsal schedule for showcase', 'Showcase rehearsals are Saturdays 1–5 PM in CUC Studio A until the show.'],
  ['Infinite Motion Dance', 'infinitemotion@andrew.cmu.edu', 'Costume fittings', 'Costume fittings are happening during Saturday rehearsal. Bring black sneakers.'],
  ['Infinite Motion Dance', 'infinitemotion@andrew.cmu.edu', 'Showcase tickets are live', 'Tickets for the winter showcase are live. Share the link with friends and family.'],
  ['CMU Intramurals', 'intramurals@andrew.cmu.edu', 'IM soccer: week 6 schedule', 'Your team plays Thursday at 5 PM at Gesling Stadium. Check in with your captain.'],
  ['CMU Intramurals', 'intramurals@andrew.cmu.edu', 'IM soccer: standings update', 'Your team is currently 3–2 and in the playoff picture.'],
  ['CMU Intramurals', 'intramurals@andrew.cmu.edu', 'Winter IM registration opens soon', 'Winter intramural registration for basketball and volleyball opens in December.'],
];
const clubs: Spec[] = CLUBS.map(([from, email, subject, body], i) => ({ id: `n-club-${i}`, from, email, at: `${DAYS[(i * 3) % 10]} ${String(10 + (i % 8)).padStart(2, '0')}:05`, subject, body }));

const digests: Spec[] = [
  ['ScottyLabs', 42],
  ['15-122 Study Group', 67],
  ['CMU Class of 2029', 118],
  ['ScottyLabs', 23],
  ['Robotics Club', 15],
  ['CMU Class of 2029', 96],
].map(([server, n], i) => ({
  id: `n-discord-${i}`,
  from: 'Discord',
  email: 'notifications@discord.example.com',
  at: `${DAYS[1 + i]} 22:${String(10 + i).padStart(2, '0')}`,
  subject: `${n} new messages in ${server}`,
  body: `You have ${n} unread messages in ${server}, mostly in #general and #memes.`,
}));

const university: Spec[] = [
  ['n-uni-0', 'CMU News', 'news@cmu.edu', '11-02 09:00', 'This week at Carnegie Mellon', 'Research highlights, a new partnership with the Pittsburgh Public Schools, and a recap of Homecoming.'],
  ['n-uni-1', 'CMU News', 'news@cmu.edu', '11-09 09:00', 'This week at Carnegie Mellon', 'A look at the new robotics building, faculty awards, and upcoming lectures on campus.'],
  ['n-uni-2', 'Student Affairs', 'studentaffairs@andrew.cmu.edu', '11-04 12:00', 'Wellness week events', 'Wellness week includes therapy dogs in the UC, a yoga class, and free flu shots.'],
  ['n-uni-3', 'Student Affairs', 'studentaffairs@andrew.cmu.edu', '11-10 12:00', 'Thanksgiving break housing reminder', 'Residence halls stay open over Thanksgiving break; no action is needed if you are staying.'],
  ['n-uni-4', 'Housing Services', 'housing@andrew.cmu.edu', '11-05 10:00', 'Fire drill this week', 'A fire drill will take place in Morewood Gardens this week. Please follow staff instructions.'],
  ['n-uni-5', 'Housing Services', 'housing@andrew.cmu.edu', '11-08 10:00', 'Laundry machine upgrades', 'New laundry machines are being installed in Donner House; some machines will be offline.'],
  ['n-uni-6', 'Office of Financial Aid', 'finaid@andrew.cmu.edu', '11-03 11:00', 'FAFSA for 2027–28 is open', 'The FAFSA for the 2027–28 academic year is now open. This message is informational.'],
  ['n-uni-7', 'University Libraries', 'library@andrew.cmu.edu', '11-04 15:00', 'Extended hours for finals', 'Hunt Library will be open 24 hours starting in December for finals.'],
  ['n-uni-8', 'University Libraries', 'library@andrew.cmu.edu', '11-09 15:00', 'New study rooms in Sorrells', 'Bookable study rooms are now available in Sorrells Library.'],
  ['n-uni-9', 'Career & Professional Development', 'careers@andrew.cmu.edu', '11-03 13:00', 'Upcoming employer info sessions', 'Info sessions this week include software, consulting and nonprofit employers.'],
  ['n-uni-10', 'Career & Professional Development', 'careers@andrew.cmu.edu', '11-10 13:00', 'Resume review drop-ins', 'Resume review drop-in hours are Tuesday and Thursday afternoons.'],
  ['n-uni-11', 'University Registrar', 'registrar@andrew.cmu.edu', '11-06 09:30', 'Course evaluations open soon', 'Faculty course evaluations open in December. You will get a link by email.'],
  ['n-uni-12', 'Tartan Weekly', 'thetartan@andrew.cmu.edu', '11-05 07:00', 'The Tartan: this week’s top stories', 'Student government elections, a review of the fall play, and the football season recap.'],
  ['n-uni-13', 'Tartan Weekly', 'thetartan@andrew.cmu.edu', '11-11 07:00', 'The Tartan: this week’s top stories', 'Coverage of the Swartz Center hackathon and a guide to winter in Pittsburgh.'],
  ['n-uni-14', 'CMU Transportation', 'parking@andrew.cmu.edu', '11-07 08:00', 'Shuttle schedule changes', 'The Squirrel Hill shuttle runs on a reduced schedule on weekends in November.'],
  ['n-uni-15', 'Computing Services', 'it-help@cmu.edu', '11-06 16:00', 'Scheduled maintenance this weekend', 'Some campus services may be briefly unavailable during maintenance on Saturday night.'],
].map(([id, from, email, at, subject, body]) => ({ id, from, email, at, subject, body, role: 'external' as const }));

// Course chatter: announcements with no action required, and questions that don't change anything.
const canvas: Spec[] = [
  ['15-122', 'Prof. Dana Whitfield', 'instructor', '11-02 18:00', 'Lecture 17 slides posted', 'Slides and code from today’s lecture on hash tables are posted on the course site.'],
  ['15-122', 'Prof. Dana Whitfield', 'instructor', '11-05 18:00', 'Lecture 18 recording', 'The recording of lecture 18 is now available on Panopto.'],
  ['21-241', 'Prof. Marcus Lee', 'instructor', '11-03 17:30', 'Notes on eigenvalues', 'I posted supplementary notes on eigenvalues and diagonalization under Files.'],
  ['21-241', 'Prof. Marcus Lee', 'instructor', '11-06 17:30', 'Practice problems posted', 'A set of optional practice problems is posted under Files. Solutions will follow.'],
  ['15-151', 'Prof. Elena Sorokin', 'instructor', '11-04 09:00', 'Reading for next week', 'Please read chapter 9 on combinatorics before next week’s lectures.'],
  ['15-151', 'Noah Feld', 'ta', '11-08 20:00', 'Recitation notes', 'Notes from this week’s recitation on the pigeonhole principle are on Canvas.'],
  ['76-101', 'Prof. James Okafor', 'instructor', '11-03 08:30', 'Reading for Thursday', 'Please finish the Didion essay for Thursday’s discussion.'],
  ['76-101', 'Maya Lindqvist', 'ta', '11-06 15:00', 'Writing center hours', 'The Global Communication Center has extra appointments for 76-101 students this month.'],
].map(([course, from, role, at, subject, body], i) => ({ id: `n-canvas-${i}`, source: 'canvas' as const, course, from, role: role as Role, at, subject, body }));

const posts: Spec[] = [
  ['piazza', '15-122', 'Student', 'student', '11-02 21:15', 'Lab 9 autograder', 'Is anyone else getting a timeout on the lab autograder?'],
  ['piazza', '15-122', 'Priya Raman', 'ta', '11-02 22:00', 'Re: Lab 9 autograder', 'The autograder was restarted and should be working now.'],
  ['piazza', '15-122', 'Student', 'student', '11-04 13:40', 'Contracts question', 'Do loop invariants need to hold before the first iteration?'],
  ['piazza', '15-122', 'Student', 'student', '11-06 10:12', 'Style grading', 'How strict is style grading on the programming assignments?'],
  ['piazza', '15-122', 'Priya Raman', 'ta', '11-06 11:30', 'Re: Style grading', 'Style is graded on the rubric posted on the course site. Consistent indentation matters most.'],
  ['piazza', '15-122', 'Student', 'student', '11-08 19:44', 'Office hours queue', 'Is the office hours queue open on weekends?'],
  ['piazza', '15-122', 'Student', 'student', '11-09 23:05', 'Pointer arithmetic in C0', 'Why doesn’t C0 allow pointer arithmetic like C does?'],
  ['piazza', '15-151', 'Student', 'student', '11-03 20:20', 'Induction proof format', 'Do we need to label the base case explicitly in induction proofs?'],
  ['piazza', '15-151', 'Noah Feld', 'ta', '11-03 21:00', 'Re: Induction proof format', 'Yes, please label the base case and the inductive step clearly.'],
  ['piazza', '15-151', 'Student', 'student', '11-07 15:33', 'LaTeX template', 'Is there an official LaTeX template for problem sets?'],
  ['piazza', '15-151', 'Student', 'student', '11-09 18:02', 'Study group?', 'Anyone want to form a study group for combinatorics?'],
  ['ed', '21-241', 'Student', 'student', '11-04 22:10', 'Determinant shortcut', 'Is there a shortcut for 4x4 determinants or do we always expand?'],
  ['ed', '21-241', 'Sam Ortiz', 'ta', '11-05 09:15', 'Re: Determinant shortcut', 'Row reduce first; it is usually faster than cofactor expansion.'],
  ['ed', '21-241', 'Student', 'student', '11-07 14:45', 'Textbook edition', 'Is the 5th edition of the textbook okay to use?'],
  ['ed', '21-241', 'Student', 'student', '11-09 20:30', 'Recitation section swap', 'Can I attend a different recitation section this week?'],
  ['ed', '21-241', 'Sam Ortiz', 'ta', '11-09 21:10', 'Re: Recitation section swap', 'Yes, just let your recitation TA know.'],
].map(([source, course, from, role, at, subject, body], i) => ({ id: `n-post-${i}`, source: source as Platform, course, from: from === 'Student' ? 'Anonymous student' : from, role: role as Role, at, subject, body }));


const COMPANIES = ['Northwind Labs', 'Helix Robotics', 'Parcel Systems', 'Quanta Trading', 'Brightside AI', 'Meridian Health', 'Foundry Cloud', 'Stackline'];
const recruiting: Spec[] = COMPANIES.map((c, i) => ({
  id: `n-recruit-${i}`,
  from: `${c} Recruiting`,
  email: `campus@${c.toLowerCase().replace(/[^a-z]/g, '')}.example.com`,
  at: `${DAYS[(i * 2 + 1) % 10]} ${String(8 + (i % 6)).padStart(2, '0')}:20`,
  subject: ['Meet us at the career fair', 'Summer 2027 internships now open', 'Info session: building at scale', 'Coffee chat with our engineers', 'Your application status', 'Join our talent network', 'Campus tech talk this month', 'Hear from CMU alumni on our team'][i],
  body: `${c} is hiring interns and new grads. Learn more about our teams and open roles on our careers page.`,
}));
const autolab: Spec[] = ['Programming 4 autograded', 'Lab 8 autograded', 'Programming 3 regrade request received', 'Written Homework 3 submitted', 'Lab 7 autograded', 'Programming 2 autograded'].map((subject, i) => ({
  id: `n-autolab-${i}`,
  from: 'Autolab',
  email: 'autolab@andrew.cmu.edu',
  at: `${DAYS[i]} 23:${String(10 + i * 7).padStart(2, '0')}`,
  subject: `[15-122] ${subject}`,
  body: 'Your submission was received. See the Autolab gradebook for details.',
}));
const chats: Spec[] = [
  ['GroupMe', 'Dorm floor chat', 31], ['GroupMe', 'CS Sophomores', 54], ['Slack', 'ScottyLabs workspace', 19], ['Slack', 'Roboclub', 12], ['GroupMe', 'Intramural soccer', 8], ['Slack', 'NOVA volunteers', 27],
].map(([app, room, n], i) => ({ id: `n-chat-${i}`, from: String(app), email: `no-reply@${String(app).toLowerCase()}.example.com`, at: `${DAYS[2 + i]} 21:${String(15 + i * 4).padStart(2, '0')}`, subject: `${n} new messages in ${room}`, body: `You have ${n} unread messages in ${room}.` }));
const chatter: Spec[] = [
  ['piazza', '15-122', 'Anonymous student', 'student', '11-03 09:20', 'Recursion tips', 'Any tips for thinking about recursive data structures?'],
  ['piazza', '15-122', 'Anonymous student', 'student', '11-05 16:05', 'Valgrind output', 'What does this valgrind warning mean in my C0 translation?'],
  ['piazza', '15-122', 'Priya Raman', 'ta', '11-05 17:00', 'Re: Valgrind output', 'That warning is about reading uninitialized memory; check your allocation.'],
  ['piazza', '15-122', 'Anonymous student', 'student', '11-07 12:10', 'Recitation handouts', 'Where are the recitation handouts posted?'],
  ['piazza', '15-151', 'Anonymous student', 'student', '11-05 19:30', 'Binomial identities', 'Is there a combinatorial proof for this identity?'],
  ['piazza', '15-151', 'Noah Feld', 'ta', '11-05 20:10', 'Re: Binomial identities', 'Try counting the same set of committees in two ways.'],
  ['piazza', '15-151', 'Anonymous student', 'student', '11-10 11:05', 'Notation question', 'Is |A| always cardinality or sometimes absolute value?'],
  ['ed', '21-241', 'Anonymous student', 'student', '11-03 18:00', 'Rank vs nullity', 'Can someone explain rank-nullity in plain words?'],
  ['ed', '21-241', 'Sam Ortiz', 'ta', '11-03 19:20', 'Re: Rank vs nullity', 'Rank counts independent columns; nullity counts the free variables.'],
  ['ed', '21-241', 'Anonymous student', 'student', '11-08 13:15', 'Study group', 'Looking for a study group for the midterm.'],
  ['ed', '21-241', 'Anonymous student', 'student', '11-10 15:40', 'Notes from lecture', 'Does anyone have notes from Monday?'],
  ['canvas', '76-101', 'Prof. James Okafor', 'instructor', '11-09 09:00', 'Discussion board reminder', 'Please post your weekly response to the discussion board.'],
  ['canvas', '15-122', 'Priya Raman', 'ta', '11-09 14:00', 'Recitation recap', 'Slides from this week\u2019s recitation are posted.'],
  ['canvas', '15-151', 'Noah Feld', 'ta', '11-10 10:00', 'Problem set feedback', 'Feedback on problem set 6 is posted in Gradescope.'],
].map(([source, course, from, role, at, subject, body], i) => ({ id: `n-chatter-${i}`, source: source as Platform, course, from, role: role as Role, at, subject, body }));
const more: Spec[] = [...recruiting, ...autolab, ...chats, ...chatter];

/** Messages with a real action buried in them, plus the TA's late-day policy that Ask Semora can cite. */
export const EXTRAS: SourceMessage[] = [
  build({
    id: 'x-registrar',
    from: 'The HUB',
    email: 'thehub@andrew.cmu.edu',
    role: 'staff',
    at: '11-06 10:00',
    subject: 'Action needed: confirm your spring registration time',
    body: 'Spring 2027 registration times are posted in SIO. Confirm your spring registration time by Nov 18 so we can resolve any holds before registration week.',
  }),
  build({
    id: 'x-advisor',
    from: 'Dr. Karen Holt',
    email: 'kholt@cs.cmu.edu',
    role: 'staff',
    at: '11-10 10:20',
    subject: 'Before our check-in Friday',
    body: 'Hi Alex, could you send me your draft spring schedule before our check-in on Friday? Thanks!',
  }),
  build({
    id: 'x-latedays',
    source: 'piazza',
    course: '15-122',
    from: 'Priya Raman',
    role: 'ta',
    at: '11-04 12:30',
    subject: 'Late day policy reminder',
    body: 'Reminder: you have 6 late days for the semester and can use at most 2 on any one programming assignment. Late days are applied automatically on Autolab. Written homeworks cannot use late days.',
  }),
  build({
    id: 'x-ethan',
    from: 'Ethan Brooks',
    email: 'ebrooks@andrew.cmu.edu',
    role: 'student',
    course: '76-101',
    at: '11-09 17:55',
    threadId: 'thread-76101-pres',
    subject: '76-101 presentation',
    body: 'Hey both, I can take the intro and the counterargument section. Alex, can you put the slides together since you have the template?',
  }),
];

export const NOISE: SourceMessage[] = [...dining, ...packages, ...promos, ...clubs, ...digests, ...university, ...canvas, ...posts, ...more].map(build);
