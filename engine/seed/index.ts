import type { SourceMessage } from '../types.ts';
import { ASSIGNMENTS, CALENDAR, GRADES, LIVE_SCRIPT, STORY } from './story.ts';
import { EXTRAS, NOISE } from './noise.ts';
import { FINANCE } from './finance.ts';
import { withMailbox } from './mailbox.ts';

export const DEMO_NOW = '2026-11-11T09:00:00-05:00';

/** Everything the demo source serves at startup (no live-script messages). */
export function seedMessages(): SourceMessage[] {
  return [...STORY, ...CALENDAR, ...ASSIGNMENTS, ...GRADES, ...EXTRAS, ...NOISE];
}

/** Alex's billing email (Money). Kept separate so the academic story beats stay byte-for-byte as tested. */
export function financeSeedMessages(): SourceMessage[] {
  return [...FINANCE];
}

/** The whole seeded inbox the demo serves: the academic story, billing email, and mailbox metadata (sizes, spam folder). */
export function demoMessages(): SourceMessage[] {
  return withMailbox([...seedMessages(), ...financeSeedMessages()]);
}

/** The n-th scripted live message, stamped at `now`. */
export function liveMessage(n: number, now: string): SourceMessage | undefined {
  const step = LIVE_SCRIPT[n];
  return step ? { ...step.message, sentAt: now } : undefined;
}

export { LIVE_SCRIPT, STORY };
