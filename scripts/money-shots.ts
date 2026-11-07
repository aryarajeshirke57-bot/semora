// Screenshots of the Money feature: the view, a subscription sheet, Changed, the brief and Ask, in light/dark/phone.
// Usage: npx tsx scripts/money-shots.ts <round-name>   (dev stack running; CHROME_PATH optional)
import fs from 'node:fs';
import { chromium } from 'playwright';

const round = process.argv[2] ?? 'money';
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
      await ctx.addInitScript(() => { sessionStorage.setItem('semora-intro-done', '1'); localStorage.setItem('semora-brief-day', '2026-11-11'); });
      const page = await ctx.newPage();
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${tag}] console.${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
      const shot = async (name: string, path: string, full = true, wait = 1300) => {
        await page.goto(BASE + path);
        await page.waitForTimeout(wait);
        await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: full });
      };
      await shot('money', '/money');
      await page.getByRole('button', { name: 'How is this calculated?' }).click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${tag}-money-math.png`, fullPage: true });
      await shot('sub-google-one', '/money?sub=sub:google-one-100-gb', false);
      await shot('sub-duolingo', '/money?sub=sub:duolingo-super', false);
      await shot('sub-netflix', '/money?sub=sub:netflix-standard', false);
      await shot('changed', '/changed');
      await shot('waiting', '/waiting');
      await page.goto(`${BASE}/ask`);
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'How much am I spending on subscriptions?' }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${out}/${tag}-ask.png`, fullPage: true });
      // The brief opens once a day: use a fresh context where it hasn't been read yet.
      const bctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: vp === 'phone' ? 2 : 1 });
      await bctx.addInitScript(() => sessionStorage.setItem('semora-intro-done', '1'));
      const bpage = await bctx.newPage();
      await bpage.goto(BASE + '/');
      await bpage.waitForTimeout(1800);
      await bpage.screenshot({ path: `${out}/${tag}-brief.png` });
      await bctx.close();
      if (vp === 'phone') {
        await page.goto(`${BASE}/money`);
        await page.waitForTimeout(1000);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) errors.push(`[${tag}] horizontal overflow on /money: ${over}px`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${out}/console-report.txt`, errors.length ? errors.join('\n') : 'No console errors, page errors or overflow.');
  console.log(errors.length ? errors.join('\n') : 'No console errors, page errors or overflow.');
}
main().catch((e) => { console.error(e); process.exit(1); });
