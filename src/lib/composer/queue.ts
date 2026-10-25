// The composer's queue tray (QueueTray.svelte): messages sent while a turn
// runs wait in the daemon (`pending_messages`), and each can be sent into the
// running turn, sent after stopping it, taken back to the message box,
// dropped or moved. A daemon with the hello's `queue` feature takes all of
// these on every engine, a message picked by its place and text; one from
// before takes what it took then: steering the first message (LynShen,
// Codex) and taking one back (LynShen, Codex, from 0.4.27).
import type { BackendCaps, BackendId } from '$lib/backends';
import type { Op } from '$lib/protocol';

/** What the tray offers for the queue in front of it. */
export interface QueueActions {
	/** A row goes into the running turn (`steer` with its index). The engine
	 *  takes it in once a running tool ends; the tool is not cut. */
	join: boolean;
	/** A row stops the turn and starts the next one (`interrupt` with its index). */
	interrupt: boolean;
	/** A row comes back to the message box (`unqueue`). */
	takeBack: boolean;
	/** A row is dropped (`unqueue` with `discard`). */
	drop: boolean;
	/** Rows change places (`queue_move`). */
	move: boolean;
	/** A daemon before `queue`: one head button steers the first message. */
	steerFirst: boolean;
	/** ⌘↵ / ⌘⇧↵ send a typed message into the turn, or stop it and send. */
	keys: boolean;
}

/**
 * The tray's actions for a session of `backend` (whose capabilities are
 * `caps`) on a daemon with the `queue` feature or without (`queue`).
 * `legacyUnqueue`: the daemon, without the feature, is one that takes a
 * message back (UNQUEUE_SINCE). An ACP agent cannot take a message into a
 * running turn: its rows stop the turn and send instead.
 */
export function queueActions(backend: BackendId, caps: BackendCaps, queue: boolean, legacyUnqueue = false): QueueActions {
	if (queue) {
		const join = backend !== 'acp';
		return { join, interrupt: caps.interrupt, takeBack: true, drop: true, move: true, steerFirst: false, keys: join || caps.interrupt };
	}
	return {
		join: false,
		interrupt: false,
		takeBack: caps.unqueue && legacyUnqueue,
		drop: false,
		move: false,
		steerFirst: caps.steer,
		keys: false
	};
}

export type QueueAction =
	| { kind: 'steer'; index: number }
	| { kind: 'interrupt'; index: number }
	| { kind: 'unqueue'; index: number }
	| { kind: 'discard'; index: number }
	| { kind: 'move'; index: number; to: number };

/** The op for `action` on the queue as the tray shows it (`messages`): the
 *  row's text goes with its place, so a queue that moved on meanwhile still
 *  picks that message (or, gone, none). */
export function queueOp(action: QueueAction, messages: readonly string[]): Op {
	const text = messages.at(action.index);
	const pick = { index: action.index, ...(text !== undefined ? { text } : {}) };
	switch (action.kind) {
		case 'steer':
			return { op: 'steer', ...pick };
		case 'interrupt':
			return { op: 'interrupt', ...pick };
		case 'unqueue':
			return { op: 'unqueue', ...pick };
		case 'discard':
			return { op: 'unqueue', ...pick, discard: true };
		case 'move':
			return { op: 'queue_move', ...pick, to: action.to };
	}
}

/** `messages` with the one at `from` moved to place `to`. */
export function moved<T>(messages: readonly T[], from: number, to: number): T[] {
	const out = [...messages];
	if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
	const [item] = out.splice(from, 1);
	out.splice(to, 0, item!);
	return out;
}

/** Where a row dragged from `from` lands when the pointer is at `y`: among
 *  the rows whose centres are `centres`, never above the first `fixed`. */
export function dropPlace(centres: readonly number[], from: number, y: number, fixed: number): number {
	const at = centres.filter((c, i) => i !== from && c < y).length;
	return Math.max(fixed, Math.min(centres.length - 1, at));
}

/** The place a row moves to with ↑ / ↓ (`step` −1 / +1), or null at an end
 *  (the first `fixed` rows stay first). */
export function stepPlace(index: number, step: -1 | 1, count: number, fixed: number): number | null {
	const to = index + step;
	return to < fixed || to >= count ? null : to;
}
