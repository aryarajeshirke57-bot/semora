// Walks the demo path with Playwright, takes screenshots in light/dark/phone, and reports console errors.
// Usage: npx tsx scripts/screenshots.ts <round-name>
import fs from 'node:fs';
import { chromium, type ConsoleMessage, type Page } from 'playwright';

const round = process.argv[2] ?? 'base';
const BASE = process.env.SEMORA_URL ?? 'http://localhost:5173';
const out = `screenshots/${round}`;
fs.mkdirSync(out, { recursive: true });

const SCREENS: [string, string][] = [
  ['dashboard', '/'], ['this-week', '/week'], ['digest', '/digest'], ['storage', '/storage'], ['subscriptions', '/subscriptions'], ['courses', '/courses'], ['connections', '/connections'], ['changed', '/changed'], ['waiting', '/waiting'], ['grades', '/grades'], ['inbox', '/inbox'],
  ['course-15-122', '/courses/15-122'], ['ask', '/ask'], ['settings', '/settings'], ['detail-hw5', '/?item=item:15-122:hw5'], ['detail-essay', '/changed?item=item:76-101:essay2-draft'],
];
const errors: string[] = [];

async function settle(page: Page, ms = 1400) { await page.waitForTimeout(ms); }
async function api(path: string) { await fetch(`${BASE}${path}`, { method: 'POST' }); }

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const scheme of ['light', 'dark'] as const) {
    for (const [vp, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      await api('/api/demo/reset');
      const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: vp === 'phone' ? 2 : 1 });
      // These screens are the app itself; the intro and brief have their own script (intro-shots.ts).
      await ctx.addInitScript(() => { sessionStorage.setItem('semora-intro-done', '1'); localStorage.setItem('semora-brief-day', '2026-11-11'); });
      const page = await ctx.newPage();
      const tag = `${scheme}-${vp}`;
      page.on('console', (m: ConsoleMessage) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
      page.on('requestfailed', (r) => { if (!r.url().includes('/api/events')) errors.push(`[${tag}] requestfailed: ${r.url()}`); });
      for (const [name, path] of SCREENS) {
        await page.goto(BASE + path);
        if (name === 'ask') { await page.getByRole('button', { name: 'What should I prioritize today?' }).click(); }
        await settle(page);
        await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: name !== 'detail-hw5' && name !== 'detail-essay' });
      }
      // Command palette
      await page.goto(BASE + '/');
      await settle(page, 700);
      await page.keyboard.press('Meta+k');
      await page.keyboard.type('midterm');
      await settle(page, 500);
      await page.screenshot({ path: `${out}/${tag}-palette.png` });
      await page.keyboard.press('Escape');
      // Cascade: approve the move, watch the block travel
      await page.goto(BASE + '/week');
      await settle(page);
      await page.getByRole('button', { name: /Because HW5 moved/ }).click();
      await settle(page, 500);
      await page.getByRole('button', { name: 'Approve & move' }).click();
      await settle(page, 900);
      await page.screenshot({ path: `${out}/${tag}-cascade-approved.png` });
      // Live script
      await api('/api/demo/reset');
      await page.goto(BASE + '/changed');
      await settle(page, 800);
      await api('/api/demo/simulate');
      await settle(page, 900);
      await page.screenshot({ path: `${out}/${tag}-live1-changed.png` });
      await api('/api/demo/simulate');
      await page.goto(BASE + '/waiting');
      await settle(page);
      await page.screenshot({ path: `${out}/${tag}-live2-waiting.png` });
      await api('/api/demo/simulate');
      await page.goto(BASE + '/week');
      await settle(page);
      await page.screenshot({ path: `${out}/${tag}-live3-week.png`, fullPage: true });
      // Horizontal overflow check on phone
      if (vp === 'phone') {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) errors.push(`[${tag}] horizontal overflow: ${over}px on /`);
      }
      await ctx.close();
    }
  }
  await api('/api/demo/reset');
  await browser.close();
  fs.writeFileSync(`${out}/console-report.txt`, errors.length ? errors.join('\n') : 'No console errors, page errors, failed requests or overflow.');
  console.log(errors.length ? `${errors.length} problem(s):\n${errors.join('\n')}` : 'No console errors, page errors, failed requests or overflow.');
}
main().catch((e) => { console.error(e); process.exit(1); });
