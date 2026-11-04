import { describe, expect, it } from 'vitest';
import { MAX_ERRORS, POLL_STEPS_MS, TranscriptPoll, unlistable } from './transcriptPoll';

describe('subagent transcript polling (ticket #72)', () => {
	it('slows down while nothing changes, and is quick again when it grows', () => {
		const p = new TranscriptPoll();
		expect(p.next({ seq: 1, error: '', size: 3 })).toBe(POLL_STEPS_MS[0]);
		expect(p.next({ seq: 2, error: '', size: 3 })).toBe(5000);
		expect(p.next({ seq: 3, error: '', size: 3 })).toBe(10_000);
		expect(p.next({ seq: 4, error: '', size: 3 })).toBe(30_000);
		expect(p.next({ seq: 5, error: '', size: 3 })).toBe(30_000);
		expect(p.next({ seq: 6, error: '', size: 4 })).toBe(2500);
	});

	it('a read with no answer yet slows the poll down', () => {
		const p = new TranscriptPoll();
		expect(p.next(undefined)).toBe(2500);
		expect(p.next(undefined)).toBe(5000);
		expect(p.next({ seq: 1, error: '', size: 1 })).toBe(2500);
		// The same answer again (the read's answer not in yet): the step, then slower.
		expect(p.next({ seq: 1, error: '', size: 1 })).toBe(2500);
		expect(p.next({ seq: 1, error: '', size: 1 })).toBe(5000);
	});

	it('a retry does not take the error already shown for its answer', () => {
		const p = new TranscriptPoll(7);
		expect(p.next({ seq: 7, error: 'list_turns is not supported yet', size: 0 })).toBe(2500);
		expect(p.stopped).toBeNull();
		expect(p.next({ seq: 8, error: '', size: 2 })).toBe(2500);
	});

	it("stops at once on Codex's -32601 for a thread it cannot list", () => {
		const p = new TranscriptPoll();
		expect(p.next({ seq: 1, error: 'list_turns is not supported yet', size: 0 })).toBeNull();
		expect(p.stopped).toBe('unlistable');
		expect(p.next({ seq: 2, error: '', size: 9 })).toBeNull();
		p.reset();
		expect(p.next({ seq: 3, error: '', size: 9 })).toBe(2500);
	});

	it('stops after a few errors in a row, backing off between them', () => {
		const p = new TranscriptPoll();
		const waits: (number | null)[] = [];
		for (let i = 1; i <= MAX_ERRORS; i++) waits.push(p.next({ seq: i, error: 'thread-store conflict: busy', size: 0 }));
		expect(waits).toEqual([5000, 10_000, null]);
		expect(p.stopped).toBe('errors');
	});

	it('an answer without an error clears the error count', () => {
		const p = new TranscriptPoll();
		p.next({ seq: 1, error: 'timeout', size: 0 });
		p.next({ seq: 2, error: 'timeout', size: 0 });
		p.next({ seq: 3, error: '', size: 1 });
		expect(p.errors).toBe(0);
		expect(p.next({ seq: 4, error: 'timeout', size: 1 })).not.toBeNull();
	});

	it('at most one read per 2.5 s even in the worst case (ticket: 92 reads in 60 s)', () => {
		const p = new TranscriptPoll();
		let t = 0;
		let reads = 0;
		let size = 0;
		while (t < 60_000) {
			const wait = p.next({ seq: reads + 1, error: '', size: size++ });
			if (wait === null) break;
			t += wait;
			reads++;
		}
		expect(reads).toBeLessThanOrEqual(24);
	});

	it('knows the errors that never go away', () => {
		expect(unlistable('list_turns is not supported yet')).toBe(true);
		expect(unlistable('no rollout found for thread id 0199')).toBe(true);
		expect(unlistable('unknown op: subagent_transcript')).toBe(true);
		expect(unlistable('stream disconnected')).toBe(false);
	});
});
