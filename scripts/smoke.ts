// Browser smoke test for the deployed shape of Semora: every route renders without console errors or
// horizontal overflow, the sidebar collapses and remembers it, themes persist across a reload, the
// assistant answers with sources, and an unknown route still renders the app.
// Usage: npx tsx scripts/smoke.ts   (app running; SEMORA_URL defaults to http://localhost:5173; CHROME_PATH optional)
import { chromium } from 'playwright';

const BASE = process.env.SEMORA_URL ?? 'http://localhost:5173';
const ROUTES = ['/', '/inbox', '/digest', '/ask', '/week', '/changed', '/waiting', '/courses', '/courses/15-122', '/grades', '/subscriptions', '/storage', '/connections', '/settings', '/money', '/no-such-page'];
const fails: string[] = [];
const ok = (cond: unknown, msg: string) => { if (!cond) fails.push(msg); else console.log(`  ✓ ${msg}`); };

async function main() {
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(() => { sessionStorage.setItem('semora-intro-done', '1'); localStorage.setItem('semora-brief-day', '2026-11-11'); });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    console.log(`viewport ${vp.width}`);
    for (const r of ROUTES) {
      await page.goto(BASE + r);
      await page.waitForSelector('#main h1', { timeout: 8000 }).catch(() => fails.push(`${vp.width} ${r}: no heading`));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 1, `${vp.width} ${r} renders${over > 1 ? ` (overflow ${over}px)` : ''}`);
    }
    ok(page.url().endsWith('/no-such-page') && (await page.locator('#main h1').first().textContent())?.startsWith('Good'), `${vp.width} unknown route falls back to the dashboard`);
    await page.goto(BASE + '/money');
    await page.waitForURL(/\/subscriptions$/, { timeout: 5000 }).catch(() => undefined);
    ok(page.url().endsWith('/subscriptions'), `${vp.width} /money redirects to /subscriptions`);
    ok(errs.length === 0, `${vp.width} no console errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { sessionStorage.setItem('semora-intro-done', '1'); localStorage.setItem('semora-brief-day', '2026-11-11'); });
  const page = await ctx.newPage();
  console.log('interactions');
  await page.goto(BASE + '/');
  await page.waitForSelector('#main h1');
  await page.getByRole('link', { name: 'Changes' }).first().click();
  ok(page.url().endsWith('/changed'), 'sidebar link navigates');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  ok(await page.evaluate(() => document.documentElement.dataset.sidebar === 'compact'), 'sidebar collapses');
  await page.reload();
  ok(await page.evaluate(() => document.documentElement.dataset.sidebar === 'compact'), 'compact sidebar survives a reload');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.goto(BASE + '/settings');
  await page.waitForSelector('#main h1');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('radio', { name: /Winter/ }).click();
  await page.reload();
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.season === 'winter' && document.documentElement.dataset.scheme === 'dark'), 'dark + winter persist before first paint');
  await page.getByRole('radio', { name: 'System' }).click();
  await page.getByRole('radio', { name: /Classic/ }).click();
  await page.goto(BASE + '/');
  await page.waitForSelector('#main h1');
  await page.keyboard.press('Control+j');
  await page.getByRole('dialog', { name: 'Ask Semora' }).waitFor();
  await page.getByRole('textbox', { name: 'Ask Semora' }).fill('Which assignment deadline is correct?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const answer = await page.locator('.assistant .chat-answer').last().innerText();
  ok(answer.includes('HW5: Mon Nov 16') && answer.includes("won't guess"), 'assistant answers with the reconciled deadline');
  ok(await page.locator('.assistant .chat-answer .chip').count() > 0, 'assistant answer carries source chips');
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/subscriptions');
  await page.waitForSelector('#main h1');
  await page.getByRole('button', { name: 'Mark for follow-up' }).click();
  await page.waitForTimeout(500);
  ok(await page.getByRole('button', { name: '✓ Following up' }).count() === 1, 'trial follow-up records and shows');
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n${fails.join('\n')}` : '\nAll smoke checks passed.');
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
