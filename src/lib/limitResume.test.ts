import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatState } from './chat.svelte';
import { LimitResume, RESUME_GRACE_MS } from './limitResume.svelte';

describe('usage limit notices', () => {
	it('reads which limit, how much is used and when it resets', () => {
		const c = new ChatState();
		c.handle({ type: 'rate_limit', level: 'warning', message: '', resets_at: 1_790_800_000_000, window: 'five_hour', used: 83, overage: false });
		expect(c.rateLimit).toEqual({ level: 'warning', message: '', resetsAt: 1_790_800_000_000, window: 'five_hour', used: 83, overage: false });
		// An older engine sends only level, message and resets_at.
		c.handle({ type: 'rate_limit', level: 'limited', message: 'You’ve hit your limit', resets_at: null });
		expect(c.rateLimit).toEqual({ level: 'limited', message: 'You’ve hit your limit', resetsAt: null, window: '', used: null, overage: false });
		c.handle({ type: 'rate_limit', level: 'ok', message: '', resets_at: null });
		expect(c.rateLimit).toBeNull();
	});
});

describe('LimitResume', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const setup = () => {
		const chat = new ChatState();
		const retryTurn = vi.fn(async () => {});
		const resume = new LimitResume();
		resume.store = { allSessions: [{ id: 's1', chat }], retryTurn } as never;
		chat.handle({ type: 'rate_limit', level: 'limited', message: '', resets_at: Date.now() + 60_000, window: 'five_hour', used: 100 });
		return { chat, retryTurn, resume };
	};

	it('goes on with the turn a little after the reset', () => {
		const { chat, retryTurn, resume } = setup();
		resume.arm(chat);
		expect(chat.resumeAtReset).toBe(true);
		vi.advanceTimersByTime(60_000 + RESUME_GRACE_MS - 1);
		expect(retryTurn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(retryTurn).toHaveBeenCalledWith('s1', expect.any(String), true);
		expect(chat.rateLimit).toBeNull();
		expect(chat.resumeAtReset).toBe(false);
	});

	it('does nothing once called off, or when a turn already runs', () => {
		const { chat, retryTurn, resume } = setup();
		resume.arm(chat);
		resume.cancel(chat);
		vi.advanceTimersByTime(120_000);
		expect(retryTurn).not.toHaveBeenCalled();
		resume.arm(chat);
		chat.engineState = 'streaming';
		vi.advanceTimersByTime(120_000);
		expect(retryTurn).not.toHaveBeenCalled();
	});
});
