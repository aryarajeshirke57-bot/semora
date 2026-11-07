// Theme preferences: scheme (system / light / dark) and season (classic + four seasons).
// Pure helpers so they can be tested; web/index.html runs the same logic inline before first paint.

export type Scheme = 'system' | 'light' | 'dark';
export type Season = 'classic' | 'autumn' | 'winter' | 'spring' | 'summer';

export const THEME_KEY = 'semora-theme';
export const SEASON_KEY = 'semora-season';
export const SIDEBAR_KEY = 'semora-sidebar';
export const SCHEMES: Scheme[] = ['system', 'light', 'dark'];
export const SEASONS: Season[] = ['classic', 'autumn', 'winter', 'spring', 'summer'];

export const parseScheme = (v: string | null | undefined): Scheme => (SCHEMES.includes(v as Scheme) ? (v as Scheme) : 'system');
export const parseSeason = (v: string | null | undefined): Season => (SEASONS.includes(v as Season) ? (v as Season) : 'classic');
export const resolveScheme = (scheme: Scheme, prefersDark: boolean): 'light' | 'dark' => (scheme === 'system' ? (prefersDark ? 'dark' : 'light') : scheme);

/** The attributes the stylesheet reads: data-theme only when forced, data-scheme always, data-season unless classic. */
export function themeAttributes(scheme: Scheme, season: Season, prefersDark: boolean): Record<'data-theme' | 'data-scheme' | 'data-season', string | null> {
  return {
    'data-theme': scheme === 'system' ? null : scheme,
    'data-scheme': resolveScheme(scheme, prefersDark),
    'data-season': season === 'classic' ? null : season,
  };
}

export function applyTheme(root: HTMLElement, scheme: Scheme, season: Season, prefersDark: boolean) {
  for (const [k, v] of Object.entries(themeAttributes(scheme, season, prefersDark))) {
    if (v === null) root.removeAttribute(k);
    else root.setAttribute(k, v);
  }
}
