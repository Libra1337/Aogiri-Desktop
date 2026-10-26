// Phones and browsers of the same LynShen account asking to connect to this
// computer (LynShen-CLI docs/relay-protocol.md §7.4, daemon-protocol.md
// "Relay v2"): the daemon tells its local clients of each request
// (`connect_request`) and of its end (`connect_request_closed`), and waits
// up to 120 s for one of them to decide (`connect_decide`). A desktop that
// connects after a request was made asks for the open ones
// (`connect_requests`). A daemon before relay v2 knows none of these: the
// list stays empty.

import { daemon as sharedDaemon } from './protocol';
import type { DaemonClient } from './daemon';

/** How long the daemon waits for an answer. */
export const REQUEST_WAIT_MS = 120_000;

export interface ConnectRequest {
	id: string;
	/** The device's name as it gave it. */
	name: string;
	/** Its sign-in client: `aogiri-phone`, `lynshen-web`, `lynshen-cli` or `lynshen-desktop`. */
	client: string;
	/** The 6-digit code the device shows too (its handshake's check code). */
	check: string;
	/** When the daemon received it (ms). */
	at: number;
}

function parse(raw: unknown): ConnectRequest | null {
	const r = raw as Record<string, unknown> | null;
	// The daemon names the request `request`; `id` is accepted too.
	const id = typeof r?.request === 'string' ? r.request : typeof r?.id === 'string' ? r.id : '';
	if (!r || !id) return null;
	return {
		id,
		name: typeof r.name === 'string' ? r.name : '',
		client: typeof r.client === 'string' ? r.client : '',
		check: typeof r.check === 'string' && /^\d{6}$/.test(r.check) ? r.check : '',
		at: Number(r.at) || Date.now()
	};
}

/** The i18n key naming a kind of client (empty when unknown). */
export function clientKind(client: string | undefined): string {
	switch (client) {
		case 'aogiri-phone':
			return 'settings.remote.clientPhone';
		case 'lynshen-web':
			return 'settings.remote.clientWeb';
		case 'lynshen-cli':
			return 'settings.remote.clientCli';
		case 'lynshen-desktop':
			return 'settings.remote.clientDesktop';
		default:
			return '';
	}
}

/** Seconds left of a request's 120 s at `now`. */
export function secondsLeft(request: Pick<ConnectRequest, 'at'>, now: number): number {
	return Math.max(0, Math.ceil((request.at + REQUEST_WAIT_MS - now) / 1000));
}

export class ConnectRequests {
	/** Open requests, oldest first. */
	open = $state<ConnectRequest[]>([]);
	/** A new request arrived (the app chimes, and notifies while in the background). */
	onRequest: ((request: ConnectRequest) => void) | null = null;
	#daemon: DaemonClient;

	constructor(daemon: DaemonClient = sharedDaemon) {
		this.#daemon = daemon;
	}

	/** A daemon-wide frame (wired to the daemon's `onEvent`). */
	handle(frame: Record<string, unknown>) {
		if (frame.type === 'connect_request') {
			const request = parse(frame);
			if (!request || this.open.some((r) => r.id === request.id)) return;
			this.open = [...this.open, request];
			this.onRequest?.(request);
		} else if (frame.type === 'connect_request_closed') {
			const id = typeof frame.request === 'string' ? frame.request : frame.id;
			this.open = this.open.filter((r) => r.id !== id);
		}
	}

	/** Takes the daemon's open requests (on each connection). A daemon
	 *  without the op leaves the list as it is. */
	async sync() {
		try {
			const reply = await this.#daemon.request({ op: 'connect_requests' });
			if (!Array.isArray(reply.requests)) return;
			this.open = reply.requests.map(parse).filter((r): r is ConnectRequest => r !== null);
		} catch {
			/* an older daemon, or the connection dropped: nothing to show */
		}
	}

	/** Allows or denies a request. It leaves the list at once; the daemon
	 *  closes it for every client. */
	async decide(id: string, allow: boolean) {
		this.open = this.open.filter((r) => r.id !== id);
		await this.#daemon.request({ op: 'connect_decide', request: id, allow });
	}

	/** The daemon went away: its requests went with it. */
	disconnected() {
		this.open = [];
	}
}

export const connectRequests = new ConnectRequests();
