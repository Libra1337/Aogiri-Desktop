// A finished turn's work folds into one line under its question
// (MessageList): the thinking, the tool calls and the text written between
// them. The line says how long the turn took and how many files it changed
// ("处理了 4m12s · 改了 3 个文件 +42 −7"). What the reader still has to see or
// act on stays out: the final reply, plans and their approval, errors. A
// turn that failed, that the reader stopped or that the engine left
// unfinished does not fold, so what went wrong stays in view. Its open state is kept by its user message.
import type { Msg } from './chat.svelte';
import { parseDelivery } from './delivery';
import { wasStopped } from './recap';

export interface TurnFold {
	/** The user message that opened the turn: keys its open state. */
	key: Msg;
	/** The rows folded away, in order; the first one carries the line. */
	members: Msg[];
	/** How long the turn took, ms (null: not known, a reloaded transcript). */
	elapsed: number | null;
	/** Tool calls folded away. */
	calls: number;
	/** The files the turn changed and their line counts (TurnStats). */
	files: number;
	added: number;
	removed: number;
}

/** A user message that starts a turn: not a subagent's or another
 *  conversation's delivery, which joins the turn it arrives in. */
const opensTurn = (m: Msg) => m.kind === 'user' && !parseDelivery(m.text);

/** The folds of `messages`' finished turns. `shows`: whether a message has a
 *  row at all; `busy`: the last turn still runs (a turn waiting on the work
 *  it handed off counts). Of the running turn only what a reply ended before
 *  folds (a background task's result runs a short turn of its own): what
 *  runs now stays open. */
export function turnFolds(messages: readonly Msg[], shows: (m: Msg) => boolean, busy: boolean): TurnFold[] {
	const turns: { key: Msg; body: Msg[] }[] = [];
	for (const m of messages) {
		if (opensTurn(m)) turns.push({ key: m, body: [] });
		else if (shows(m)) turns.at(-1)?.body.push(m);
	}
	const folds: TurnFold[] = [];
	turns.forEach(({ key, body: all }, i) => {
		let body = all;
		if (busy && i === turns.length - 1) {
			const ended = all.findLastIndex((m) => m.kind === 'assistant' && !!m.turn);
			if (ended < 0) return;
			body = all.slice(0, ended + 1);
		}
		// Failed or stopped: left open.
		if (wasStopped(key) || body.some((m) => m.kind === 'error' || m.kind === 'cut' || (m.kind === 'tool' && m.cut))) return;
		const stats = body.findLast((m) => m.kind === 'assistant' && !!m.turn);
		const turn = stats?.kind === 'assistant' ? stats.turn : undefined;
		if (stats?.kind === 'assistant' && stats.interrupted) return;
		// The final reply: the text after the last other row (a reply split
		// by nothing but rows that show nothing is one reply). Plans at the
		// end stay out with it.
		let end = body.length;
		while (end > 0 && body[end - 1]!.kind === 'plan') end--;
		let reply = end;
		while (reply > 0 && body[reply - 1]!.kind === 'assistant') reply--;
		const members = body.slice(0, reply).filter((m) => m.kind !== 'plan');
		if (!members.some((m) => m.kind === 'tool' || m.kind === 'reasoning')) return;
		folds.push({
			key,
			members,
			elapsed: turn ? turn.elapsed : null,
			calls: members.filter((m) => m.kind === 'tool').length,
			files: turn?.files ?? 0,
			added: turn?.added ?? 0,
			removed: turn?.removed ?? 0
		});
	});
	return folds;
}
