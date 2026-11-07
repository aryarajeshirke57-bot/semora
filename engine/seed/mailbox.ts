import type { SourceMessage } from '../types.ts';
import { ALEX } from './story.ts';

// Mailbox metadata for Storage & Spam in the demo: a spam folder and attachment sizes.
// Seeded and labeled as such in the UI; nothing here touches a real mailbox.

/** Approximate sizes (bytes) for seeded messages that carry big attachments. */
export const SIZES: Record<string, { sizeBytes: number; hasAttachment: boolean }> = {
  'n-club-5': { sizeBytes: 24_800_000, hasAttachment: true }, // Mobot practice photos
  'n-club-8': { sizeBytes: 6_200_000, hasAttachment: true }, // showcase poster + program
  'n-recruit-2': { sizeBytes: 7_300_000, hasAttachment: true }, // info-session deck
  'x-ethan': { sizeBytes: 11_400_000, hasAttachment: true }, // slide template
  'n-uni-12': { sizeBytes: 3_100_000, hasAttachment: false }, // image-heavy newsletter
};

const SPAM: [string, string, string, string, string][] = [
  ['s-mailbox', 'Mail Admin', 'admin@andrew-cmu-mail.example.net', 'Your mailbox is almost full — verify your account', 'Your university mailbox will be closed in 24 hours. Click here to verify your password and keep your account.'],
  ['s-scholarship', 'Global Scholars Fund', 'awards@globalscholars.example.org', 'Congratulations! You were selected for a $2,500 scholarship', 'You have been selected for a $2,500 scholarship. To claim it, send a $49 processing fee within 48 hours.'],
  ['s-airdrop', 'TokenDrop', 'hello@tokendrop.example.io', 'Exclusive airdrop for CMU students', 'Claim 500 free tokens today. Connect your wallet to receive your airdrop.'],
  ['s-invoice', 'Accounts Dept', 'billing@invoice-center.example.net', 'URGENT: invoice #88213 overdue', 'Your invoice of $389.00 is overdue. Thanks for your payment in advance. Pay now to avoid suspension of your subscription.'],
  ['s-job', 'Remote Careers', 'jobs@quickhire.example.biz', 'Earn $500/day from your dorm', 'No experience needed. Reply with your bank details to start earning this week.'],
];

export const SPAM_MESSAGES: SourceMessage[] = SPAM.map(([id, from, email, subject, body], i) => ({
  id,
  source: 'gmail',
  channel: 'email',
  url: `https://mail.google.com/mail/u/0/#spam/19b0e${String(2000 + i * 41).padStart(6, '0')}`,
  authorName: from,
  authorEmail: email,
  authorRole: 'external',
  to: [ALEX],
  sentAt: `2026-11-${String(4 + i).padStart(2, '0')}T0${3 + i}:20:00-05:00`,
  subject,
  body,
  spam: true,
  sizeBytes: 9_000 + i * 1_200,
}));

/** Attach sizes to seeded messages and add the spam folder. */
export function withMailbox(messages: SourceMessage[]): SourceMessage[] {
  return [...messages.map((m) => (SIZES[m.id] ? { ...m, ...SIZES[m.id] } : m)), ...SPAM_MESSAGES];
}
