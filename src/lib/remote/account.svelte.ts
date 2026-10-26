// The phone page's LynShen account (relay v2, LynShen-CLI
// docs/relay-protocol.md §7; gateway desktop-authorization.spec DA-14 and
// account-computers.spec AC-API-*): this browser signs in with the gateway's
// device flow as the `lynshen-web` client, keeps the device key it gets (an
// app-client key: no device seat), lists the account's computers, gets a
// 10-minute relay token for each connection and registers its Web Push
// subscription with the account. Only on the page the relay serves
// (app.lynshen.org; the gateway allows that origin), or where the build names
// a gateway (VITE_LYNSHEN_GATEWAY, tests).

export const CLIENT_ID = 'lynshen-web';
const KEY = 'lynshen-remote-account';
const GRANT = 'lynshen-remote-signin';
const INSTALL = 'lynshen-remote-install';
const PAIR = 'lynshen-remote-pending-pair';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** The gateway the account lives on. */
export const GATEWAY = (env.VITE_LYNSHEN_GATEWAY || 'https://www.lynshen.org').replace(/\/+$/, '');

/** The relay a computer of the account is reached through (the page's own
 *  relay on app.lynshen.org). */
export function accountRelay(): string {
	if (env.VITE_LYNSHEN_RELAY) return env.VITE_LYNSHEN_RELAY;
	if (typeof location !== 'undefined' && location.hostname === 'app.lynshen.org') return `wss://${location.host}/relay/v1`;
	return 'wss://app.lynshen.org/relay/v1';
}

/** This page can sign in to the account here. */
export function accountAvailable(): boolean {
	if (typeof location === 'undefined') return false;
	return location.hostname === 'app.lynshen.org' || !!env.VITE_LYNSHEN_GATEWAY;
}

export interface AccountUser {
	id: string;
	username: string;
	email?: string;
}

/** One of the account's computers (AC-API-3). */
export interface Computer {
	host_id: string;
	name: string;
	/** `macos` / `windows` / `linux`. */
	platform: string;
	version: string;
	/** The daemon's Noise static key (base64url): connections check the computer against it. */
	static_pub: string;
	online: boolean;
	last_seen_at: number;
	created_at: number;
}

export type SignInStep =
	| { kind: 'idle' }
	| { kind: 'starting' }
	/** Waiting for the approval in the browser: the code shown there too. */
	| { kind: 'waiting'; userCode: string; url: string; expiresAt: number }
	| { kind: 'failed'; reason: 'denied' | 'expired' | 'refused' | 'network'; message: string };

export class AccountError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

interface Kept {
	key: string;
	user: AccountUser;
}

function read<T>(storage: Storage | undefined, key: string): T | null {
	try {
		return JSON.parse(storage?.getItem(key) ?? 'null') as T | null;
	} catch {
		return null;
	}
}
function write(storage: Storage | undefined, key: string, value: unknown) {
	try {
		if (value === null) storage?.removeItem(key);
		else storage?.setItem(key, JSON.stringify(value));
	} catch {
		/* storage blocked: lasts for this visit */
	}
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The X-LynShen-Device header of this browser (authorized-devices AD-H1):
 *  `inst` is the HMAC of a random id kept here, so the id never leaves it. */
export async function deviceHeader(): Promise<string> {
	let id = local()?.getItem(INSTALL) ?? '';
	if (!id) {
		id = crypto.randomUUID();
		try {
			local()?.setItem(INSTALL, id);
		} catch {
			/* a new id next visit */
		}
	}
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('lynshen-device-v1/inst'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const inst = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id))));
	return `v1;inst=${inst};host=${b64url(new TextEncoder().encode(browserName()))}`;
}

/** The browser and system, as the account's device list names this one. */
export function browserName(): string {
	const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
	const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	return `Aogiri Web · ${browser}${os ? ` · ${os}` : ''}`;
}

type Fetch = typeof fetch;

/** The error text of a gateway reply (`{error: {code, message}}` or `{error, message}`). */
async function failure(res: Response): Promise<AccountError> {
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	const e = body.error;
	const code = typeof e === 'object' && e ? String((e as Record<string, unknown>).code ?? '') : typeof e === 'string' ? e : String(body.code ?? '');
	const message = typeof e === 'object' && e ? String((e as Record<string, unknown>).message ?? '') : String(body.message ?? '');
	return new AccountError(res.status, code || `http_${res.status}`, message || code || `HTTP ${res.status}`);
}

export class RemoteAccount {
	user = $state<AccountUser | null>(null);
	signIn = $state<SignInStep>({ kind: 'idle' });
	computers = $state<Computer[]>([]);
	/** The list arrived at least once since signing in. */
	loaded = $state(false);
	/** Why the last refresh failed ('' when it did not). */
	error = $state('');
	/** Signed in, signed out, or the key was refused. */
	onChange: (() => void) | null = null;
	#key = '';
	#poll: ReturnType<typeof setTimeout> | null = null;
	#fetch: Fetch;
	#sleep: (ms: number) => Promise<void>;

	constructor(fetchImpl?: Fetch, sleep?: (ms: number) => Promise<void>) {
		this.#fetch = fetchImpl ?? ((...args) => fetch(...args));
		this.#sleep = sleep ?? ((ms) => new Promise((r) => (this.#poll = setTimeout(r, ms))));
		const kept = read<Kept>(local(), KEY);
		if (kept?.key && kept.user?.id) {
			this.#key = kept.key;
			this.user = kept.user;
		}
	}

	get signedIn(): boolean {
		return !!this.#key;
	}

	async #call<T>(method: string, path: string, body?: unknown, key = this.#key): Promise<T> {
		const headers: Record<string, string> = { 'X-LynShen-Device': await deviceHeader() };
		if (key) headers.Authorization = `Bearer ${key}`;
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		let res: Response;
		try {
			res = await this.#fetch(`${GATEWAY}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
		} catch (e) {
			throw new AccountError(0, 'network', e instanceof Error ? e.message : String(e));
		}
		if (!res.ok) {
			const error = await failure(res);
			// The key was removed from the account (or the account is gone):
			// signed out here too.
			if (key && res.status === 401) this.#forget();
			throw error;
		}
		return (res.status === 204 ? undefined : await res.json()) as T;
	}

	/** Starts the device flow and polls until the browser approves it.
	 *  `open` shows the approval page (a new tab). Resolves once signed in;
	 *  `signIn` says how it goes. */
	async start(open: (url: string) => void): Promise<boolean> {
		this.cancel();
		this.signIn = { kind: 'starting' };
		try {
			const grant = await this.#call<{ device_code: string; user_code: string; expires_in?: number; interval?: number }>(
				'POST',
				'/api/desktop/oauth/device',
				{ client_id: CLIENT_ID },
				''
			);
			const url = `${GATEWAY}/oauth/authorize?user_code=${encodeURIComponent(grant.user_code)}`;
			const expiresAt = Date.now() + (Number(grant.expires_in) || 600) * 1000;
			// A reload while the browser approves picks the grant up again.
			write(session(), GRANT, { code: grant.device_code, user: grant.user_code, url, expiresAt, interval: grant.interval });
			this.signIn = { kind: 'waiting', userCode: grant.user_code, url, expiresAt };
			open(url);
			return await this.#wait(grant.device_code, Number(grant.interval) || 5, expiresAt);
		} catch (e) {
			this.#failed(e);
			return false;
		}
	}

	/** A sign-in started before a reload, still waiting: polls again. */
	async resume(): Promise<boolean> {
		const grant = read<{ code: string; user: string; url: string; expiresAt: number; interval?: number }>(session(), GRANT);
		if (!grant || this.signedIn || grant.expiresAt < Date.now()) {
			write(session(), GRANT, null);
			return false;
		}
		this.signIn = { kind: 'waiting', userCode: grant.user, url: grant.url, expiresAt: grant.expiresAt };
		try {
			return await this.#wait(grant.code, Number(grant.interval) || 5, grant.expiresAt);
		} catch (e) {
			this.#failed(e);
			return false;
		}
	}

	async #wait(deviceCode: string, interval: number, expiresAt: number): Promise<boolean> {
		let wait = interval * 1000;
		for (;;) {
			if (this.signIn.kind !== 'waiting') return false;
			if (Date.now() > expiresAt) throw new AccountError(400, 'expired_token', 'expired');
			await this.#sleep(wait);
			if (this.signIn.kind !== 'waiting') return false;
			let reply: Record<string, unknown>;
			try {
				reply = await this.#call<Record<string, unknown>>('POST', '/api/desktop/oauth/token', { client_id: CLIENT_ID, device_code: deviceCode }, '');
			} catch (e) {
				if (e instanceof AccountError && e.status === 429) {
					wait += 5000;
					continue;
				}
				throw e;
			}
			if (typeof reply.access_token === 'string' && reply.access_token) {
				const user = (reply.user ?? {}) as Record<string, unknown>;
				this.#keep(reply.access_token, { id: String(user.id ?? ''), username: String(user.username ?? ''), ...(typeof user.email === 'string' ? { email: user.email } : {}) });
				return true;
			}
			switch (reply.error) {
				case 'authorization_pending':
					break;
				case 'slow_down':
					wait += 5000;
					break;
				case 'access_denied':
					throw new AccountError(403, 'access_denied', 'denied');
				case 'expired_token':
					throw new AccountError(400, 'expired_token', 'expired');
				default:
					throw new AccountError(400, String(reply.error ?? 'unexpected'), String(reply.error ?? 'unexpected reply'));
			}
		}
	}

	#failed(e: unknown) {
		write(session(), GRANT, null);
		if (this.signIn.kind === 'idle') return;
		const error = e instanceof AccountError ? e : new AccountError(0, 'network', String(e));
		const reason = error.code === 'access_denied' ? 'denied' : error.code === 'expired_token' ? 'expired' : error.status === 403 ? 'refused' : 'network';
		this.signIn = { kind: 'failed', reason, message: error.message };
	}

	/** Stops waiting for an approval (the grant expires on its own). */
	cancel() {
		if (this.#poll) clearTimeout(this.#poll);
		this.#poll = null;
		write(session(), GRANT, null);
		this.signIn = { kind: 'idle' };
	}

	#keep(key: string, user: AccountUser) {
		write(session(), GRANT, null);
		this.#key = key;
		this.user = user;
		this.signIn = { kind: 'idle' };
		write(local(), KEY, { key, user } satisfies Kept);
		this.onChange?.();
	}

	#forget() {
		const had = !!this.#key;
		this.#key = '';
		this.user = null;
		this.computers = [];
		this.loaded = false;
		write(local(), KEY, null);
		if (had) this.onChange?.();
	}

	/** Signs this browser out: its push registration and its key go (a key
	 *  never used is deleted by the gateway too; the rest stays in the
	 *  account's device list until removed there). */
	async signOut(pushTarget?: string) {
		if (pushTarget) await this.#call('DELETE', '/api/desktop/oauth/push/register', { provider: 'webpush', target: pushTarget }).catch(() => {});
		await this.#call('POST', '/api/desktop/oauth/revoke').catch(() => {});
		this.#forget();
	}

	/** The account's computers, newest first (AC-API-3). */
	async refresh(): Promise<Computer[]> {
		if (!this.signedIn) return [];
		try {
			const reply = await this.#call<{ computers?: Computer[] }>('GET', '/api/desktop/oauth/computers');
			this.computers = Array.isArray(reply.computers) ? reply.computers : [];
			this.loaded = true;
			this.error = '';
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			throw e;
		}
		return this.computers;
	}

	get(hostId: string): Computer | undefined {
		return this.computers.find((c) => c.host_id === hostId);
	}

	/** Names a computer for every device of the account (AC-API-4). */
	async rename(hostId: string, name: string) {
		const reply = await this.#call<{ computers?: Computer[] }>('PATCH', `/api/desktop/oauth/computers/${encodeURIComponent(hostId)}`, { name: name.trim() });
		if (Array.isArray(reply.computers)) this.computers = reply.computers;
	}

	/** Removes a computer from the account: it is signed out (AC-API-5). */
	async remove(hostId: string) {
		const reply = await this.#call<{ computers?: Computer[] }>('DELETE', `/api/desktop/oauth/computers/${encodeURIComponent(hostId)}`);
		this.computers = Array.isArray(reply.computers) ? reply.computers : this.computers.filter((c) => c.host_id !== hostId);
	}

	/** A relay token for one connection (AC-API-1, 10 minutes). Never logged. */
	async relayToken(): Promise<string> {
		const reply = await this.#call<{ token?: string }>('POST', '/api/desktop/oauth/relay-token');
		if (!reply.token) throw new AccountError(503, 'relay_unavailable', 'no relay token');
		return reply.token;
	}

	/** Registers this browser's Web Push subscription with the account
	 *  (AC-API-6): every computer of the account can notify it. */
	async registerPush(subscription: PushSubscriptionJSON) {
		await this.#call('POST', '/api/desktop/oauth/push/register', {
			provider: 'webpush',
			subscription: { endpoint: subscription.endpoint, keys: subscription.keys },
			device_name: browserName()
		});
	}

	async unregisterPush(endpoint: string) {
		await this.#call('DELETE', '/api/desktop/oauth/push/register', { provider: 'webpush', target: endpoint });
	}
}

/** Why a pairing link cannot be used with the account's computers (an i18n
 *  key), or null when it can: a computer of the account must have the key
 *  the link names. A computer outside the account pairs over v1. */
export function pairLinkProblem(link: { host: { host_id: string; host_static_pub: string } }, computers: Pick<Computer, 'host_id' | 'static_pub'>[]): string | null {
	const computer = computers.find((c) => c.host_id === link.host.host_id);
	if (computer && computer.static_pub !== link.host.host_static_pub) return 'shell.remote.account.keyMismatch';
	return null;
}

/** A `#pair=` link opened while signed out: kept through the sign-in. */
export function keepPendingPair(link: string | null) {
	write(session(), PAIR, link);
}
export function takePendingPair(): string | null {
	const link = read<string>(session(), PAIR);
	write(session(), PAIR, null);
	return typeof link === 'string' ? link : null;
}

export const remoteAccount = new RemoteAccount();
