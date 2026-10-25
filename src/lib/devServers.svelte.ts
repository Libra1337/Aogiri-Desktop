// Web servers the daemon saw a session's commands start (`dev_servers`,
// LynShen CLI 0.7.9+ devservers.rs): sent on connect and on every change.
// A new one is announced in the corner (ui/notices.svelte.ts) with 打开,
// which shows it in the built-in browser; Settings → 通用 can open it
// there at once instead. The first list of a connection is what was
// already up: not announced. A server that stops takes its notice with it.
// A daemon without the event never sends one: nothing shows.
import { browser } from '$lib/browser.svelte';
import { prefs } from '$lib/prefs.svelte';
import { notices } from '$lib/ui/notices.svelte';
import { t } from '$lib/i18n';

export interface DevServer {
	port: number;
	url: string;
	pid: number;
	/** The process name ('' on Windows). */
	name: string;
	/** The daemon session it most likely belongs to. */
	session: string | null;
}

const key = (s: DevServer) => `dev-server:${s.port}:${s.pid}`;

/** The servers a `dev_servers` frame lists, or null for another frame. */
export function parseDevServers(frame: Record<string, unknown>): DevServer[] | null {
	if (frame.type !== 'dev_servers' || !Array.isArray(frame.servers)) return null;
	return frame.servers.flatMap((raw) => {
		const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		if (typeof s.port !== 'number' || typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) return [];
		return [
			{
				port: s.port,
				url: s.url,
				pid: typeof s.pid === 'number' ? s.pid : 0,
				name: typeof s.name === 'string' ? s.name : '',
				session: typeof s.session === 'string' && s.session ? s.session : null
			}
		];
	});
}

/** A server's address as a line shows it: no scheme, no trailing slash. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

export class DevServers {
	list = $state<DevServer[]>([]);
	/** Servers already shown or announced: a reconnect lists them again. */
	#seen = new Set<string>();
	/** The first list of a connection is what was already up. */
	#primed = false;
	/** The conversation a session id names, for the notice ('' : none known). */
	titleOf: (session: string) => string = () => '';

	handle(frame: Record<string, unknown>) {
		const next = parseDevServers(frame);
		if (!next) return;
		const fresh = this.#primed ? next.filter((s) => !this.#seen.has(key(s))) : [];
		for (const s of this.list) if (!next.some((n) => key(n) === key(s))) notices.dismissKey(key(s));
		for (const s of next) this.#seen.add(key(s));
		this.#primed = true;
		this.list = next;
		for (const s of fresh) this.#announce(s);
	}

	disconnected() {
		this.#primed = false;
		this.list = [];
	}

	#announce(s: DevServer) {
		const from = s.session ? this.titleOf(s.session) : '';
		const detail = from ? `${shortUrl(s.url)} · ${from}` : shortUrl(s.url);
		if (prefs.devServerAutoOpen) {
			browser.open(s.url);
			notices.show(t('shell.devServer.opened'), { detail, key: key(s) });
			return;
		}
		notices.show(t('shell.devServer.started'), {
			detail,
			key: key(s),
			action: { label: t('shell.devServer.open'), run: () => browser.open(s.url) }
		});
	}
}

export const devServers = new DevServers();
