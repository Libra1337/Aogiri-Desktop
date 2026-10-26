// A WebSocket-shaped connection to the local daemon's protocol, carried
// through the LynShen relay inside a Noise IK session (LynShen-CLI
// docs/relay-protocol.md §3.2, §4, §7). DaemonClient uses it in place of a
// plain WebSocket: "open" means the daemon accepted this device, and text
// frames in and out are encrypted and chunked. With a relay token (v2, the
// LynShen account) the socket goes to `/relay/v2/connect` and carries the
// token as a subprotocol (browsers cannot set headers on a WebSocket).

import type { SocketLike } from '$lib/daemon';
import { FrameReader, Initiator, sealFrame, type CipherState, type StaticKey } from './noise';

export type RelayErrorKind =
	/** The computer's daemon is not connected to the relay (4404). */
	| 'offline'
	/** v2: the computer is another account's, or it is on v1 (4403, or the
	 *  daemon said `wrong account`). */
	| 'not-yours'
	/** The daemon refused this device: its pairing code was wrong or used up. */
	| 'pair-invalid'
	/** The daemon refused this device: not paired, or revoked (also 4401). */
	| 'revoked'
	/** A connect request found no Aogiri window open on the computer. */
	| 'no-desktop'
	/** The computer's user refused the connect request. */
	| 'denied'
	/** Nobody answered the connect request within 120 s. */
	| 'expired'
	/** The computer already has three connect requests waiting. */
	| 'requests-busy'
	/** The relay is restarting (4503): reconnect at once. */
	| 'restarting'
	/** Paired: the computer has not confirmed this device yet. `check` is
	 *  the 6-digit code both sides show. */
	| 'pending'
	/** Too many connections (4429). */
	| 'busy'
	/** The daemon ended the stream (4410). */
	| 'closed'
	/** The relay could not be reached, or the stream broke. */
	| 'network'
	/** The daemon's reply could not be read. */
	| 'protocol';

export class RelayError extends Error {
	constructor(
		readonly kind: RelayErrorKind,
		message: string,
		/** For `pending`: the check code. */
		readonly check?: string
	) {
		super(message);
	}

	/** Retrying on its own will not help: the user has to act (pair again,
	 *  ask again, or open Aogiri on the computer). */
	get fatal() {
		return FATAL.has(this.kind);
	}
}

const FATAL = new Set<RelayErrorKind>(['not-yours', 'pair-invalid', 'revoked', 'no-desktop', 'denied', 'expired', 'requests-busy']);

/** The relay's subprotocol, and the prefix of the one carrying the token. */
export const RELAY_SUBPROTOCOL = 'lynshen-relay';
export const BEARER_SUBPROTOCOL = 'lynshen-bearer.';

export interface RelayOptions {
	/** Relay base, e.g. `wss://app.lynshen.org/relay/v1`. */
	relay: string;
	hostId: string;
	hostStatic: Uint8Array;
	/** This phone's key for this computer, or how to get it. */
	device: StaticKey | (() => Promise<StaticKey>);
	name: string;
	/** One-time pairing code, sent only on the first connection. */
	pair?: string;
	/** v2: the account's relay token (10 minutes, one per connection). The
	 *  socket then uses `/relay/v2/connect`, `relay` naming either version. */
	token?: string;
	/** v2: ask the computer's user to let this device in (msg 1
	 *  `request: true`); the daemon answers within 120 s. */
	request?: boolean;
	/** The request is on its way: `check` is the 6-digit code the computer's
	 *  dialog shows too. */
	onWaiting?: (check: string) => void;
	/** Called once the daemon accepted the device (msg 2 `ok:true`). */
	onAccepted?: (reply: { device?: string; name?: string }) => void;
	/** Called with the reason whenever the socket fails or closes. */
	onRelayError?: (error: RelayError) => void;
	/** For tests. */
	WebSocketImpl?: typeof WebSocket;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;
const HANDSHAKE_TIMEOUT_MS = 15_000;
/** The computer's user has 120 s to answer a connect request. */
const REQUEST_TIMEOUT_MS = 130_000;

/** The relay base of version `v`: `…/relay/v1` ⇄ `…/relay/v2`. */
export function relayVersion(relay: string, v: 1 | 2): string {
	const base = relay.replace(/\/+$/, '');
	return /\/v[12]$/.test(base) ? base.replace(/\/v[12]$/, `/v${v}`) : `${base}/v${v}`;
}

/** The 6-digit check code of a pairing (LynShen-CLI `check_code`): the
 *  first 8 bytes of `bytes`, big-endian, modulo 10^6, zero-padded. */
export function checkCode(bytes: Uint8Array): string {
	let n = 0n;
	for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bytes[i] ?? 0);
	return String(n % 1_000_000n).padStart(6, '0');
}

export function closeCodeError(code: number, reason: string): RelayError {
	switch (code) {
		case 4404:
			return new RelayError('offline', reason || 'host offline');
		case 4403:
			// `revoked`: the login was removed from the account (§7.5).
			return /revoked/.test(reason) ? new RelayError('revoked', reason) : new RelayError('not-yours', reason || 'not your computer');
		case 4503:
			return new RelayError('restarting', reason || 'server restarting');
		case 4410:
			return new RelayError('closed', reason || 'host closed');
		case 4429:
			return new RelayError('busy', reason || 'too many connections');
		case 4401:
			return new RelayError('revoked', reason || 'unauthorized');
		case 4400:
			return new RelayError('protocol', reason || 'protocol error');
		default:
			return new RelayError('network', reason || `connection closed (${code})`);
	}
}

/** What the daemon's refusal (msg 2 `ok:false`) means for this device. */
export function refusalError(error: string | undefined, pairing: boolean): RelayError {
	const kinds: Record<string, RelayErrorKind> = {
		no_desktop: 'no-desktop',
		denied: 'denied',
		expired: 'expired',
		busy: 'requests-busy',
		'wrong account': 'not-yours'
	};
	return new RelayError(kinds[error ?? ''] ?? (pairing ? 'pair-invalid' : 'revoked'), error || 'device not authorized');
}

export class RelaySocket implements SocketLike {
	readyState = CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	/** Why the socket failed or closed, once it has. */
	error: RelayError | null = null;

	#ws: WebSocket;
	#initiator!: Initiator;
	/** The initiator, once the device key is at hand. */
	#ready: Promise<Initiator>;
	/** Messages in order: the handshake reply waits for the key work. */
	#queue: Promise<void> = Promise.resolve();
	#send: CipherState | null = null;
	#reader: FrameReader | null = null;
	#timer: ReturnType<typeof setTimeout>;

	constructor(private opts: RelayOptions) {
		const Impl = opts.WebSocketImpl ?? WebSocket;
		const base = opts.token ? relayVersion(opts.relay, 2) : opts.relay.replace(/\/+$/, '');
		const url = `${base}/connect?host=${encodeURIComponent(opts.hostId)}`;
		this.#ws = opts.token ? new Impl(url, [RELAY_SUBPROTOCOL, BEARER_SUBPROTOCOL + opts.token]) : new Impl(url);
		this.#ws.binaryType = 'arraybuffer';
		const device = typeof opts.device === 'function' ? opts.device() : Promise.resolve(opts.device);
		this.#ready = device.then((key) => (this.#initiator = new Initiator(key, opts.hostStatic)));
		const asking = !!opts.request && !opts.pair;
		this.#timer = setTimeout(
			() => this.#fail(new RelayError(asking ? 'expired' : 'network', 'handshake timed out')),
			asking ? REQUEST_TIMEOUT_MS : HANDSHAKE_TIMEOUT_MS
		);

		this.#ws.onopen = () => {
			const hello: Record<string, string | boolean> = { name: opts.name };
			if (opts.pair) hello.pair = opts.pair;
			else if (opts.request) hello.request = true;
			this.#queue = this.#queue
				.then(() => this.#ready)
				.then((initiator) => initiator.write1(new TextEncoder().encode(JSON.stringify(hello))))
				.then((msg1) => {
					this.#ws.send(msg1 as Uint8Array<ArrayBuffer>);
					// The daemon takes the check code from the handshake hash
					// after msg 1, as this side does: shown while it asks.
					if (asking) opts.onWaiting?.(checkCode(this.#initiator.handshakeHash));
				})
				.catch((e) => this.#fail(new RelayError('protocol', String(e))));
		};
		this.#ws.onmessage = (event) => {
			if (!(event.data instanceof ArrayBuffer)) return this.#fail(new RelayError('protocol', 'unexpected text frame'));
			const bytes = new Uint8Array(event.data);
			// After the handshake, frames are handled as they come.
			if (this.#reader) return this.#guard(() => this.#receive(bytes));
			this.#queue = this.#queue.then(() => this.#guard(() => this.#receive(bytes)));
		};
		this.#ws.onerror = () => {
			// A close event (with the relay's code) always follows.
		};
		this.#ws.onclose = (event) => {
			this.#finish(this.error ?? closeCodeError(event.code, event.reason));
		};
	}

	async #guard(work: () => void | Promise<void>) {
		try {
			await work();
		} catch (e) {
			this.#fail(e instanceof RelayError ? e : new RelayError('protocol', String(e)));
		}
	}

	async #receive(message: Uint8Array) {
		if (this.#reader) {
			const text = this.#reader.push(message);
			if (text !== null) this.onmessage?.({ data: text });
			return;
		}
		// The check code is from the handshake hash after msg 1 (the daemon
		// takes it at the same point): taken before msg 2 is read.
		const check = checkCode(this.#initiator.handshakeHash);
		const { payload, transport } = await this.#initiator.read2(message);
		let reply: { ok?: boolean; error?: string; device?: string; name?: string; pending?: boolean; check?: string };
		try {
			reply = JSON.parse(new TextDecoder().decode(payload));
		} catch {
			throw new RelayError('protocol', 'unreadable handshake reply');
		}
		if (reply.pending) {
			// A new pairing shows this connection's code; later tries show
			// the first one, which the computer kept.
			throw new RelayError('pending', reply.error || 'waiting for the computer', this.opts.pair ? check : reply.check);
		}
		if (!reply.ok) throw refusalError(reply.error, !!this.opts.pair);
		clearTimeout(this.#timer);
		this.#send = transport.send;
		this.#reader = new FrameReader(transport.recv);
		this.readyState = OPEN;
		this.opts.onAccepted?.({ device: reply.device, name: reply.name });
		this.onopen?.();
	}

	send(text: string) {
		if (this.readyState !== OPEN || !this.#send) throw new Error('relay socket is not open');
		for (const message of sealFrame(this.#send, text)) this.#ws.send(message as Uint8Array<ArrayBuffer>);
	}

	close() {
		if (this.readyState === CLOSED) return;
		this.#ws.close(1000);
		this.#finish(this.error ?? new RelayError('closed', 'closed'));
	}

	#fail(error: RelayError) {
		this.error ??= error;
		try {
			this.#ws.close(1000);
		} catch {
			/* already closing */
		}
		this.#finish(error);
	}

	#finish(error: RelayError) {
		if (this.readyState === CLOSED) return;
		const wasOpen = this.readyState === OPEN;
		clearTimeout(this.#timer);
		this.readyState = CLOSED;
		this.error ??= error;
		this.opts.onRelayError?.(this.error);
		if (!wasOpen) this.onerror?.();
		this.onclose?.();
	}
}
