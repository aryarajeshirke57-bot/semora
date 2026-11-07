// Screenshots of the opening sequence (each phase, stepped with Space) and the Morning Brief.
// Usage: npx tsx scripts/intro-shots.ts <round-name>
import fs from 'node:fs';
import { chromium } from 'playwright';

const round = process.argv[2] ?? 'intro';
const BASE = process.env.SEMORA_URL ?? 'http://localhost:5173';
const out = `screenshots/${round}`;
fs.mkdirSync(out, { recursive: true });
const errors: string[] = [];

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
  for (const scheme of ['light', 'dark'] as const) {
    for (const [vp, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
      const tag = `${scheme}-${vp}`;
      const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: vp === 'phone' ? 2 : 1 });
      const page = await ctx.newPage();
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
      await page.goto(`${BASE}/?intro=1`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/${tag}-intro-0-mess.png` });
      const names = ['noise', 'stacks', 'who-wins', 'clarity'];
      for (const n of names) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(n === 'who-wins' ? 1600 : 1300);
        await page.screenshot({ path: `${out}/${tag}-intro-${names.indexOf(n) + 1}-${n}.png` });
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${out}/${tag}-brief.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/${tag}-week-after-brief.png`, fullPage: true });
      await page.goto(`${BASE}/inbox?intro=0`);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/${tag}-inbox-needs.png`, fullPage: true });
      if (vp === 'phone') {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) errors.push(`[${tag}] horizontal overflow: ${over}px`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${out}/console-report.txt`, errors.length ? errors.join('\n') : 'No console errors, page errors or overflow.');
  console.log(errors.length ? errors.join('\n') : 'No console errors, page errors or overflow.');
}
main().catch((e) => { console.error(e); process.exit(1); });
