import type { ItemKind } from './types.ts';

/** Canonical subjects: different wordings of the same thing collapse to one key. */
interface SubjectRule {
  re: RegExp;
  key: (m: RegExpMatchArray) => string;
  kind: ItemKind;
  title: (m: RegExpMatchArray) => string;
}

const RULES: SubjectRule[] = [
  { re: /\bwritten\s+(?:homework|hw)\s*#?\s*(\d+)\b/i, key: (m) => `written-hw${m[1]}`, kind: 'assignment', title: (m) => `Written Homework ${m[1]}` },
  { re: /\b(?:homework|hw)\s*#?\s*(\d+)\b/i, key: (m) => `hw${m[1]}`, kind: 'assignment', title: (m) => `HW${m[1]}` },
  { re: /\bmidterm\s*#?\s*(\d+)\b/i, key: (m) => `midterm${m[1]}`, kind: 'exam', title: (m) => `Midterm ${m[1]}` },
  { re: /\bfinal exam\b/i, key: () => 'final', kind: 'exam', title: () => 'Final exam' },
  { re: /\bessay\s*#?\s*(\d+)\s+drafts?\b/i, key: (m) => `essay${m[1]}-draft`, kind: 'assignment', title: (m) => `Essay ${m[1]} draft` },
  { re: /\bessay\s*#?\s*(\d+)\b/i, key: (m) => `essay${m[1]}`, kind: 'assignment', title: (m) => `Essay ${m[1]}` },
  { re: /\b(?:problem\s+set|pset|ps)\s*#?\s*(\d+)\b/i, key: (m) => `ps${m[1]}`, kind: 'assignment', title: (m) => `Problem Set ${m[1]}` },
  { re: /\bquiz\s*#?\s*(\d+)\b/i, key: (m) => `quiz${m[1]}`, kind: 'assignment', title: (m) => `Quiz ${m[1]}` },
  { re: /\bprogram(?:ming)?(?:\s+(?:homework|assignment))?\s*#?\s*(\d+)\b/i, key: (m) => `prog${m[1]}`, kind: 'assignment', title: (m) => `Programming ${m[1]}` },
  { re: /\blab\s*#?\s*(\d+)\b/i, key: (m) => `lab${m[1]}`, kind: 'assignment', title: (m) => `Lab ${m[1]}` },
  { re: /\b(?:group\s+)?presentation\b/i, key: () => 'presentation', kind: 'presentation', title: () => 'Group presentation' },
  { re: /\b(?:extra|additional|make-?up)\s+(?:office\s+)?hours\b/i, key: () => 'oh', kind: 'office_hours', title: () => 'Extra office hours' },
  { re: /\boffice hours?\b/i, key: () => 'oh', kind: 'office_hours', title: () => 'Office hours' },
];

export interface SubjectMatch {
  subject: string;
  kind: ItemKind;
  title: string;
  index: number;
}

/** All subjects mentioned in a text, in order of appearance. */
export function findSubjects(text: string): SubjectMatch[] {
  const found: SubjectMatch[] = [];
  const taken: [number, number][] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, 'gi');
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      found.push({ subject: rule.key(m), kind: rule.kind, title: rule.title(m), index: start });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function canonicalSubject(text: string): SubjectMatch | undefined {
  return findSubjects(text)[0];
}

const COURSE_RE = /\b(\d{2})-?(\d{3})\b/;

export function findCourse(text: string | undefined, known: string[]): string | undefined {
  if (!text) return undefined;
  for (const m of text.matchAll(new RegExp(COURSE_RE.source, 'g'))) {
    const code = `${m[1]}-${m[2]}`;
    if (known.includes(code)) return code;
  }
  return undefined;
}

/** Word-set similarity for fuzzy title matching (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
