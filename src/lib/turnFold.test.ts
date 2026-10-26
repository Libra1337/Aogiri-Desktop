import { describe, expect, it } from 'vitest';
import type { Msg, TurnStats } from './chat.svelte';
import { turnFolds } from './turnFold';
import { markStopped } from './recap';

const stats = (elapsed: number, files = 0, added = 0, removed = 0): TurnStats => ({
	elapsed,
	inTokens: 0,
	outTokens: 0,
	files,
	added,
	removed,
	tools: 0,
	cost: 0,
	model: '',
	segments: 1
});
const user = (text: string): Msg => ({ kind: 'user', text });
const reply = (text: string, turn?: TurnStats): Msg => ({ kind: 'assistant', text, ...(turn ? { turn } : {}) });
const think = (text: string): Msg => ({ kind: 'reasoning', text, collapsed: true });
const tool = (name: string, extra: Partial<Extract<Msg, { kind: 'tool' }>> = {}): Msg => ({ kind: 'tool', callId: '', name, output: '{}', running: false, isError: false, ...extra });
const all = () => true;

describe('turnFolds', () => {
	it('folds the work of a finished turn, keeps the final reply and says what it changed', () => {
		const q = user('fix it');
		const work = [think('look'), tool('read'), reply('found it'), tool('str_replace'), tool('bash')];
		const answer = reply('done', stats(4200, 2, 42, 7));
		const [fold] = turnFolds([q, ...work, answer], all, false);
		expect(fold).toMatchObject({ key: q, elapsed: 4200, calls: 3, files: 2, added: 42, removed: 7 });
		expect(fold!.members).toEqual(work);
	});

	it('leaves the running turn, and a turn without tools or thinking, alone', () => {
		const msgs = [user('hi'), reply('hello', stats(10)), user('go'), tool('bash'), reply('ok')];
		expect(turnFolds(msgs, all, true)).toEqual([]);
		expect(turnFolds(msgs, all, false).map((f) => f.key)).toEqual([msgs[2]]);
	});

	it('folds what a running turn finished before, and leaves what runs now open', () => {
		const q = user('go');
		const work = [tool('bash'), think('so')];
		const after = [tool('read'), reply('the task finished')];
		const [fold] = turnFolds([q, ...work, reply('started it', stats(900)), ...after], all, true);
		expect(fold!.members).toEqual(work);
		expect(fold!.elapsed).toBe(900);
	});

	it('keeps plans in view, and folds a turn that ended without a reply', () => {
		const plan: Msg = { kind: 'plan', id: 'p', title: 't', text: '', status: 'pending' };
		const [fold] = turnFolds([user('go'), tool('bash'), plan, tool('read')], all, false);
		expect(fold!.members.map((m) => m.kind)).toEqual(['tool', 'tool']);
		expect(fold!.elapsed).toBeNull();
	});

	it('leaves a turn that failed, was stopped or was cut short unfolded', () => {
		expect(turnFolds([user('go'), tool('bash'), { kind: 'error', text: 'boom' }], all, false)).toEqual([]);
		expect(turnFolds([user('go'), tool('bash', { cut: true }), reply('half', stats(5))], all, false)).toEqual([]);
		const stoppedTurn = [user('go'), tool('bash'), reply('half', stats(5))];
		markStopped(stoppedTurn);
		expect(turnFolds(stoppedTurn, all, false)).toEqual([]);
	});

	it('counts subagent deliveries as part of the turn, not a new one', () => {
		const delivery = user('[message from agent helper · a1]\nall done');
		const folds = turnFolds([user('go'), tool('bash'), delivery, reply('done', stats(3))], all, false);
		expect(folds).toHaveLength(1);
	});

	it('skips rows that show nothing', () => {
		const empty = reply('');
		const shows = (m: Msg) => m !== empty;
		const [fold] = turnFolds([user('go'), tool('bash'), empty, reply('done', stats(3))], shows, false);
		expect(fold!.members).toHaveLength(1);
	});

	it('leaves a turn the reader stopped open, and keeps the steps after the reply out of the fold', () => {
		const stoppedTurn = [user('go'), tool('bash'), reply('half', stats(900)), { kind: 'system', text: '', flow: { type: 'interrupted' } } as Msg];
		expect(turnFolds(stoppedTurn, all, false)).toEqual([]);
		const done = { kind: 'system', text: 'npm run dev 已完成', flow: { type: 'task' } } as Msg;
		const [fold] = turnFolds([user('go'), tool('bash'), reply('done', stats(900)), done], all, false);
		expect(fold!.members).toEqual([stoppedTurn[1]]);
	});
});
