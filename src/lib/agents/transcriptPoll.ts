// How often a running subagent's conversation is read again (AgentTranscript).
// Each read is a request to the engine (Codex: `thread/turns/list`), so the
// reads slow down while nothing changes and stop for good when the engine
// cannot list the conversation at all (ticket #72: a fixed 2.5 s poll ran
// for hours against a thread Codex answered with -32601 every time).

/** The waits between reads: back to the first whenever the conversation
 *  grows, one step longer after each read that brought nothing new. */
export const POLL_STEPS_MS = [2500, 5000, 10_000, 30_000];
/** Errors in a row after which the reads stop until the user retries. */
export const MAX_ERRORS = 3;

/** An error that will not go away by asking again: the engine cannot list
 *  this conversation (Codex `-32601 list_turns is not supported yet`, a
 *  thread with no rollout, an engine without the op). */
export function unlistable(error: string): boolean {
	return /not supported yet|-32601|method not found|unsupported|no rollout found|unknown op|invalid thread id/i.test(error);
}

export type PollStop = 'unlistable' | 'errors';

/** One answer the engine gave: `seq` counts answers, so a read whose answer
 *  has not arrived yet is told apart from one that brought nothing new. */
export interface PollAnswer {
	seq: number;
	error: string;
	size: number;
}

export class TranscriptPoll {
	step = 0;
	errors = 0;
	stopped: PollStop | null = null;
	#seq = -1;
	#size = -1;

	/** Takes the latest answer; returns the wait before the next read, or
	 *  null when reading stops (`stopped` says why). */
	next(answer: PollAnswer | undefined): number | null {
		if (this.stopped) return null;
		const fresh = answer !== undefined && answer.seq !== this.#seq;
		if (!fresh) {
			// No answer yet: ask again later, never faster.
			this.#slower();
			return POLL_STEPS_MS[this.step];
		}
		this.#seq = answer.seq;
		if (answer.error) {
			this.errors += 1;
			if (unlistable(answer.error)) this.stopped = 'unlistable';
			else if (this.errors >= MAX_ERRORS) this.stopped = 'errors';
			if (this.stopped) return null;
			this.#slower();
			return POLL_STEPS_MS[this.step];
		}
		this.errors = 0;
		if (answer.size !== this.#size) this.step = 0;
		else this.#slower();
		this.#size = answer.size;
		return POLL_STEPS_MS[this.step];
	}

	/** The user asked to try again: from the first step. */
	reset() {
		this.step = 0;
		this.errors = 0;
		this.stopped = null;
	}

	#slower() {
		this.step = Math.min(this.step + 1, POLL_STEPS_MS.length - 1);
	}
}
