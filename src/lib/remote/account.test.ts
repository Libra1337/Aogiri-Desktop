import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteAccount, pairLinkProblem, keepPendingPair, takePendingPair, CLIENT_ID } from './account.svelte';

function storage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		map
	};
}
let local: ReturnType<typeof storage>;
beforeEach(() => {
	local = storage();
	vi.stubGlobal('localStorage', local);
	vi.stubGlobal('sessionStorage', storage());
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
/** A fake gateway: `answers` by "METHOD path", each a list used in turn. */
function gateway(answers: Record<string, { status?: number; body: unknown }[]>) {
	const calls: Call[] = [];
	const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname;
		const method = init.method ?? 'GET';
		calls.push({ url, method, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
		const list = answers[`${method} ${path}`];
		const answer = list?.length ? (list.length > 1 ? list.shift()! : list[0]) : { status: 404, body: { error: { code: 'not_found', message: 'not found' } } };
		return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } });
	});
	return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const COMPUTER = { host_id: 'H'.repeat(22), name: 'MacBook', platform: 'macos', version: '0.8.0', static_pub: 'S'.repeat(43), online: true, last_seen_at: 1, created_at: 1 };

describe('RemoteAccount', () => {
	it('signs in with the device flow as lynshen-web, polling through pending and slow_down', async () => {
		const { fetchImpl, calls } = gateway({
			'POST /api/desktop/oauth/device': [{ body: { device_code: 'd'.repeat(64), user_code: 'ABCD-EFGH', expires_in: 600, interval: 5 } }],
			'POST /api/desktop/oauth/token': [
				{ body: { error: 'authorization_pending' } },
				{ body: { error: 'slow_down' } },
				{ body: { access_token: 'sk-web', user: { id: 'u1', username: 'chad' } } }
			]
		});
		const waits: number[] = [];
		const account = new RemoteAccount(fetchImpl, async (ms) => void waits.push(ms));
		const opened: string[] = [];
		const changed = vi.fn();
		account.onChange = changed;
		expect(await account.start((url) => opened.push(url))).toBe(true);
		expect(opened[0]).toMatch(/\/oauth\/authorize\?user_code=ABCD-EFGH$/);
		expect(calls[0].body).toEqual({ client_id: CLIENT_ID });
		expect(calls.filter((c) => c.url.endsWith('/token')).every((c) => (c.body as { client_id: string }).client_id === 'lynshen-web')).toBe(true);
		// Every request names this browser (AD-H1), none carries a key yet.
		expect(calls.every((c) => /^v1;inst=[A-Za-z0-9_-]{43};host=/.test(c.headers['X-LynShen-Device']) && !c.headers.Authorization)).toBe(true);
		expect(waits).toEqual([5000, 5000, 10000]);
		expect(account.signedIn).toBe(true);
		expect(account.user).toEqual({ id: 'u1', username: 'chad' });
		expect(changed).toHaveBeenCalledOnce();
		// Kept for the next visit.
		expect(new RemoteAccount(fetchImpl).signedIn).toBe(true);
	});

	it('reports a denied sign-in', async () => {
		const { fetchImpl } = gateway({
			'POST /api/desktop/oauth/device': [{ body: { device_code: 'd'.repeat(64), user_code: 'X', interval: 1 } }],
			'POST /api/desktop/oauth/token': [{ body: { error: 'access_denied' } }]
		});
		const account = new RemoteAccount(fetchImpl, async () => {});
		expect(await account.start(() => {})).toBe(false);
		expect(account.signIn).toMatchObject({ kind: 'failed', reason: 'denied' });
		expect(account.signedIn).toBe(false);
	});

	it('lists, renames and removes computers, and gets a relay token per connection, with the key', async () => {
		local.setItem('lynshen-remote-account', JSON.stringify({ key: 'sk-web', user: { id: 'u1', username: 'chad' } }));
		const { fetchImpl, calls } = gateway({
			'GET /api/desktop/oauth/computers': [{ body: { computers: [COMPUTER] } }],
			'PATCH /api/desktop/oauth/computers/HHHHHHHHHHHHHHHHHHHHHH': [{ body: { computers: [{ ...COMPUTER, name: '工作电脑' }] } }],
			'DELETE /api/desktop/oauth/computers/HHHHHHHHHHHHHHHHHHHHHH': [{ body: { computers: [] } }],
			'POST /api/desktop/oauth/relay-token': [{ body: { token: 'lrt1.a.b' } }, { body: { token: 'lrt1.c.d' } }],
			'POST /api/desktop/oauth/push/register': [{ body: { id: 'p1' } }]
		});
		const account = new RemoteAccount(fetchImpl);
		expect((await account.refresh()).map((c) => c.name)).toEqual(['MacBook']);
		await account.rename(COMPUTER.host_id, ' 工作电脑 ');
		expect(account.get(COMPUTER.host_id)?.name).toBe('工作电脑');
		expect(calls.at(-1)!.body).toEqual({ name: '工作电脑' });
		expect(await account.relayToken()).toBe('lrt1.a.b');
		expect(await account.relayToken()).toBe('lrt1.c.d');
		await account.registerPush({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } });
		expect(calls.at(-1)!.body).toMatchObject({ provider: 'webpush', subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } } });
		await account.remove(COMPUTER.host_id);
		expect(account.computers).toEqual([]);
		expect(calls.every((c) => c.headers.Authorization === 'Bearer sk-web')).toBe(true);
	});

	it('signs out when the gateway refuses the key', async () => {
		local.setItem('lynshen-remote-account', JSON.stringify({ key: 'sk-old', user: { id: 'u1', username: 'chad' } }));
		const { fetchImpl } = gateway({ 'POST /api/desktop/oauth/relay-token': [{ status: 401, body: { error: { code: 'invalid_token', message: 'revoked' } } }] });
		const account = new RemoteAccount(fetchImpl);
		const changed = vi.fn();
		account.onChange = changed;
		await expect(account.relayToken()).rejects.toMatchObject({ status: 401 });
		expect(account.signedIn).toBe(false);
		expect(changed).toHaveBeenCalledOnce();
		expect(local.getItem('lynshen-remote-account')).toBeNull();
	});
});

describe('pairing links and the account', () => {
	const link = (pub: string) => ({ host: { host_id: COMPUTER.host_id, host_static_pub: pub } });
	it('accepts the account computer key and a computer outside the account, refuses another key', () => {
		expect(pairLinkProblem(link(COMPUTER.static_pub), [COMPUTER])).toBeNull();
		expect(pairLinkProblem(link('K'.repeat(43)), [COMPUTER])).toBe('shell.remote.account.keyMismatch');
		expect(pairLinkProblem(link('K'.repeat(43)), [])).toBeNull();
	});
	it('keeps a link through the sign-in, once', () => {
		keepPendingPair('https://app.lynshen.org/remote#pair=x.y.z');
		expect(takePendingPair()).toBe('https://app.lynshen.org/remote#pair=x.y.z');
		expect(takePendingPair()).toBeNull();
	});
});
