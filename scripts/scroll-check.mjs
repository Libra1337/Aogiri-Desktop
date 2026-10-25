// Scroll stability of the conversation pane (production build of
// tests/browser/perf.html): a 500-turn conversation opened at its end, then
// scrolled up 240 px at a time and back down. Per engine: how far the text
// in the middle of the view moved beyond what was asked (drift; steps over
// 4 px and the largest), frames whose view showed no row (blank), rows built
// and, in Chromium, script time per step. Not run in CI; run it before and
// after a change to the list and compare.
//
// The step is the page's own scroll (scrollBy); SB_GLIDE=1 glides it over
// frames as the macOS smooth wheel does (src/lib/smoothWheel.ts); SB_WHEEL=1
// sends real wheel events instead.
//
//   node scripts/scroll-check.mjs [--webkit] [--steps 60] [--json out]
import { resolve } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { build, preview } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, webkit } from '@playwright/test';
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit');
const STEPS = Number(args[args.indexOf('--steps') + 1] || 60) || 60;
const jsonAt = args.indexOf('--json');
const outDir = mkdtempSync(resolve(tmpdir(), 'b13-scroll-'));
const shared = { configFile: false, logLevel: 'warn', plugins: [svelte({ compilerOptions: { runes: true } })], resolve: { alias: { $lib: resolve('src/lib') } } };
await build({ ...shared, build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4096, rollupOptions: { input: resolve('tests/browser/perf.html') } } });
const server = await preview({ ...shared, build: { outDir }, preview: { host: '127.0.0.1', port: 1443, strictPort: true } });
const browser = WEBKIT ? await webkit.launch() : await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const r = { engine: WEBKIT ? 'webkit' : 'chromium' };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1443/tests/browser/perf.html?defer');
  await page.waitForFunction(() => window.__perf);
  await page.evaluate(() => { window.__perf.seed(500); window.__perf.show(0); });
  await page.waitForFunction(() => window.__perf.ready());
  await page.waitForTimeout(1500);
  r.anchorSupported = await page.evaluate(() => CSS.supports('overflow-anchor', 'auto'));
  const cdp = WEBKIT ? null : await page.context().newCDPSession(page);
  await cdp?.send('Performance.enable');
  const metrics = async () => (cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])) : {});
  await page.evaluate(() => {
    const s = (window.__sb = { built: 0, blank: 0, frames: 0, drifts: [] });
    const main = document.querySelector('.chatpane main');
    new MutationObserver((recs) => { for (const rec of recs) for (const n of rec.addedNodes) if (n instanceof Element) s.built += (n.matches('.mwrap') ? 1 : 0) + n.querySelectorAll('.mwrap').length; }).observe(main, { childList: true, subtree: true });
    const tick = () => {
      s.frames++;
      const box = main.getBoundingClientRect();
      const y = box.top + box.height / 2;
      const rows = [...main.querySelectorAll('.mwrap')];
      if (!rows.some((el) => { const b = el.getBoundingClientRect(); return b.top <= y && b.bottom >= y - 200; })) s.blank++;
      if (s.on) requestAnimationFrame(tick);
    };
    s.on = true; requestAnimationFrame(tick);
  });
  if (process.env.SB_CSS) await page.addStyleTag({ content: process.env.SB_CSS });
  await page.mouse.move(550, 400);
  const m0 = await metrics();
  const t0 = Date.now();
  for (const dir of [-1, 1]) {
    for (let i = 0; i < STEPS; i++) {
      // The row at the middle of the view and where it is; after the wheel
      // and two frames it should be `delta` lower (scrolled up) or higher.
      const before = await page.evaluate(() => {
        const main = document.querySelector('.chatpane main');
        const box = main.getBoundingClientRect();
        const y = box.top + box.height / 2;
        const el = [...main.querySelectorAll('.mwrap')].find((e) => { const b = e.getBoundingClientRect(); return b.top <= y && b.bottom > y; });
        if (!el) return null;
        el.dataset.sb = '1';
        return { top: el.getBoundingClientRect().top, st: main.scrollTop };
      });
      if (process.env.SB_GLIDE) await page.evaluate((d) => new Promise((ok) => { const el = document.querySelector('.chatpane main'); let left = d, carry = 0; const step = () => { const move = Math.abs(left) < 1 ? left : left * 0.25; left -= move; const want = el.scrollTop + move + carry; el.scrollTop = want; carry = want - el.scrollTop; if (Math.abs(left) < 0.5) ok(); else requestAnimationFrame(step); }; requestAnimationFrame(step); }), dir * 240);
      else if (process.env.SB_WHEEL) await page.mouse.wheel(0, dir * 240); else await page.evaluate((d) => document.querySelector('.chatpane main').scrollBy({ top: d, behavior: 'instant' }), dir * 240);
      if (process.env.SB_WHEEL || process.env.SB_WAIT) await page.waitForTimeout(Number(process.env.SB_WAIT || 250));
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 40))))));
      const after = await page.evaluate(() => {
        const main = document.querySelector('.chatpane main');
        const el = main.querySelector('[data-sb]');
        const out = el ? { top: el.getBoundingClientRect().top, st: main.scrollTop } : null;
        el && delete el.dataset.sb;
        return out;
      });
      if (before && after) {
        // The row should move by exactly what was asked: down 240 px when
        // scrolled up, up 240 px when scrolled down.
        const moved = after.top - before.top;
        await page.evaluate((d) => window.__sb.drifts.push(d), Math.round(moved + dir * 240));
        if (Math.abs(moved + dir * 240) > 4 && process.env.SB_DEBUG) console.error('step', dir, i, 'moved', Math.round(moved), 'st', Math.round(before.st), '->', Math.round(after.st));
        if (Math.abs(moved + dir * 240) > 4) (r[dir < 0 ? 'driftUp' : 'driftDown'] = (r[dir < 0 ? 'driftUp' : 'driftDown'] ?? 0) + 1);
      }
    }
  }
  const ms = Date.now() - t0;
  const m1 = await metrics();
  const s = await page.evaluate(() => { window.__sb.on = false; return window.__sb; });
  const abs = s.drifts.map(Math.abs).sort((a, b) => a - b);
  Object.assign(r, {
    steps: STEPS * 2, ms,
    rowsBuilt: s.built, blankFrames: s.blank, frames: s.frames,
    driftMax: abs.at(-1) ?? 0, driftOver4: abs.filter((d) => d > 4).length, driftSum: abs.reduce((a, b) => a + b, 0),
    ...(cdp ? { scriptMsPerStep: +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / (STEPS * 2)).toFixed(2), layoutMsPerStep: +(((m1.LayoutDuration - m0.LayoutDuration) * 1000) / (STEPS * 2)).toFixed(2) } : {}),
    errors
  });
  console.log(JSON.stringify(r));
  if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], JSON.stringify(r, null, 2));
} finally {
  await browser.close();
  await new Promise((ok) => server.httpServer.close(ok));
  rmSync(outDir, { recursive: true, force: true });
}
