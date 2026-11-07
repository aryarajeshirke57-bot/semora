import fs from 'node:fs';
import type { UserAction } from '../engine/types.ts';

// What Semora remembers about *you*: your actions, the demo script position and which sources are
// switched off. Message content is never persisted here; connector data lives in memory and is re-synced.

export interface Persist {
  live: number;
  actions: UserAction[];
  disabled: string[];
}

const FILE = '.data/semora.json';
const empty = (): Persist => ({ live: 0, actions: [], disabled: [] });
let data: Persist | undefined;

export function get(): Persist {
  if (!data) {
    try {
      data = { ...empty(), ...(JSON.parse(fs.readFileSync(FILE, 'utf8')) as Persist) };
    } catch {
      data = empty();
    }
  }
  return data;
}

export function save() {
  fs.mkdirSync('.data', { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(get(), null, 2));
}

export function reset() {
  data = empty();
  save();
}
