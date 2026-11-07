// Semora's shared model. The server, the engine and the UI all import from here,
// so evidence can never drift between what the engine decided and what the UI shows.

export type Platform = 'canvas' | 'gmail' | 'gcal' | 'gradescope' | 'piazza' | 'ed';

export type Channel =
  | 'announcement' // Canvas announcement
  | 'email' // received email
  | 'sent' // email the student sent
  | 'post' // Piazza / Ed post
  | 'calendar' // calendar event (Canvas calendar or Google Calendar)
  | 'syllabus' // Canvas syllabus / course document
  | 'assignment' // Canvas / Gradescope assignment record
  | 'grade'; // posted score

export type Role = 'instructor' | 'ta' | 'staff' | 'system' | 'student' | 'self' | 'external';

export type ItemKind =
  | 'assignment'
  | 'exam'
  | 'event'
  | 'office_hours'
  | 'presentation'
  | 'promise'
  | 'reply'
  | 'task'
  | 'opportunity';

/** A local (America/New_York) wall-clock moment. Either part can be unknown. */
export interface LocalMoment {
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm (24h)
}

export interface CalendarPayload {
  type: 'calendar';
  eventId: string;
  title: string;
  start: string; // ISO with offset
  end: string;
  location?: string;
  attendees?: string[];
  course?: string;
}

export interface AssignmentPayload {
  type: 'assignment';
  title: string;
  due: string; // ISO
  location?: string;
  points?: number;
}

export interface GradePayload {
  type: 'grade';
  assignment: string;
  category: string;
  score: number;
  max: number;
}

export type StructuredPayload = CalendarPayload | AssignmentPayload | GradePayload;

/** One normalized message from any source. This is the only input the engine reads. */
export interface SourceMessage {
  id: string;
  source: Platform;
  channel: Channel;
  url: string;
  course?: string;
  section?: string; // author's section, when known (students)
  authorName: string;
  authorEmail?: string;
  authorRole: Role;
  to?: string[];
  sentAt: string; // ISO with offset
  subject?: string;
  body: string;
  pinned?: boolean;
  threadId?: string;
  replyTo?: string; // message id this replies to
  attachments?: string[];
  structured?: StructuredPayload;
  /** Set by the demo source for messages injected live by "Simulate incoming message". */
  live?: boolean;
  /** Approximate size in bytes (Gmail's sizeEstimate), when the source reports it. */
  sizeBytes?: number;
  /** Has a file attached. */
  hasAttachment?: boolean;
  /** In the provider's spam folder. Never reconciled; shown only under Spam. */
  spam?: boolean;
}

export type Intent = 'statement' | 'question' | 'proposal' | 'promise' | 'fulfillment';

export interface SectionScope {
  only?: string[];
  except?: string[];
}

export type FieldName = 'due' | 'start' | 'end' | 'location' | 'status';

export interface ClaimFields {
  due?: LocalMoment;
  start?: LocalMoment;
  end?: LocalMoment;
  location?: string;
  status?: 'active' | 'canceled';
}

/** A single fact a message asserts (or asks about) regarding one thing the student cares about. */
export interface Claim {
  id: string;
  messageId: string;
  /** Canonical subject within the course, e.g. "hw5", "midterm2", "oh:2026-11-11". */
  subject: string;
  course?: string;
  kind: ItemKind;
  title: string;
  intent: Intent;
  fields: ClaimFields;
  scope?: SectionScope;
  correction: boolean;
  /** The sentence the claim came from, shown as evidence. */
  quote: string;
  extractor: 'rules' | 'llm' | 'structured';
  confidence: number;
  /** For promises / replies: who it involves. */
  people?: string[];
  /** For fulfillments: what was delivered (e.g. "slides"). */
  object?: string;
  related?: string; // subject this claim relates to (calendar event → hw5)
}

export type EvidenceRole =
  | 'origin' // first statement that created the item
  | 'supports' // agrees with the current value
  | 'winner' // the statement whose value is current
  | 'superseded' // was right once, replaced by a correction
  | 'outdated' // repeats a value that was already superseded
  | 'stale' // a source whose record no longer matches (e.g. old calendar entry)
  | 'question' // asked, didn't change anything
  | 'other_section' // applies to sections other than the student's
  | 'conflict' // disagrees with another equally authoritative source
  | 'completion'; // evidence the item is done

export interface Evidence {
  messageId: string;
  role: EvidenceRole;
  note: string;
  quote: string;
}

export interface ResolvedValue {
  value: LocalMoment | string;
  messageId: string;
  reason: string;
}

export type ItemStatus = 'active' | 'canceled' | 'done' | 'needs_confirmation' | 'dismissed';

export interface ConflictOption {
  value: LocalMoment | string;
  messageId: string;
  authorName: string;
  authorRole: Role;
  source: Platform;
}

export interface Conflict {
  field: FieldName;
  options: ConflictOption[];
  draftId?: string;
}

export interface Item {
  id: string;
  course?: string;
  subject: string;
  kind: ItemKind;
  title: string;
  due?: LocalMoment;
  start?: LocalMoment;
  end?: LocalMoment;
  location?: string;
  status: ItemStatus;
  /** When the item is relevant on the timeline: due, else start. ISO. */
  at?: string;
  resolved: Partial<Record<FieldName, ResolvedValue>>;
  evidence: Evidence[];
  sources: Platform[];
  changeIds: string[];
  conflict?: Conflict;
  people?: string[];
  scopeNote?: string;
  reason: string;
  /** Calendar event id, for events backed by a calendar. */
  eventId?: string;
  related?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedBy?: 'user' | 'evidence';
  confirmed?: boolean;
  movedByUser?: boolean;
  /** One line on what the item asks of the student (opportunities, tasks). */
  detail?: string;
}

export type ChangeType = 'due' | 'time' | 'location' | 'canceled' | 'added' | 'resolved' | 'completed';

export interface Change {
  id: string;
  itemId: string;
  type: ChangeType;
  field?: FieldName;
  from?: LocalMoment | string;
  to?: LocalMoment | string;
  at: string;
  byName: string;
  byRole: Role;
  source: Platform;
  course?: string;
  scopeNote?: string;
  messageIds: string[];
  reason: string;
  live?: boolean;
}

export type ProposalKind = 'move_event' | 'draft_message' | 'ask_staff';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  itemId: string; // the item whose change caused it
  targetId?: string; // e.g. the calendar item to move
  title: string;
  detail: string;
  reason: string;
  from?: { start: string; end: string };
  to?: { start: string; end: string };
  recipients?: string[];
  body?: string;
  status: 'proposed' | 'approved' | 'dismissed';
  requires: 'calendar.write' | 'gmail.compose';
  messageIds: string[];
}

export type ActionType =
  | 'done'
  | 'undo_done'
  | 'dismiss'
  | 'confirm'
  | 'approve'
  | 'reject'
  | 'choose'
  // Money: always the user's own statement, never something Semora did outside the app.
  | 'fin_canceled' // "I canceled it" (user-asserted)
  | 'fin_cancel_requested' // "I asked to cancel" (not yet confirmed)
  | 'fin_confirm' // "this is right" (value: chosen option's messageId for conflicts)
  | 'fin_dismiss' // "this isn't a subscription"
  | 'fin_undo' // clear my corrections on this subscription
  | 'fin_follow' // mark a subscription for follow-up (toggles)
  | 'fin_ack' // acknowledge its current alert: it stops counting as needing attention
  | 'chk_done' // inbox-health checklist item done (targetId: chk:…)
  | 'chk_undo';

export interface UserAction {
  id: string;
  type: ActionType;
  targetId: string;
  value?: string; // for 'choose': the messageId of the chosen option
  at: string;
}

export type InboxCategory = 'courses' | 'opportunities' | 'admin' | 'clubs' | 'money' | 'noise' | 'spam';

export interface MessageView {
  id: string;
  source: Platform;
  channel: Channel;
  url: string;
  course?: string;
  authorName: string;
  authorEmail?: string;
  authorRole: Role;
  to?: string[];
  sentAt: string;
  subject?: string;
  excerpt: string;
  body?: string;
  pinned?: boolean;
  attachments?: string[];
  categories: InboxCategory[];
  summary: string;
  itemIds: string[];
  /** Subscriptions this message is evidence for (Money). */
  subscriptionIds?: string[];
  sizeBytes?: number;
  hasAttachment?: boolean;
  spam?: boolean;
  /** Flagged as a look-alike of a real sender. */
  suspicious?: boolean;
  /** How the linked item treats this message (winner, superseded, outdated, question…). */
  evidenceRole?: EvidenceRole;
  live?: boolean;
}

export interface Course {
  code: string;
  title: string;
  instructor: string;
  staff: { name: string; role: Role; email?: string }[];
  section?: string;
  color: string; // hue for the course dot
  weights: { category: string; weight: number; drop?: number }[];
  links: { label: string; url: string }[];
  officeHours: string[];
}

export interface GradeEntry {
  id: string;
  course: string;
  assignment: string;
  category: string;
  score: number;
  max: number;
  postedAt: string;
  messageId: string;
  source: Platform;
  isNew: boolean;
}

export interface CourseGrades {
  course: string;
  current: number | null; // percent, weighted over categories with grades
  categories: { category: string; weight: number; average: number | null; count: number }[];
  finalWeight: number;
  completedWeight: number;
}

export interface Student {
  name: string;
  email: string;
  year: string;
  school: string;
  section: string;
  timezone: string;
}

export interface ConnectionStatus {
  id: string;
  label: string;
  platform: Platform | 'openrouter' | 'demo';
  configured: boolean;
  enabled: boolean;
  mode: 'demo' | 'live' | 'off';
  status: 'ok' | 'syncing' | 'error' | 'off';
  lastSync?: string;
  itemCount: number;
  error?: string;
  scopes: string[];
  envVars: string[];
}

export interface ScriptStatus {
  index: number;
  total: number;
  next?: { label: string; description: string };
}

export type BriefSection = 'changed' | 'soon' | 'decide' | 'money' | 'heads_up';
export interface BriefPart { itemId: string; text: string }
export interface BriefLine {
  id: string;
  section: BriefSection;
  text: string;
  note?: string;
  itemId?: string;
  proposalId?: string;
  /** For a line that lists several items (Next 48 hours). */
  parts?: BriefPart[];
  messageIds: string[];
  sources: Platform[];
  live?: boolean;
}
export interface Brief {
  greeting: string;
  headline: string;
  lines: BriefLine[];
  /** Things left out to stay a 60-second read; they live on This week. */
  overflow: number;
  words: number;
  readSeconds: number;
  since: string;
}

export interface SemoraState {
  version: number;
  now: string;
  demoMode: boolean;
  llm: { enabled: boolean; fast: string; smart: string };
  student: Student;
  courses: Course[];
  items: Item[];
  changes: Change[];
  proposals: Proposal[];
  messages: MessageView[];
  grades: GradeEntry[];
  courseGrades: CourseGrades[];
  connections: ConnectionStatus[];
  stats: { messagesIn: number; needToKnow: number; deduped: number };
  script: ScriptStatus;
  brief: Brief;
  finance: FinanceState;
  health: HealthState;
}

/* ================= Inbox health ================= */
export interface HealthCategory { id: InboxCategory; label: string; count: number }
export interface HealthSender { name: string; email?: string; count: number; category: InboxCategory; gmailQuery: string }
export interface HealthAttachment { messageId: string; subject: string; from: string; sizeBytes: number; at: string; gmailQuery: string }
export interface HealthChecklistItem {
  id: string; // chk:…
  title: string;
  detail: string;
  /** Where acting on it happens: a Semora page, or a Gmail search the user runs themselves. */
  route?: string;
  subscriptionId?: string;
  gmailQuery?: string;
  done: boolean;
}
export interface HealthState {
  window: { from: string; to: string };
  total: number;
  categories: HealthCategory[];
  actionable: number;
  promotional: number;
  promoSenders: HealthSender[];
  attachments: HealthAttachment[];
  attachmentBytes: number;
  spam: { count: number; senders: HealthSender[]; suspiciousInInbox: number };
  /** Gmail read-only access can't see storage quota: always null unless an authorized API provides it. */
  storage: null | { usedBytes: number; totalBytes: number; source: string };
  checklist: HealthChecklistItem[];
}

export interface Citation {
  messageId?: string;
  itemId?: string;
  subscriptionId?: string;
  label: string;
}

/* ================= Money: recurring commitments found in the inbox ================= */

export type BillingInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type FinanceEventType =
  | 'signup'
  | 'trial'
  | 'renewal_notice'
  | 'charge'
  | 'payment_failed'
  | 'price_change'
  | 'cancel_requested'
  | 'cancel_confirmed'
  | 'refund'
  | 'invoice'
  | 'one_time';

/** One financial fact a message asserts. Extracted by rules or an LLM, then validated by rules. */
export interface FinanceClaim {
  id: string;
  messageId: string;
  type: FinanceEventType;
  /** Always derived from the sender (or the payee of a payment processor), never from free text alone. */
  merchant: string;
  plan?: string;
  amount?: number;
  currency?: string; // ISO code; undefined when the message gives no currency
  interval?: BillingInterval;
  oldAmount?: number; // price change: the price before
  renewsOn?: string; // YYYY-MM-DD, only when the message states it
  trialEnds?: string;
  effective?: string; // price change takes effect
  accessUntil?: string; // cancellation: access ends
  recurring: boolean; // the message itself says this repeats (subscription, membership, renews, /month…)
  links: string[];
  senderDomain?: string;
  viaProcessor?: string; // e.g. "PayPal"
  quote: string;
  extractor: 'rules' | 'llm';
  confidence: number;
}

export type SubscriptionStatus = 'active' | 'trial' | 'renewal_soon' | 'payment_failed' | 'price_changed' | 'cancel_pending' | 'canceled' | 'needs_confirmation';

/** confirmed: the merchant itself says you have it · inferred: repeated charges only · unverified: not enough to count · user: you told Semora. */
export type Certainty = 'confirmed' | 'inferred' | 'unverified' | 'user';

export interface FinanceEvent {
  id: string;
  subscriptionId?: string;
  type: FinanceEventType;
  at: string; // when the message was sent
  date?: string; // the date the message is about (renewal, trial end…)
  amount?: number;
  currency?: string;
  interval?: BillingInterval;
  messageId: string;
  note: string;
  quote: string;
  /** Same charge reported twice (e.g. merchant receipt + PayPal receipt). */
  duplicateOf?: string;
  /** Rejected as evidence (e.g. wrong sender). */
  ignored?: string;
}

export interface Subscription {
  id: string;
  merchant: string;
  plan?: string;
  name: string;
  amount?: number;
  currency?: string;
  interval?: BillingInterval;
  monthly?: number;
  annual?: number;
  renewsOn?: string;
  trialEnds?: string;
  trialThen?: { amount?: number; currency?: string; interval?: BillingInterval };
  accessUntil?: string;
  priceChange?: { from?: number; to: number; effective?: string; messageId: string; confirmedBy?: string; adoptedByDate?: boolean };
  conflict?: { field: 'price'; options: { label: string; amount?: number; interval?: BillingInterval; messageId: string }[] };
  status: SubscriptionStatus;
  certainty: Certainty;
  counted: boolean;
  excludedReason?: string;
  reason: string;
  events: FinanceEvent[];
  messageIds: string[];
  sources: Platform[];
  manageUrl?: string;
  /** Links in the emails that point somewhere other than the merchant's own domain: never offered as a button. */
  unverifiedLinks: string[];
  lastEmailAt: string;
  userAction?: 'canceled' | 'cancel_requested' | 'confirmed' | 'dismissed';
  /** You marked it to follow up on. */
  followUp?: boolean;
  /** You acknowledged its current alert. */
  acknowledged?: boolean;
}

export interface Purchase {
  id: string;
  merchant: string;
  amount?: number;
  currency?: string;
  at: string;
  messageId: string;
  note: string;
  type: 'one_time' | 'refund' | 'charge' | 'invoice';
}

export type FinanceAlertKind = 'payment_failed' | 'trial_ending' | 'price_increase' | 'renewal_soon' | 'cancel_pending' | 'needs_confirmation' | 'cancel_confirmed' | 'suspicious';

export interface FinanceAlert {
  id: string;
  subscriptionId?: string;
  kind: FinanceAlertKind;
  /** Full sentence for lists. */
  text: string;
  /** A few words for the Morning Brief. */
  short: string;
  at: string;
  urgency: number; // 0–100; ≥ 60 needs attention
  messageIds: string[];
  /** You acknowledged it: still listed, no longer counted as needing attention. */
  acknowledged?: boolean;
}

export interface FinanceChange {
  id: string;
  subscriptionId: string;
  type: 'price' | 'canceled' | 'payment_failed' | 'trial_started' | 'cancel_requested' | 'conflict';
  from?: string;
  to?: string;
  at: string;
  messageIds: string[];
  text: string;
}

export interface Suspicious {
  messageId: string;
  looksLike: string;
  senderDomain?: string;
  reason: string;
}

export interface FinanceSummary {
  currency: 'USD';
  monthly: number;
  annual: number;
  counted: number;
  renewingSoon: number;
  trialsEnding: number;
  failed: number;
  priceIncreases: number;
  attention: number;
  breakdown: { subscriptionId: string; name: string; amount: number; interval: BillingInterval; monthly: number }[];
  excluded: { subscriptionId: string; name: string; reason: string }[];
}

export interface FinanceState {
  subscriptions: Subscription[];
  purchases: Purchase[];
  alerts: FinanceAlert[];
  changes: FinanceChange[];
  suspicious: Suspicious[];
  summary: FinanceSummary;
}

export interface AskAnswer {
  question: string;
  answer: string;
  /** fact: stated by a source · estimate: arithmetic over sources · inference: Semora's ranking or judgment. */
  bullets: { text: string; citations: Citation[]; basis?: 'fact' | 'estimate' | 'inference' }[];
  /** A drafted message: never sent by Semora. */
  draft?: { to: string[]; subject?: string; body: string };
  citations: Citation[];
  mode: 'rules' | 'llm';
}
