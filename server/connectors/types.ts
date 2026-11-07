import type { Platform, SourceMessage } from '../../engine/types.ts';

/** Every source implements this: authenticate, fetch since a cursor, normalize into SourceMessage, report status. */
export interface Connector {
  id: string;
  label: string;
  platform: Platform;
  envVars: string[];
  scopes: string[];
  /** True when the credentials this connector needs are present in the environment. */
  configured(): boolean;
  fetchSince(cursor?: string): Promise<{ messages: SourceMessage[]; cursor?: string }>;
}

export const env = (k: string) => process.env[k]?.trim() || '';

export async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return { data: (await res.json()) as T, headers: res.headers };
}

export function role(name: string, emailRole?: string): SourceMessage['authorRole'] {
  if (/instructor|professor|prof\./i.test(emailRole ?? name)) return 'instructor';
  if (/\bta\b|teaching assistant/i.test(emailRole ?? '')) return 'ta';
  if (/staff/i.test(emailRole ?? '')) return 'staff';
  return 'student';
}
