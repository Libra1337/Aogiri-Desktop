// One computer the remote page is connected to: its own daemon connection
// (through the relay, or over the LAN with a device token), with its own
// reconnect backoff, agent directory, projects and open-session routes. The
// page keeps one per paired computer, all live at once, and gives each
// computer's view its own through context. A computer of the signed-in
// LynShen account goes through relay v2 with a fresh relay token per
// connection (LynShen-CLI docs/relay-protocol.md §7); a computer paired
// before, outside the account, stays on v1.

import { getContext, setContext } from 'svelte';
import { DaemonClient, type DaemonEndpoint, type SocketLike } from '$lib/daemon';
import { AgentDirectory } from '$lib/agents.svelte';
import { Dispatches } from './dispatch.svelte';
import { resubscribe } from './push';
import { loadScopes, type Scope } from './device';
import { provideAgents } from '$lib/agentScope';
import { hostStaticKey, type RelayHost, type SavedHost } from '$lib/relay/pairing';
import { deviceKeyFor } from '$lib/relay/deviceKey';
import { RelayError, RelaySocket, type RelayErrorKind } from '$lib/relay/socket';
import { deviceName, remoteEndpoint } from '$lib/remote';
import { RemoteProjects } from './store.svelte';
import { Requirements, provideRequirements, type Requirement } from '$lib/requirements.svelte';
import { loadLists, saveLists } from './cache';
import type { AgentView, DaemonSessionView } from '$lib/agents.svelte';
import type { WorkspaceView } from './store.svelte';
import type { DispatchView } from './dispatch.svelte';
import { engine } from '$lib/engineVersion.svelte';
import type { AcpBuiltin } from '$lib/protocol';

/** A computer's lists as kept on the phone (see cache.ts). */
type Lists = {
	sessions: DaemonSessionView[];
	agents: AgentView[];
	workspaces: WorkspaceView[];
	requirements: Requirement[];
	dispatches: DispatchView[];
};

/** The id of the LAN connection (relay computers use their host id). */
export const LAN_ID = 'lan';
/** A computer of the account that refuses v2 (its daemon is on v1 now)
 *  and was paired before: v1 for this long, then v2 again. */
const V1_FALLBACK_MS = 10 * 60_000;

/** Why a refused connection is down, as an i18n key. */
const REFUSED: Partial<Record<RelayErrorKind, string>> = {
	'not-yours': 'shell.remote.account.notYours',
	'no-desktop': 'shell.remote.account.noDesktop',
	denied: 'shell.remote.account.denied',
	expired: 'shell.remote.account.expired',
	'requests-busy': 'shell.remote.account.requestsBusy'
};

/** How the page reaches a computer of the account: a relay token for each
 *  connection (10 minutes; never kept), and whether to ask its user. */
export interface AccountLink {
	token: () => Promise<string>;
	/** Ask the computer's user to let this browser in (no pairing yet). */
	request?: boolean;
	/** Paired over v1 before: the v1 route when the computer refuses v2. */
	v1?: boolean;
	/** The computer's daemon let this browser in over v2. */
	onAdmitted?: () => void;
	/** The computer's daemon no longer knows this browser. */
	onRevoked?: () => void;
}
/** How long a connection that looks up has to answer when the page wakes. */
const WAKE_PING_MS = 5000;

type Route = { onFrame: (raw: string) => void; onExit: () => void };

export type ConnectionTone = 'ok' | 'wait' | 'off';

/** How a connection is doing: a tone for its dot, a sentence (`text`) and a
 *  short label (`short`), both i18n keys. */
export function connectionState(
	kind: 'relay' | 'lan',
	status: AgentDirectory['status'],
	error: RelayErrorKind | undefined,
	waiting = false
): { tone: ConnectionTone; text: string; short: string } {
	if (status === 'on') return { tone: 'ok', text: 'shell.remote.relayConnected', short: 'shell.remote.relayConnected' };
	const refused = error && REFUSED[error];
	if (refused) return { tone: 'off', text: refused, short: 'shell.remote.account.refusedShort' };
	if (waiting) return { tone: 'wait', text: 'shell.remote.account.waiting', short: 'shell.remote.account.waitingShort' };
	if (error === 'restarting') return { tone: 'wait', text: 'shell.remote.relayConnecting', short: 'shell.remote.connecting' };
	if (kind === 'lan')
		return status === 'unreachable'
			? { tone: 'off', text: 'shell.remote.disconnected', short: 'shell.remote.disconnected' }
			: { tone: 'wait', text: 'shell.remote.connecting', short: 'shell.remote.connecting' };
	if (!error) return { tone: 'wait', text: 'shell.remote.relayConnecting', short: 'shell.remote.connecting' };
	if (error === 'pair-invalid' || error === 'revoked')
		return { tone: 'off', text: 'shell.remote.relayFatalTitle', short: 'shell.remote.relayFatalTitle' };
	if (error === 'pending') return { tone: 'wait', text: 'shell.remote.pairCheck.waiting', short: 'shell.remote.pairCheck.waitingShort' };
	if (error === 'offline') return { tone: 'off', text: 'shell.remote.relayOffline', short: 'shell.remote.hostOffline' };
	if (error === 'busy') return { tone: 'off', text: 'shell.remote.relayBusy', short: 'shell.remote.disconnected' };
	return { tone: 'off', text: 'shell.remote.relayNetwork', short: 'shell.remote.disconnected' };
}

export class HostConnection {
	readonly id: string;
	readonly kind: 'relay' | 'lan';
	readonly daemon: DaemonClient;
	readonly agents: AgentDirectory;
	readonly projects: RemoteProjects;
	readonly dispatches: Dispatches;
	readonly requirements: Requirements;
	/** Why the last relay connection failed (relay only). */
	relayError = $state<RelayError | null>(null);
	/** The daemon accepted this device at least once since the page opened. */
	everConnected = $state(false);
	/** While the computer has not confirmed this device: the 6-digit code to
	 *  compare with the one the computer shows. */
	checkCode = $state('');
	/** A computer of the account, reached through relay v2. */
	account = $state(false);
	/** A connect request waits for the computer's answer (since `waitingSince`, ms). */
	waiting = $state(false);
	waitingSince = $state(0);
	/** The next connection asks the computer's user (再次请求). */
	requestNext = false;
	/** What this phone may do on the computer beyond the defaults (granted
	 *  there); null until known, or from an engine before scopes. */
	scopes = $state<Scope[] | null>(null);
	/** Frames and exits of the sessions open on this computer, by client id. */
	#routes = new Map<string, Route>();
	#socket: SocketLike | null = null;
	#stopped = false;
	#saveTimer: ReturnType<typeof setTimeout> | undefined;
	#builtins: Promise<AcpBuiltin[]> | null = null;

	constructor(
		id: string,
		kind: 'relay' | 'lan',
		endpoint: () => Promise<DaemonEndpoint>,
		openSocket: (url: string) => SocketLike
	) {
		this.id = id;
		this.kind = kind;
		this.daemon = new DaemonClient(endpoint, (url) => {
			if (this.#stopped) throw new Error('connection stopped');
			this.#socket = openSocket(url);
			return this.#socket;
		});
		this.agents = new AgentDirectory(this.daemon);
		this.projects = new RemoteProjects(this.daemon, this.agents);
		this.dispatches = new Dispatches(this.daemon);
		this.requirements = new Requirements(this.daemon);
		this.everConnected = kind === 'lan';
		// What this phone saw last shows until the computer is reached.
		const kept = loadLists<Lists>(id);
		if (kept) {
			this.agents.sessions = kept.sessions ?? [];
			this.agents.agents = kept.agents ?? [];
			this.projects.workspaces = kept.workspaces ?? [];
			this.requirements.list = kept.requirements ?? [];
			this.dispatches.list = kept.dispatches ?? [];
			this.everConnected = true;
		}
	}

	/** A paired computer through the relay; `pair` goes along until its
	 *  daemon accepts this device once. With `account`, a computer of the
	 *  signed-in account through relay v2 (its daemon checks the account,
	 *  then this device: paired before, a pairing code, or a request). */
	static relay(host: SavedHost | RelayHost, pair?: string, account?: AccountLink): HostConnection {
		// Its own key, or the older shared one it was paired with. A device
		// paired over v1 keeps its key on v2: the daemon knows it by it and
		// binds it to the account on this first v2 connection.
		const legacy = !pair && !account?.request && !(host as SavedHost).own_key;
		const device = () => deviceKeyFor(host.host_id, legacy);
		const name = deviceName();
		let request = account?.request;
		let bearer = '';
		let v1Until = 0;
		const v2 = () => !!account && Date.now() >= v1Until;
		const conn: HostConnection = new HostConnection(
			host.host_id,
			'relay',
			async () => {
				// A new token for every connection: a refused login fails here
				// (the account signs out) instead of at the relay, where a
				// browser cannot read the HTTP 401.
				if (v2()) bearer = await account!.token();
				return { url: host.relay, token: '' };
			},
			() =>
				new RelaySocket({
					relay: host.relay,
					hostId: host.host_id,
					hostStatic: hostStaticKey(host),
					device,
					name,
					pair,
					...(v2() ? { token: bearer, request: !pair && (request || conn.requestNext) } : {}),
					onWaiting: (check) => {
						conn.waiting = true;
						conn.waitingSince = Date.now();
						conn.checkCode = check;
					},
					onAccepted: () => {
						pair = undefined;
						request = false;
						conn.requestNext = false;
						conn.waiting = false;
						conn.relayError = null;
						conn.checkCode = '';
						conn.everConnected = true;
						if (v2()) account?.onAdmitted?.();
					},
					onRelayError: (error) => {
						if (conn.#stopped) return;
						conn.waiting = false;
						// Paired over v1 before, and the computer is on v1 now
						// (signed out, or a relay without v2): the v1 route for a
						// while, as the daemon itself falls back.
						if (error.kind === 'not-yours' && v2() && account?.v1 && !request) {
							v1Until = Date.now() + V1_FALLBACK_MS;
							conn.relayError = new RelayError('network', error.message);
							setTimeout(() => conn.agents.retryNow(), 0);
							return;
						}
						conn.relayError = error;
						// The daemon no longer knows this device.
						if (error.kind === 'revoked' && v2()) account?.onRevoked?.();
						if (error.fatal) conn.agents.stop();
						// The relay restarts: another one takes over at once.
						else if (error.kind === 'restarting') setTimeout(() => conn.agents.retryNow(), 1000);
						// Waiting for the computer to confirm: the code is used, the
						// device is known now; ask again soon.
						if (error.kind === 'pending') {
							pair = undefined;
							conn.checkCode = error.check ?? conn.checkCode;
							setTimeout(() => conn.agents.retryNow(), 2000);
						}
					}
				})
		);
		conn.account = !!account;
		if (request) conn.everConnected = false;
		return conn;
	}

	/** Asks the computer's user again: after a refused or unanswered
	 *  request, or when the computer no longer knows this device. */
	askAgain() {
		if (this.#stopped) return;
		this.requestNext = true;
		this.relayError = null;
		this.agents.start();
	}

	/** The daemon that served this page, with this device's LAN token.
	 *  `check`: a new pairing's check code, shown until the computer
	 *  confirms the device (its token connects from then on). */
	static lan(token: string, check = ''): HostConnection {
		const conn: HostConnection = new HostConnection(
			LAN_ID,
			'lan',
			async () => remoteEndpoint(token),
			(url) => new WebSocket(url) as unknown as SocketLike
		);
		if (check) {
			conn.checkCode = check;
			conn.everConnected = false;
		}
		return conn;
	}

	/** This phone may `scope` here: granted, or an engine that does not limit. */
	may(scope: Scope): boolean {
		return this.scopes === null || this.scopes.includes(scope);
	}

	/** The computer's built-in ACP agents (`acp_presets`): asked once per
	 *  connection, since the daemon asks each program its version to answer. */
	acpBuiltins(): Promise<AcpBuiltin[]> {
		this.#builtins ??= this.daemon
			.request({ op: 'acp_presets' })
			.then((reply) => (Array.isArray(reply.presets) ? (reply.presets as AcpBuiltin[]) : []));
		this.#builtins.catch(() => (this.#builtins = null));
		return this.#builtins;
	}

	/** Paired, and the computer has not confirmed this device yet. */
	get awaitingConfirm(): boolean {
		return !!this.checkCode && !this.everConnected && !this.waiting;
	}

	/** Connects and keeps reconnecting, with backoff, until stopped. */
	start() {
		this.daemon.onEvent = (frame) => {
			// The computer changed what this phone may do.
			if (frame.type === 'device_scopes_changed') loadScopes(this.daemon).then((scopes) => (this.scopes = scopes));
			this.agents.handle(frame);
			this.projects.handle(frame);
			this.dispatches.handle(frame);
			this.requirements.handle(frame);
			this.#keepLists();
		};
		// Notifications keep reaching this phone after the computer restarts
		// or the browser renews its subscription.
		this.daemon.onHello = (version, features) => {
			engine.version = version;
			engine.features = features;
			this.checkCode = '';
			this.everConnected = true;
			loadScopes(this.daemon).then((scopes) => (this.scopes = scopes));
			resubscribe(this.daemon).catch(() => {});
		};
		this.daemon.onDisconnect = () => {
			// The lists stay, as last seen, until the computer is back.
			this.agents.disconnected();
			this.projects.reset();
			this.#builtins = null;
		};
		this.daemon.onFrame = (id, raw) => this.#routes.get(id)?.onFrame(raw);
		this.daemon.onExit = (id) => this.#routes.get(id)?.onExit();
		this.agents.start();
	}

	/** The page came back to the foreground. A socket the phone suspended can
	 *  still look open, so a connection that seems up must answer a ping
	 *  within a few seconds or is dropped (and reconnects); one that is down
	 *  retries now instead of waiting out its backoff. */
	async wake() {
		if (this.#stopped) return;
		if (this.agents.status !== 'on') return this.agents.retryNow();
		const socket = this.#socket;
		// Any reply counts, an older daemon's error to `ping` included.
		const answered = await Promise.race([
			this.daemon.request({ op: 'ping' }).then(
				() => true,
				() => true
			),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WAKE_PING_MS))
		]);
		if (!answered && this.#socket === socket) socket?.close();
	}

	/** Keeps the lists on the phone, a moment after they last changed. */
	#keepLists() {
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => {
			const lists: Lists = {
				sessions: this.agents.sessions,
				agents: this.agents.agents,
				workspaces: this.projects.workspaces,
				requirements: this.requirements.list,
				dispatches: this.dispatches.list
			};
			saveLists(this.id, $state.snapshot(lists));
		}, 1000);
	}

	/** Disconnects for good (the computer was forgotten or paired again). */
	stop() {
		this.#stopped = true;
		clearTimeout(this.#saveTimer);
		this.agents.stop();
		this.#socket?.close();
		this.#socket = null;
	}

	/** How the connection is doing (see connectionState). */
	get state() {
		return connectionState(this.kind, this.agents.status, this.relayError?.kind, this.waiting);
	}

	/** Routes daemon frames and exits for session `id` here; returns an unregister. */
	register = (id: string, onFrame: (raw: string) => void, onExit: () => void) => {
		this.#routes.set(id, { onFrame, onExit });
		return () => {
			this.#routes.delete(id);
		};
	};
}

const KEY = Symbol('remote-host');

/** Makes `conn` the computer the components below this one show. */
export function provideHost(conn: HostConnection) {
	setContext(KEY, conn);
	provideAgents(conn.agents);
	provideRequirements(conn.requirements);
}

/** The computer this part of the remote page shows. */
export function useHost(): HostConnection {
	const conn = getContext<HostConnection | undefined>(KEY);
	if (!conn) throw new Error('useHost outside a remote computer view');
	return conn;
}
