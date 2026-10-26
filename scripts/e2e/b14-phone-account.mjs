// Run by the B14 end-to-end setup (LynShen-CLI scripts/relay-v2-e2e.sh: a gateway test build,
// relay v1+v2 and a signed-in daemon), not by CI:
//   node scripts/e2e/b14-phone-account.mjs <page url> <gateway> <daemon host:port> <daemon token file> <dashboard session file> [shots dir]
// with the page served by `VITE_LYNSHEN_GATEWAY=… VITE_LYNSHEN_RELAY=… vite dev`.
// B14 e2e, the real phone page (src/routes/remote, Vite dev server with the local gateway and relay)
// in Playwright: signs in as lynshen-web through the gateway's device flow (the consent decision
// posted with the account's dashboard session), lists the account's computers, asks to connect,
// the desktop (a local daemon client) allows it seeing the same check code, the session list shows.
// Then a reload connects without asking. PASS/FAIL lines only; no keys or tokens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const [pageUrl, gateway, daemonAddr, tokenFile, sessionFile, shots] = process.argv.slice(2);
const report = (ok, what) => console.log(`${ok ? 'PASS' : 'FAIL'} phone-web ${what}`);
const daemonToken = readFileSync(tokenFile, 'utf8').trim();
const session = readFileSync(sessionFile, 'utf8').trim();

class Desktop {
	constructor() {
		this.frames = [];
		this.next = 500;
		this.waiters = new Map();
		this.ws = new WebSocket(`ws://${daemonAddr}/?token=${daemonToken}`);
		this.ready = new Promise((resolve, reject) => {
			this.ws.onerror = () => reject(new Error('desktop socket failed'));
			this.ws.onmessage = (e) => {
				const f = JSON.parse(String(e.data));
				if (f.type === 'hello') resolve();
				if (typeof f.id === 'number' && this.waiters.has(f.id)) {
					this.waiters.get(f.id)(f);
					this.waiters.delete(f.id);
				} else this.frames.push(f);
			};
		});
	}
	/** An op without a reply (session_meta). */
	post(op) {
		this.ws.send(JSON.stringify(op));
	}
	request(op) {
		const id = this.next++;
		return new Promise((resolve) => {
			this.waiters.set(id, resolve);
			this.ws.send(JSON.stringify({ ...op, id }));
		});
	}
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
let failed = false;
const check = (ok, what) => {
	report(ok, what);
	if (!ok) failed = true;
};
try {
	const desktop = new Desktop();
	await desktop.ready;
	const status = await desktop.request({ op: 'relay_status' });
	check(status.mode === 'v2' && status.signed_in === true, `the daemon is on relay v2, signed in (mode ${status.mode})`);
	// A session to list, titled so the phone page shows it (in the temp HOME's folder).
	const created = await desktop.request({ op: 'session_create', cwd: '/tmp' });
	if (created.session) desktop.post({ op: 'session_meta', session: created.session, title: 'B14 端到端会话' });

	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'zh-CN' });
	const page = await ctx.newPage();
	const pageErrors = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && console.log(`   console: ${m.text().slice(0, 200)}`));
	await page.goto(pageUrl);
	await expect(page.getByRole('button', { name: '用 LynShen 账号登录' })).toBeVisible({ timeout: 60000 });
	// The approval page opens in a new tab: the account approves it there (its dashboard
	// session, as the consent page's 授权 does), and this page polls the token.
	const popup = page.waitForEvent('popup');
	await page.getByRole('button', { name: '用 LynShen 账号登录' }).tap();
	const approval = await popup;
	const userCode = new URL(approval.url()).searchParams.get('user_code');
	await approval.close();
	const decided = await fetch(`${gateway}/api/desktop/oauth/decision`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: `monoize_session=${session}`, Origin: gateway.replace(/^http:/, 'https:'), Host: new URL(gateway).host },
		body: JSON.stringify({ user_code: userCode, approve: true })
	});
	check(decided.ok, `the account approved the web sign-in (HTTP ${decided.status})`);
	const rows = page.locator('.computers li');
	await expect(rows.first()).toBeVisible({ timeout: 30000 });
	const hostName = (await rows.first().locator('.name').textContent())?.trim();
	await expect(rows.first()).toContainText('在线', { timeout: 30000 });
	check(true, `the account's computers list the daemon, online (${hostName})`);
	if (shots) await page.screenshot({ path: `${shots}/e2e-phone-computers.png` });

	// 请求连接: the page waits with a check code; the desktop sees the same one and allows.
	await rows.first().getByRole('button', { name: '请求连接' }).tap();
	await expect(page.getByRole('heading', { name: /上点允许/ })).toBeVisible({ timeout: 30000 });
	const phoneCheck = ((await page.locator('.host:not([hidden]) .check').first().textContent()) ?? '').replace(/\s/g, '');
	let request;
	for (let i = 0; i < 300 && !request; i++) {
		request = desktop.frames.find((f) => f.type === 'connect_request');
		if (!request) await new Promise((r) => setTimeout(r, 100));
	}
	check(request?.client === 'lynshen-web' && request?.check === phoneCheck && /^\d{6}$/.test(phoneCheck), `connect_request reached the desktop: client ${request?.client}, check ${request?.check} = page ${phoneCheck}`);
	if (shots) await page.screenshot({ path: `${shots}/e2e-phone-request.png` });
	const answer = await desktop.request({ op: 'connect_decide', request: request.request, allow: true });
	check(answer.type === 'connect_decided', 'the desktop allowed it (connect_decide)');
	await expect(page.getByText('B14 端到端会话').first()).toBeVisible({ timeout: 30000 });
	check(true, 'allowed: the page shows the computer\'s sessions');
	const closed = desktop.frames.find((f) => f.type === 'connect_request_closed' && f.request === request.request);
	check(closed?.outcome === 'allowed', `connect_request_closed: ${closed?.outcome}`);
	const devices = (await desktop.request({ op: 'device_list' })).devices ?? [];
	check(devices.some((d) => d.client === 'lynshen-web'), 'the browser is a device of the account on the computer (client lynshen-web)');
	if (shots) await page.screenshot({ path: `${shots}/e2e-phone-sessions.png` });

	// A reload: straight in, no new request.
	const before = desktop.frames.filter((f) => f.type === 'connect_request').length;
	await page.reload();
	await expect(page.getByText('B14 端到端会话').first()).toBeVisible({ timeout: 30000 });
	check(desktop.frames.filter((f) => f.type === 'connect_request').length === before, 'after a reload it connects without asking');
	check(pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 2).join(' | ')})`);
	desktop.ws.close();
} catch (e) {
	failed = true;
	console.log(`FAIL phone-web ${String(e?.message ?? e).split('\n').slice(0, 3).join(' / ')}`);
	for (const p of browser.contexts().flatMap((c) => c.pages())) {
		await p.screenshot({ path: '/tmp/b14b-e2e-fail.png' }).catch(() => {});
		console.log(`   page ${p.url()}: ${(await p.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | ')}`);
	}
} finally {
	await browser.close();
}
process.exit(failed ? 1 : 0);
