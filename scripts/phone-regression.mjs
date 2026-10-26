// The phone remote page at 390×844 in Chromium and WebKit: a tapped
// notification opens its session with the approval card above the composer,
// the page tells the computer which session it shows, and 通知 shows and
// changes the computer's rules. Run by CI after browser-regression.mjs;
// `node scripts/phone-regression.mjs [port]` on its own.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, webkit, expect } from '@playwright/test';

const port = Number(process.argv[2] ?? 1446);
const server = await createServer({
	configFile: false,
	plugins: [svelte({ compilerOptions: { runes: true } })],
	resolve: { alias: { $lib: resolve('src/lib') } },
	server: { host: '127.0.0.1', port, strictPort: true }
});
await server.listen();
const base = `http://127.0.0.1:${port}/tests/browser/index.html`;
const engines = [
	['chromium', () => chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })],
	['webkit', () => webkit.launch()]
];
let failed = false;
try {
	for (const [name, launch] of engines) {
		const browser = await launch();
		const errors = [];
		try {
			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
			const page = await ctx.newPage();
			page.on('pageerror', (e) => errors.push(e.message));
			const ops = () => page.evaluate(() => window.__remoteOps.map((o) => ({ ...o, id: undefined })));

			// A tapped notification: the session opens, the approval card sits
			// right above the composer, with its reason and command.
			// (This phone may run outside the sandbox: the request is an escalation.)
			await page.goto(`${base}?remoteHost&open=s-cache&scopes=full_access`);
			const card = page.locator('.session .bottom > .approval');
			await expect(card).toBeVisible({ timeout: 30000 });
			await expect(page.locator('.session .title')).toHaveText('会话缓存分片');
			await expect(card).toContainText('git push origin feat/session-cache');
			// Measured once its entrance has played.
			await card.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
			const cardBox = await card.boundingBox();
			const composerBox = await page.locator('.composer').boundingBox();
			assert.ok(cardBox && composerBox, 'card and composer have boxes');
			assert.ok(cardBox.y + cardBox.height <= composerBox.y + 1, `card above composer (${cardBox.y + cardBox.height} vs ${composerBox.y})`);
			assert.ok(composerBox.y + composerBox.height <= 844, 'composer on screen');
			assert.ok(cardBox.y > 300, `card in thumb reach (${cardBox.y})`);
			// The computer is told which session this phone shows.
			await expect.poll(async () => (await ops()).filter((o) => o.op === 'push_viewing').at(-1)?.session).toBe('s-cache');
			// Allowed once from the phone: the card goes.
			await card.getByRole('button', { name: /允许一次/ }).click();
			await expect(card).toHaveCount(0);
			assert.ok((await ops()).some((o) => o.op === 'approve' && o.session === 's-cache'), 'approve sent');
			// Back to the list: the phone shows no session any more.
			await page.locator('.session > header').getByRole('button', { name: '返回' }).click();
			await expect.poll(async () => (await ops()).filter((o) => o.op === 'push_viewing').at(-1)?.session).toBe(null);
			// Hidden (locked, another app): no session either.
			await page.evaluate(() => window.__remoteOps.splice(0));

			// 通知: the defaults, today's count, and a change sent to the computer.
			await page.goto(`${base}?remoteHost&settings`);
			const screen = page.locator('.screen');
			await expect(screen.getByText('MacBook Pro 的规则')).toBeVisible({ timeout: 30000 });
			await expect(screen.getByText('今天已推送 3 条')).toBeVisible();
			await expect(screen.getByRole('combobox', { name: '每天最多' })).toHaveValue('20');
			await expect(screen.locator('input[type=time]').first()).toHaveValue('23:00');
			await expect(screen.locator('input[type=time]').nth(1)).toHaveValue('08:00');
			await expect(screen.getByText('等你批准', { exact: true })).toBeVisible();
			await expect(screen.getByText('会话出错', { exact: true })).toBeVisible();
			await expect(screen.getByText('通知里只写会话名和要做什么。命令全文在手机上解密后才显示。')).toBeVisible();
			await screen.getByRole('combobox', { name: '每天最多' }).selectOption('10');
			await expect.poll(async () => (await ops()).find((o) => o.op === 'push_rules_set')?.rules).toEqual({ daily_budget: 10 });
			await screen.getByRole('switch', { name: '安静时段' }).click();
			await expect(screen.locator('input[type=time]')).toHaveCount(0);
			await expect(screen.getByRole('switch', { name: '安静时段' })).toHaveAttribute('aria-checked', 'false');
			await expect.poll(async () => (await ops()).filter((o) => o.op === 'push_rules_set').at(-1)?.rules).toEqual({ quiet_start: '00:00', quiet_end: '00:00' });
			await page.waitForTimeout(400);
			await page.screenshot({ path: `/tmp/phone-push-settings-${name}.png` });

			// Paired, not yet confirmed on the computer: the check code, in two
			// groups of three, and nothing else of the computer.
			await page.goto(`${base}?remoteHost&pending`);
			await expect(page.getByRole('heading', { name: '在电脑上核对这串数字' })).toBeVisible({ timeout: 30000 });
			await expect(page.locator('.check')).toHaveText('482913'.slice(0, 3) + '913');
			await expect(page.getByText('等电脑确认…')).toBeVisible();
			await expect(page.locator('.session')).toHaveCount(0);
			await page.waitForTimeout(600);
			await page.screenshot({ path: `/tmp/phone-pair-check-${name}.png` });

			// An iPad (ticket #51): iPadOS Safari says Macintosh. The wide
			// layout's sections are full-width rows from the left, and the page
			// root is the theme's canvas, not see-through (the desktop app's
			// macOS window only), so no white shows under the home indicator.
			if (name === 'webkit') {
				const ipadUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15';
				const appHtml = readFileSync('src/app.html', 'utf8')
					.replaceAll('%sveltekit.assets%', '')
					.replace('%sveltekit.head%', '<script type="module" src="/tests/browser/main.ts"></script>')
					.replace('%sveltekit.body%', '<div id="app"></div>');
				for (const [w, h] of [[1366, 1024], [1024, 1366]]) {
					const ipad = await browser.newContext({ viewport: { width: w, height: h }, userAgent: ipadUA, hasTouch: true });
					const ip = await ipad.newPage();
					ip.on('pageerror', (e) => errors.push(e.message));
					await ip.addInitScript(() => localStorage.setItem('lynshen-theme', 'dark'));
					await ip.route((u) => u.pathname === '/ipad', (r) => r.fulfill({ contentType: 'text/html', body: appHtml }));
					await ip.goto(`http://127.0.0.1:${port}/ipad?remoteHost&wide`);
					const rows = ip.locator('aside.side nav button');
					await expect(rows).toHaveCount(4, { timeout: 30000 });
					const side = await ip.locator('aside.side').boundingBox();
					for (const box of await Promise.all((await rows.all()).map((r) => r.boundingBox())))
						assert.ok(box.x - side.x < 16 && box.width > side.width - 32, `${w}×${h}: a section row spans the column (${box.x}, ${box.width})`);
					assert.equal(await ip.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(26, 26, 26)', `${w}×${h}: the root is the dark canvas`);
					await ip.screenshot({ path: `/tmp/phone-ipad-${w}x${h}.png`, scale: 'css' });
					await ipad.close();
				}
			}

			// "/" opens the engine's commands in the box, as on the desktop
			// (ticket #46); a command goes as a command, not a message; one the
			// computer runs is not listed and is not sent.
			await page.goto(`${base}?remoteHost&open=s-cache&scopes=full_access&idleAfterApprove`);
			await expect(card).toBeVisible({ timeout: 30000 });
			await card.getByRole('button', { name: /允许一次/ }).click();
			await expect(card).toHaveCount(0);
			await expect(page.locator('.composer .cact.stop')).toHaveCount(0);
			await page.evaluate(() => window.__remoteOps.splice(0));
			const field = page.locator('.composer textarea');
			await field.fill('/');
			const tray = page.locator('.composer .tray');
			await expect(tray.getByRole('option')).toHaveText([/\/compact/, /\/context/, /\/rewind/]);
			await tray.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
			await page.screenshot({ path: `/tmp/phone-slash-tray-${name}.png` });
			await field.fill('/co');
			await expect(tray.getByRole('option')).toHaveText([/\/compact/, /\/context/]);
			await tray.getByRole('option', { name: /\/compact/ }).click();
			await expect(field).toHaveValue('/compact ');
			await expect(tray).toHaveCount(0);
			await page.locator('.composer .cact.send').click();
			await expect.poll(async () => (await ops()).filter((o) => o.op === 'command').map((o) => o.input)).toEqual(['/compact']);
			assert.ok(!(await ops()).some((o) => o.op === 'user_message'), 'a command is not a message');
			await field.fill('/login');
			await page.locator('.composer .cact.send').click();
			await expect(page.getByText('/login 要在电脑上用')).toBeVisible();
			assert.ok(!(await ops()).some((o) => o.op === 'command' && o.input === '/login'), '/login not sent');
			// A sent message's buttons show without hover (a touch screen):
			// rewind asks, restores that turn and puts the message back.
			const sentRow = page.locator('.row.user').first();
			await expect(sentRow.locator('.uedit.rewind')).toBeVisible();
			await sentRow.locator('.uedit.rewind').click();
			await expect(page.getByText('回退到这一轮并重写？')).toBeVisible();
			await page.getByRole('button', { name: '回退并重写' }).click();
			await expect.poll(async () => (await ops()).filter((o) => o.op === 'command').map((o) => o.input).at(-1)).toBe('/rewind e1');
			await expect(field).toHaveValue('把会话缓存改成按会话分片，跑完单元测试再提交。');
			await expect(page.getByText('回退到这一轮并重写？')).toHaveCount(0);
			await page.screenshot({ path: `/tmp/phone-slash-${name}.png` });

			// 反馈问题 from the phone (ticket #45): sent through the computer,
			// which signs it and attaches its logs; the screenshot and the
			// phone's platform go along.
			await page.goto(`${base}?remoteHost&feedback`);
			const dialog = page.getByRole('dialog', { name: '反馈问题' });
			await expect(dialog).toBeVisible({ timeout: 30000 });
			await expect(dialog.getByText('会以工单提交到「MacBook Pro」上登录的 LynShen 账户')).toBeVisible();
			await expect(dialog.getByText('附带「MacBook Pro」的日志')).toBeVisible();
			await dialog.getByRole('button', { name: '建议', exact: true }).click();
			await dialog.locator('input').first().fill('网页端提交工单');
			await dialog.locator('textarea').fill('在 app.lynshen.org 上也能提交工单');
			await page.waitForTimeout(300);
			await page.screenshot({ path: `/tmp/phone-feedback-${name}.png` });
			await dialog.getByRole('button', { name: '提交' }).click();
			await expect(page.getByText('已提交工单 #54')).toBeVisible();
			const sent = (await ops()).find((o) => o.op === 'feedback_send');
			assert.equal(sent.title, '网页端提交工单');
			assert.equal(sent.category, 'feature');
			assert.equal(sent.with_logs, true);
			assert.equal(sent.app_version, 'web');
			assert.match(sent.body, /来自网页端（app\.lynshen\.org）· 电脑：MacBook Pro/);
			// A computer whose engine predates it says to update.
			await page.goto(`${base}?remoteHost&feedback&oldEngine`);
			await expect(dialog).toBeVisible({ timeout: 30000 });
			await dialog.locator('input').first().fill('t');
			await dialog.locator('textarea').fill('b');
			await dialog.getByRole('button', { name: '提交' }).click();
			await expect(dialog.getByText('电脑上的 Aogiri 版本较旧')).toBeVisible();

			// 全自动 is a locked row until the computer allows this phone; an
			// escalation can only be denied here.
			await page.goto(`${base}?remoteHost&open=s-cache`);
			await expect(card).toBeVisible({ timeout: 30000 });
			await expect(card.getByText('这台手机不能批准这一项，请在电脑上处理，或在电脑上授权这台手机')).toBeVisible();
			await expect(card.getByRole('button', { name: /允许一次/ })).toHaveCount(0);
			await expect(card.getByRole('button', { name: /拒绝并告诉它怎么做/ })).toBeVisible();
			await page.locator('.flatbtn.mode').click();
			const full = page.getByRole('menuitemradio', { name: /全自动/ });
			await expect(full).toBeDisabled();
			await expect(full).toContainText('要先在电脑上授权这台手机');
			await page.keyboard.press('Escape');
			// Allowed on the computer: 全自动 can be picked, the escalation allowed.
			await page.goto(`${base}?remoteHost&open=s-cache&scopes=full_auto,full_access`);
			await expect(card).toBeVisible({ timeout: 30000 });
			await expect(card.getByRole('button', { name: /允许一次/ })).toBeVisible();
			await page.locator('.flatbtn.mode').click();
			await expect(page.getByRole('menuitemradio', { name: /全自动/ })).toBeEnabled();
			await page.keyboard.press('Escape');

			// The plan sheet does not dim the conversation: no scrim, not modal;
			// the conversation behind still scrolls and takes taps; a tap
			// outside closes it, so does a drag down past 40 px (not less).
			await page.goto(`${base}?remote&cards`);
			const chips = page.getByRole('region', { name: '计划和子智能体' });
			await expect(chips.locator('.chip')).toHaveCount(2, { timeout: 30000 });
			await chips.locator('.chip').first().click();
			const sheet = page.locator('.sheet[role="dialog"]');
			await expect(sheet).toHaveAttribute('aria-modal', 'false');
			// The step marks are the desktop's (PR #64): done struck through,
			// the current one with its dot and running light, the rest hollow.
			if (await sheet.locator('.step .tick').count()) {
				await expect(sheet.locator('.step.done .tick')).toHaveCount(3);
				await expect(sheet.locator('.step.active .dot')).toHaveCount(1);
				await expect(sheet.locator('.step.active .veil')).toHaveCount(1);
				await expect(sheet.locator('.step.pending .ring')).toHaveCount(3);
			}
			await expect(page.locator('.scrim')).toHaveCount(0);
			const style = await sheet.evaluate((el) => {
				const cs = getComputedStyle(el);
				return { animationDuration: cs.animationDuration, animationTimingFunction: cs.animationTimingFunction };
			});
			assert.equal(style.animationDuration, '0.55s');
			assert.equal(style.animationTimingFunction, 'cubic-bezier(0.32, 0.86, 0.28, 1)');
			await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
			// The conversation is not covered: what is above the sheet takes a
			// wheel and a tap (a tap closes the sheet, and lands).
			const scroll = page.locator('.session .scroll');
			// It made room: the conversation's end is above the sheet.
			await expect.poll(() => scroll.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThan(100);
			const box = await sheet.boundingBox();
			await page.mouse.move(195, box.y - 120);
			await page.mouse.wheel(0, -200);
			await expect.poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeGreaterThan(50);
			await expect(sheet).toBeVisible();
			await page.waitForTimeout(300);
			await page.mouse.click(195, box.y - 60);
			await expect(sheet, 'a tap outside closes the sheet').toHaveCount(0);
			// A short drag snaps back; a long one closes.
			await chips.locator('.chip').first().click();
			await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
			const grab = sheet.locator('.grab');
			const g = await grab.boundingBox();
			await page.mouse.move(g.x + g.width / 2, g.y + 5);
			await page.mouse.down();
			await page.mouse.move(g.x + g.width / 2, g.y + 35, { steps: 4 });
			await page.mouse.up();
			await expect(sheet).toBeVisible();
			// (Snapped back: 0.3 s.)
			await page.waitForTimeout(400);
			const g2 = await grab.boundingBox();
			assert.ok(Math.abs(g2.y - g.y) < 2, `the sheet snapped back (${g2.y} vs ${g.y})`);
			await page.mouse.move(g.x + g.width / 2, g.y + 5);
			await page.mouse.down();
			await page.mouse.move(g.x + g.width / 2, g.y + 90, { steps: 6 });
			await page.mouse.up();
			await expect(sheet, 'a drag past 40 px closes the sheet').toHaveCount(0);
			// The chip toggles it.
			await chips.locator('.chip').first().click();
			await expect(sheet).toBeVisible();
			await chips.locator('.chip').first().click();
			await expect(sheet, 'the chip closes its sheet').toHaveCount(0);

			// The bar: three tabs (会话 · 工作台 · 需求) and the round 派一件事.
			await page.goto(`${base}?remoteHost&bench`);
			const nav = page.locator('nav');
			await expect(nav.locator('.tabs button')).toHaveText([/会话/, /工作台/, /需求/], { timeout: 30000 });
			const go = nav.getByRole('button', { name: '派一件事' });
			const goBox = await go.boundingBox();
			assert.ok(Math.abs(goBox.width - 56) < 1 && Math.abs(goBox.height - 56) < 1, `round button 56×56 (${goBox.width}×${goBox.height})`);
			assert.ok(goBox.x + goBox.width <= 390 && goBox.y + goBox.height <= 844, 'the round button on screen');
			// 工作台: the number cards, the deck one card at a time.
			await nav.getByRole('button', { name: /工作台/ }).click();
			const stats = page.locator('.stats');
			await expect(stats.locator('.cell')).toHaveText([/4\s*等你处理/, /1\s*进行中/, /42\s*%\s*今天用量/]);
			const deck = page.locator('.deck');
			await expect(page.locator('.deck-h')).toContainText('第 1/4 件');
			const firstTitle = await deck.locator('.title').textContent();
			// A sideways swipe of 44 px or more turns the card.
			const d = await deck.boundingBox();
			const swipe = async (from, to) => {
				await page.mouse.move(from, d.y + 30);
				await page.mouse.down();
				await page.mouse.move(to, d.y + 34, { steps: 6 });
				await page.mouse.up();
			};
			await swipe(300, 230);
			await expect(page.locator('.deck-h')).toContainText('第 2/4 件');
			assert.notEqual(await deck.locator('.title').textContent(), firstTitle);
			// Too short: nothing. From the screen edge: the system's, nothing.
			await swipe(300, 270);
			await expect(page.locator('.deck-h')).toContainText('第 2/4 件');
			await swipe(385, 250);
			await expect(page.locator('.deck-h')).toContainText('第 2/4 件');
			// Back past the first: it says so.
			await swipe(150, 260);
			await expect(page.locator('.deck-h')).toContainText('第 1/4 件');
			await page.getByRole('button', { name: '上一件' }).click();
			await expect(page.getByRole('status')).toHaveText('已经是第一件');
			// An action is allowed from its card.
			await deck.getByRole('button', { name: '允许' }).click();
			await expect.poll(async () => (await ops()).some((o) => o.op === 'decide_action' && o.decision === 'allow')).toBe(true);
			// The cards stay under the title bar while the page scrolls.
			await page.evaluate(() => window.scrollTo(0, 400));
			await expect(stats).toHaveClass(/stuck/);
			await page.waitForTimeout(200);
			const top = await page.locator('.top').boundingBox();
			const st = await stats.boundingBox();
			assert.ok(Math.abs(st.y - (top.y + top.height)) < 14, `the cards under the title bar (${st.y} vs ${top.y + top.height})`);
			await page.screenshot({ path: `/tmp/phone-bench-${name}.png` });
			// The round button opens the dispatch composer, over any tab.
			await go.click();
			await expect(page.getByRole('heading', { name: /派发|新派发/ }).first()).toBeVisible();

			// 定时任务 on 工作台 (P06): every task with how its latest run goes
			// (后台任务运行中), a switch and 立即运行; one switched off after
			// failures says so; a session with background work says so in 会话.
			await page.goto(`${base}?remoteHost&schedules&features=queue,files,schedule_runs`);
			await nav.getByRole('button', { name: /工作台/ }).click();
			const tasks = page.locator('.rest .row').filter({ has: page.getByRole('switch') });
			await expect(tasks).toHaveCount(3, { timeout: 30000 });
			await expect(tasks.nth(0)).toContainText('巡检');
			await expect(tasks.nth(0).locator('.state')).toHaveText('后台任务运行中');
			await expect(tasks.nth(0).getByRole('button', { name: '立即运行' }), 'a run that is not over cannot start again').toBeDisabled();
			await expect(tasks.nth(1)).toContainText('周报');
			await expect(tasks.nth(2)).toContainText('连续失败 3 次，已自动停用');
			await expect(tasks.nth(2).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
			for (const row of [0, 1, 2]) {
				const box = await tasks.nth(row).getByRole('button', { name: '立即运行' }).boundingBox();
				assert.ok(box.width >= 39.5 && box.height >= 39.5, `立即运行 is a 40px target (${box.width}×${box.height})`);
			}
			await tasks.first().scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			await page.screenshot({ path: `/tmp/phone-schedules-${name}.png` });
			await tasks.nth(1).getByRole('button', { name: '立即运行' }).click();
			await expect.poll(async () => (await ops()).some((o) => o.op === 'schedule_run' && o.schedule === 'sch-c')).toBe(true);
			await expect(page.getByText('已开始运行「周报」')).toBeVisible();
			await tasks.filter({ hasText: '夜间构建' }).getByRole('switch').click();
			await expect.poll(async () => (await ops()).find((o) => o.op === 'schedule_save')?.schedule).toEqual({ id: 'sch-b', enabled: true });
			await expect(tasks.filter({ hasText: '夜间构建' }).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
			await nav.getByRole('button', { name: /会话/ }).click();
			await page.evaluate(() => window.scrollTo(0, 0));
			const dev = page.locator('.sess').filter({ hasText: '启动开发服务器' });
			await expect(dev.locator('.tag')).toHaveText('后台任务运行中');
			await expect(page.locator('.sess').filter({ hasText: '会话缓存分片' }).locator('.tag.bg')).toHaveCount(0);
			await page.waitForTimeout(300);
			await page.screenshot({ path: `/tmp/phone-background-${name}.png` });
			// An older computer (no schedule_runs, no run records): the same
			// list, with no run state.
			await page.goto(`${base}?remoteHost&schedules&oldSchedules`);
			await nav.getByRole('button', { name: /工作台/ }).click();
			await expect(tasks).toHaveCount(3, { timeout: 30000 });
			await expect(page.locator('.rest .row .state')).toHaveCount(0);
			await expect(tasks.filter({ hasText: '夜间构建' })).toContainText('已停用');
			await expect(tasks.first().getByRole('button', { name: '立即运行' })).toBeEnabled();

			// A turn that ended with a next step: the recap card above the
			// composer, as on the desktop; 暂不 leaves a receipt under the reply.
			await page.goto(`${base}?remoteHost&open=s-docs`);
			await expect(page.locator('.session .title')).toHaveText('翻译文档', { timeout: 30000 });
			await expect(page.locator('.row.user')).toHaveCount(1);
			await page.evaluate(() => {
				const f = (frame) => window.__remoteSend({ session: 's-docs', ...frame });
				f({ type: 'user_message', content: '跑一遍单元测试' });
				f({ type: 'connecting' });
				f({ type: 'status', message: 'streaming' });
				f({ type: 'assistant_delta', delta: '12 个单元测试全部通过。' });
				f({ type: 'status', message: 'ready' });
				f({ type: 'prompt_suggestion', text: '提交并推送' });
			});
			const recap = page.locator('.session .recap-wrap .recap');
			await expect(recap).toBeVisible();
			await expect(recap.locator('.title')).toHaveText('本轮完成');
			await expect(recap.getByRole('button', { name: '提交并推送' })).toBeVisible();
			const rBox = await recap.boundingBox();
			const cBox = await page.locator('.composer').boundingBox();
			assert.ok(rBox.y + rBox.height <= cBox.y + 1, 'the recap card is above the composer');
			await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
			await page.screenshot({ path: `/tmp/phone-recap-${name}.png` });
			await recap.getByRole('button', { name: '暂不' }).click();
			await expect(recap).toHaveCount(0);
			await expect(page.locator('.thread')).toContainText('提交并推送');

			// Reduced motion: the sheet and the deck's cards only fade.
			const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
			calm.on('pageerror', (e) => errors.push(e.message));
			await calm.goto(`${base}?remote&cards`);
			await calm.getByRole('region', { name: '计划和子智能体' }).locator('.chip').first().click();
			const calmSheet = calm.locator('.sheet[role="dialog"]');
			assert.match(await calmSheet.evaluate((el) => getComputedStyle(el).animationName), /sheet-fade$/);
			// (The app's reduced-motion rule may shorten it further; it never slides.)
			assert.ok(parseFloat(await calmSheet.evaluate((el) => getComputedStyle(el).animationDuration)) <= 0.15);
			const calmBox = await calmSheet.boundingBox();
			await calm.waitForTimeout(60);
			assert.deepEqual(await calmSheet.boundingBox(), calmBox, 'the sheet does not move');
			await calm.goto(`${base}?remoteHost&bench`);
			await calm.getByRole('button', { name: /工作台/ }).click();
			const calmCard = calm.locator('.deck .card');
			await expect(calmCard).toBeVisible({ timeout: 30000 });
			assert.match(await calmCard.evaluate((el) => getComputedStyle(el).animationName), /fade-only/);
			await calm.close();

			// P05: the queue tray on the phone, on a computer whose daemon says
			// \`queue\` and \`files\` in its hello: every row action, always shown,
			// on its own line; the taken-back message and its file come back;
			// Claude Code's fixed row only shows; a file goes as \`files\`. On an
			// older computer (no \`features\`): take-back and the single 插入 only.
			{
				const qops = () => page.evaluate(() => window.__remoteOps.map((o) => JSON.parse(JSON.stringify({ ...o, id: undefined, session: undefined }))));
				const Q = ['顺便把 README 里的缓存一节也改了', '测试过了再提交，别推送', '提交信息用中文'];
				const queue = () =>
					page.evaluate((q) => {
						const f = (frame) => window.__remoteSend({ session: 's-docs', ...frame });
						f({ type: 'user_message', content: '跑一遍单元测试' });
						f({ type: 'connecting' });
						f({ type: 'status', message: 'streaming' });
						f({ type: 'tool_start', call_id: 'p1', name: 'bash' });
						f({ type: 'pending_messages', messages: q });
					}, Q);
				await page.goto(`${base}?remoteHost&open=s-docs&features=queue,files`);
				await expect(page.locator('.session .title')).toHaveText('翻译文档', { timeout: 30000 });
				await queue();
				const tray = page.locator('.session .composer .qtray');
				const row = (i) => tray.locator('.qrow[data-qrow]').nth(i);
				await expect(tray.locator('.qrow[data-qrow] .qtext')).toHaveText(Q);
				await expect(row(1).getByRole('button', { name: '插入' })).toBeVisible();
				assert.ok((await row(1).getByRole('button', { name: '撤回' }).boundingBox()).height >= 32, 'a thumb-sized take-back');
				const textBox = await row(0).locator('.qtext').boundingBox();
				assert.ok(textBox.width > 250, `the message keeps its line (${textBox.width})`);
				await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
				await page.screenshot({ path: `/tmp/phone-queue-${name}.png` });
				const before = (await qops()).length;
				await row(1).getByRole('button', { name: '插入' }).tap();
				await row(2).getByRole('button', { name: '中断并发送' }).tap();
				await row(0).getByRole('button', { name: '撤回' }).tap();
				await row(2).getByRole('button', { name: '删除这条' }).tap();
				assert.deepEqual(
					(await qops()).slice(before).filter((o) => ['steer', 'interrupt', 'unqueue', 'queue_move'].includes(o.op)),
					[
						{ op: 'steer', index: 1, text: Q[1] },
						{ op: 'interrupt', index: 2, text: Q[2] },
						{ op: 'unqueue', index: 0, text: Q[0] },
						{ op: 'unqueue', index: 2, text: Q[2], discard: true }
					]
				);
				await page.evaluate((q) => window.__remoteSend({ session: 's-docs', type: 'unqueued', content: q, text: q, images: [], files: ['/Users/me/code/docs/README.md'] }), Q[0]);
				await expect(page.locator('.session textarea')).toHaveValue(Q[0]);
				await expect(page.locator('.session .att-name')).toHaveText(['README.md']);
				await page.evaluate((q) => window.__remoteSend({ session: 's-docs', type: 'pending_messages', messages: q, fixed: 1 }), Q);
				await expect(row(0).locator('.qstate')).toHaveText('即将发送');
				await expect(row(0).locator('button')).toHaveCount(0);
				await page.locator('.session textarea').fill('就这条');
				await page.locator('.session .composer').getByRole('button', { name: '发送', exact: true }).tap();
				await expect.poll(async () => (await qops()).filter((o) => o.op === 'user_message').at(-1)).toEqual({ op: 'user_message', content: '就这条', files: ['/Users/me/code/docs/README.md'] });
				await page.goto(`${base}?remoteHost&open=s-docs`);
				await expect(page.locator('.session .title')).toHaveText('翻译文档', { timeout: 30000 });
				await queue();
				await expect(tray.locator('.qrow[data-qrow]')).toHaveCount(3);
				await expect(tray.locator('.qrow button')).toHaveCount(3);
				await expect(tray.locator('.qrow button[aria-label="撤回"]')).toHaveCount(3);
				const n = (await qops()).length;
				await tray.locator('.qhead').getByRole('button', { name: '插入' }).tap();
				assert.deepEqual((await qops()).slice(n).filter((o) => o.op === 'steer'), [{ op: 'steer' }]);
			}

			// The computer's side: a phone that paired asks to be confirmed with
			// its check code; a paired phone's scopes are switched there.
			const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
			desk.on('pageerror', (e) => errors.push(e.message));
			await desk.goto(`${base}?shell&settings=chat&pending`);
			await desk.getByRole('button', { name: '远程访问', exact: true }).click();
			const ask = desk.getByRole('alertdialog', { name: 'Pixel 想连接这台电脑' });
			await expect(ask).toBeVisible({ timeout: 30000 });
			await expect(ask.locator('.check')).toHaveText('482 913');
			await ask.getByRole('button', { name: '一样，确认' }).click();
			await expect(ask).toHaveCount(0, { timeout: 10000 });
			const deskOps = () => desk.evaluate(() => window.__ops.map((o) => ({ ...o, id: undefined })));
			assert.ok((await deskOps()).some((o) => o.op === 'device_confirm' && o.device === 'dev-new'), 'device_confirm sent');
			await desk.getByRole('button', { name: 'iPhone' }).click();
			await expect(desk.getByText('这台手机还可以')).toBeVisible();
			await desk.getByRole('switch', { name: '切换到全自动' }).click();
			await expect.poll(async () => (await deskOps()).filter((o) => o.op === 'device_scopes').at(-1)?.scopes).toEqual(['full_auto']);
			await expect(desk.getByRole('switch', { name: '切换到全自动' })).toHaveAttribute('aria-checked', 'true');
			await expect(desk.getByRole('switch', { name: '打开终端' })).toHaveAttribute('aria-checked', 'false');
			await desk.waitForTimeout(400);
			await desk.screenshot({ path: `/tmp/desk-device-scopes-${name}.png` });
			// Adding a device and closing its code takes the code back.
			await desk.getByRole('button', { name: '添加设备' }).click();
			await desk.locator('.code').getByRole('button', { name: '关闭' }).click();
			await expect.poll(async () => (await deskOps()).some((o) => o.op === 'pair_cancel')).toBe(true);
			await desk.close();
			// The images and videos an agent presented (B07 P07): the computer
			// reads them (fs_image), a video only when tapped; no file manager.
			const shown = await ctx.newPage();
			shown.on('pageerror', (e) => errors.push(e.message));
			await shown.goto(`${base}?remoteHost&open=s-cache&scopes=full_access&deliver`);
			await expect(shown.locator('.deliver .card')).toHaveCount(3);
			await expect(shown.locator('.deliver img')).toHaveCount(1);
			await expect(shown.locator('.deliver .card .ib')).toHaveCount(0);
			const presentedOps = () => shown.evaluate(() => window.__remoteOps.filter((o) => o.op === 'fs_image').map((o) => o.path.split('/').pop()));
			await expect.poll(presentedOps).toEqual(['q3-mau.png']);
			await shown.locator('.deliver button.ph').tap();
			await expect(shown.locator('.deliver video')).toHaveCount(1);
			await expect.poll(presentedOps).toEqual(['q3-mau.png', 'demo.webm']);
			await shown.close();
			// B11 P04: the new-session dialog lists the computer's built-in
			// agents; one not installed cannot be picked; Pi needs 全自动 here;
			// a session of one starts by its id alone. P03: a session in its
			// TUI on the computer shows its terminal; without the terminal
			// permission read-only (no keys), with it the keys reach the TUI;
			// leaving only detaches. An older computer offers neither.
			{
				const B11 = 'features=queue,files,tool_providers,acp_presets,term_attach';
				const shots = process.env.B11_SHOTS;
				const p = await ctx.newPage();
				p.on('pageerror', (e) => errors.push(e.message));
				const pops = () => p.evaluate(() => window.__remoteOps.map((o) => JSON.parse(JSON.stringify({ ...o, id: undefined }))));
				await p.goto(`${base}?remoteHost&${B11}`);
				await p.getByRole('button', { name: '新会话' }).first().tap({ timeout: 30000 });
				const dlg = p.getByRole('dialog', { name: '新会话' });
				await expect(dlg.locator('.agent')).toHaveCount(3, { timeout: 30000 });
				await expect(dlg.locator('[data-agent=omp]')).toBeDisabled();
				await expect(dlg.locator('[data-agent=omp]')).toContainText('未安装');
				// This phone may not switch to 全自动: Pi waits for that.
				await expect(dlg.locator('[data-agent=pi]')).toBeDisabled();
				await expect(dlg.locator('[data-agent=pi]')).toContainText('要先在电脑上授权这台手机');
				await dlg.locator('[data-agent=opencode]').tap();
				if (shots && name === 'webkit') await p.screenshot({ path: `${shots}/p04-new-session.png` });
				await dlg.getByRole('button', { name: '创建' }).tap();
				await expect(p.locator('.session .title')).toHaveText('OpenCode');
				await p.locator('.session textarea').fill('看看这个仓库');
				await p.locator('.session .composer').getByRole('button', { name: '发送', exact: true }).tap();
				await expect.poll(async () => (await pops()).find((o) => o.op === 'session_create')).toMatchObject({ op: 'session_create', engine: 'acp', options: { agent: 'opencode' } });
				const created = (await pops()).find((o) => o.op === 'session_create');
				assert.ok(!('command' in created.options) && !('args' in created.options), 'never a command line from a phone');
				// With 全自动 allowed, Pi starts in it.
				await p.goto(`${base}?remoteHost&${B11}&scopes=full_auto`);
				await p.getByRole('button', { name: '新会话' }).first().tap({ timeout: 30000 });
				await dlg.locator('[data-agent=pi]').tap();
				await expect(dlg.locator('.warnline')).toContainText('只能在全自动模式下使用');
				await dlg.getByRole('button', { name: '创建' }).tap();
				await p.locator('.session textarea').fill('hi');
				await p.locator('.session .composer').getByRole('button', { name: '发送', exact: true }).tap();
				await expect.poll(async () => (await pops()).find((o) => o.op === 'session_create')?.options).toEqual({ agent: 'pi', approval_mode: 'full-auto' });
				// An older computer: the three engines only, nothing asked.
				await p.goto(`${base}?remoteHost&features=queue,files`);
				await p.getByRole('button', { name: '新会话' }).first().tap({ timeout: 30000 });
				await expect(dlg.locator('.agent')).toHaveCount(0);
				assert.ok(!(await pops()).some((o) => o.op === 'acp_presets'), 'an older computer is not asked');

				// P03: read-only without the terminal permission.
				await p.goto(`${base}?remoteHost&open=s-cache&tui&${B11}`);
				const tv = p.locator('.termview');
				await expect(tv.locator('.xterm')).toBeVisible({ timeout: 30000 });
				await expect.poll(async () => (await pops()).some((o) => o.op === 'term_attach' && o.term === 't-9')).toBe(true);
				await expect(tv.locator('.ro')).toContainText('只读');
				await expect(tv.locator('.keys')).toHaveCount(0);
				await expect(p.getByRole('button', { name: '回到对话' })).toHaveCount(0);
				await tv.locator('.xterm').tap();
				await p.keyboard.type('x');
				await p.waitForTimeout(200);
				assert.ok(!(await pops()).some((o) => o.op === 'term_input'), 'a read-only view types nothing');
				await expect.poll(async () => (await pops()).some((o) => o.op === 'term_ack' && o.term === 't-9')).toBe(true);
				if (shots && name === 'webkit') await p.screenshot({ path: `${shots}/p03-tui-readonly.png` });
				// With it: keys, and the row's Esc.
				await p.goto(`${base}?remoteHost&open=s-cache&tui&scopes=terminal&${B11}`);
				await expect(tv.locator('.keys')).toBeVisible({ timeout: 30000 });
				await expect.poll(async () => (await pops()).filter((o) => o.op === 'term_attach').length).toBe(1);
				await p.waitForTimeout(300);
				await tv.locator('.keys').getByRole('button', { name: 'Esc' }).tap();
				await expect.poll(async () => (await pops()).filter((o) => o.op === 'term_input').map((o) => atob(o.data))).toEqual(['\x1b']);
				if (shots && name === 'webkit') await p.screenshot({ path: `${shots}/p03-tui.png` });
				// Leaving only detaches.
				await p.locator('.session > header').getByRole('button', { name: '返回' }).tap();
				await expect.poll(async () => (await pops()).some((o) => o.op === 'term_detach' && o.term === 't-9')).toBe(true);
				assert.ok(!(await pops()).some((o) => o.op === 'term_close'), 'leaving never ends the TUI');
				// An older computer names no terminal: the line, no view.
				await p.goto(`${base}?remoteHost&open=s-cache&tui&features=queue,files`);
				await expect(p.locator('.session .interm')).toContainText('此对话正在 TUI 中进行', { timeout: 30000 });
				await expect(p.locator('.termview')).toHaveCount(0);
				await p.close();
			}
			// B14 P02: the account (relay v2). Signed out: 用 LynShen 账号登录
			// runs the gateway's device flow as lynshen-web (approval page in
			// a new tab, its code here) and lists the account's computers;
			// rename and remove go to the account; 请求连接 opens the request
			// screen (the 6-digit code, the countdown); a refused request says
			// why and offers 再次请求 and the pairing code.
			{
				const shots = process.env.B14_SHOTS;
				const p = await ctx.newPage();
				p.on('pageerror', (e) => errors.push(e.message));
				const gw = [];
				const COMPUTER = { host_id: 'H'.repeat(22), name: 'MacBook Pro', platform: 'macos', version: '0.8.0', static_pub: 'S'.repeat(43), online: true, last_seen_at: Date.now(), created_at: 1 };
				let computers = [COMPUTER, { ...COMPUTER, host_id: 'W'.repeat(22), name: 'Windows 台式机', platform: 'windows', online: false, last_seen_at: Date.now() - 86_400_000 }];
				let polls = 0;
				// The gateway, for this page and the approval tab it opens.
				const gateway = async (route) => {
					const req = route.request();
					const path = new URL(req.url()).pathname;
					const body = req.postData() ? JSON.parse(req.postData()) : null;
					gw.push({ method: req.method(), path, body, auth: req.headers()['authorization'] ?? '', device: req.headers()['x-lynshen-device'] ?? '' });
					const json = (status, b) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
					if (path === '/api/desktop/oauth/device') return json(200, { device_code: 'd'.repeat(64), user_code: 'WXYZ-2345', expires_in: 600, interval: 1 });
					if (path === '/api/desktop/oauth/token') return json(200, ++polls < 2 ? { error: 'authorization_pending' } : { access_token: 'sk-web-test', user: { id: 'u1', username: 'chad' } });
					if (path === '/api/desktop/oauth/computers' && req.method() === 'GET') return json(200, { computers });
					if (path.startsWith('/api/desktop/oauth/computers/') && req.method() === 'PATCH') {
						computers = computers.map((c) => (path.endsWith(c.host_id) ? { ...c, name: body.name } : c));
						return json(200, { computers });
					}
					if (path.startsWith('/api/desktop/oauth/computers/') && req.method() === 'DELETE') {
						computers = computers.filter((c) => !path.endsWith(c.host_id));
						return json(200, { computers });
					}
					return json(404, { error: { code: 'not_found', message: 'not found' } });
				};
				await ctx.route('https://www.lynshen.org/**', gateway);
				await p.goto(`${base}?remoteAccount`);
				await expect(p.getByText('用 LynShen 账号登录后，这里会列出登录了同一账号的电脑')).toBeVisible({ timeout: 30000 });
				const popup = p.waitForEvent('popup');
				await p.getByRole('button', { name: '用 LynShen 账号登录' }).tap();
				const approval = await popup;
				assert.match(approval.url(), /\/oauth\/authorize\?user_code=WXYZ-2345$/);
				await approval.close();
				await expect(p.locator('.code')).toHaveText('WXYZ-2345');
				// Approved: the computers, online first; signed in as the account.
				const rows = p.locator('.computers li');
				await expect(rows).toHaveCount(2, { timeout: 15000 });
				await expect(p.getByText('已登录 chad')).toBeVisible();
				await expect(rows.nth(0)).toContainText('macOS · 在线');
				await expect(rows.nth(1)).toContainText('Windows · 最近在线');
				await expect(rows.nth(1).getByRole('button', { name: '请求连接' })).toBeDisabled();
				const flow = gw.filter((c) => c.path.endsWith('/device') || c.path.endsWith('/token'));
				assert.ok(flow.every((c) => c.body.client_id === 'lynshen-web' && !c.auth && /^v1;inst=[A-Za-z0-9_-]{43};host=/.test(c.device)), 'the device flow runs as lynshen-web with the device header');
				assert.ok(gw.filter((c) => c.path.endsWith('/computers')).every((c) => c.auth === 'Bearer sk-web-test'), 'the list is read with the key');
				await expect(p.getByText(/以前配对的电脑第一次通过账号连接时会自动绑定到账号/)).toBeVisible();
				await p.waitForTimeout(400);
				if (shots && name === 'webkit') await p.screenshot({ path: `${shots}/phone-account-computers.png` });
				// Renamed for the account; asked to connect.
				p.once('dialog', (d) => d.accept('工作 Mac'));
				await rows.nth(0).getByRole('button', { name: '更多操作' }).tap();
				await p.getByRole('menuitem', { name: '重命名' }).tap();
				await expect(rows.nth(0)).toContainText('工作 Mac');
				assert.deepEqual(gw.filter((c) => c.method === 'PATCH').map((c) => c.body), [{ name: '工作 Mac' }]);
				await rows.nth(0).getByRole('button', { name: '请求连接' }).tap();
				assert.deepEqual(await p.evaluate(() => window.__opened), ['H'.repeat(22)]);
				// Removed from the account.
				p.once('dialog', (d) => d.accept());
				await rows.nth(1).getByRole('button', { name: '更多操作' }).tap();
				await p.getByRole('menuitem', { name: '从账号移除' }).tap();
				await expect(rows).toHaveCount(1);
				// Kept for the next visit: signed in at once.
				await p.goto(`${base}?remoteAccount&signedIn&paired`);
				await expect(p.locator('.computers li').getByRole('button', { name: '打开' })).toBeVisible({ timeout: 30000 });
				// The request screen: the code the computer shows too, the countdown.
				await p.goto(`${base}?remoteAccount&waiting`);
				await expect(p.getByRole('heading', { name: '在「MacBook Pro」上点允许' })).toBeVisible({ timeout: 30000 });
				await expect(p.locator('.check')).toHaveText('482913');
				await expect(p.getByText(/等待电脑允许… 1[12]\d 秒/)).toBeVisible();
				await p.waitForTimeout(400);
				if (shots && name === 'webkit') await p.screenshot({ path: `${shots}/phone-connect-request.png` });
				// Refused: why, 再次请求, the pairing code.
				for (const [error, text] of [['denied', '电脑拒绝了这次连接。'], ['expired', '120 秒内没有人允许。可以再请求一次。'], ['no_desktop', '电脑上没有打开 Aogiri']]) {
					await p.goto(`${base}?remoteAccount&refused=${error}`);
					await expect(p.getByText(text)).toBeVisible({ timeout: 30000 });
					await expect(p.getByRole('button', { name: '再次请求' })).toBeVisible();
					await expect(p.getByRole('button', { name: '改用配对码' })).toBeVisible();
				}
				await ctx.unroute('https://www.lynshen.org/**', gateway);
				await p.close();
			}
			assert.deepEqual(errors, [], 'no page errors');
			console.log(`${name}: PHONE CHECKS PASSED`);
		} catch (e) {
			failed = true;
			console.error(`${name}: FAILED`, e, errors);
		} finally {
			await browser.close();
		}
	}
} finally {
	await server.close();
}
process.exit(failed ? 1 : 0);
