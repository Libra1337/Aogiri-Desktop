import { describe, expect, it } from 'vitest';
import { CAPS } from '$lib/backends';
import { dropPlace, moved, queueActions, queueOp, stepPlace } from './queue';

describe('queueActions', () => {
	it('offers every row action on a daemon with the queue feature', () => {
		for (const id of ['lynshen', 'claude', 'codex'] as const)
			expect(queueActions(id, CAPS[id], true)).toEqual({ join: true, interrupt: true, takeBack: true, drop: true, move: true, steerFirst: false, keys: true });
		// An ACP agent cannot take a message into a running turn.
		expect(queueActions('acp', CAPS.acp, true)).toMatchObject({ join: false, interrupt: true, takeBack: true, keys: true });
	});

	it('keeps what a daemon without features took: steer the first, take back from 0.4.27', () => {
		expect(queueActions('lynshen', CAPS.lynshen, false, true)).toEqual({ join: false, interrupt: false, takeBack: true, drop: false, move: false, steerFirst: true, keys: false });
		expect(queueActions('lynshen', CAPS.lynshen, false, false)).toMatchObject({ takeBack: false, steerFirst: true });
		// Claude Code ran mid-turn messages as the next turn: nothing to pick.
		expect(queueActions('claude', CAPS.claude, false, true)).toEqual({ join: false, interrupt: false, takeBack: false, drop: false, move: false, steerFirst: false, keys: false });
		expect(queueActions('acp', CAPS.acp, false, true)).toMatchObject({ steerFirst: false, takeBack: false });
	});
});

describe('queueOp', () => {
	const q = ['use staging', 'then deploy', 'and tell me'];
	it('picks a message by its place and its text', () => {
		expect(queueOp({ kind: 'steer', index: 1 }, q)).toEqual({ op: 'steer', index: 1, text: 'then deploy' });
		expect(queueOp({ kind: 'interrupt', index: 2 }, q)).toEqual({ op: 'interrupt', index: 2, text: 'and tell me' });
		expect(queueOp({ kind: 'unqueue', index: 0 }, q)).toEqual({ op: 'unqueue', index: 0, text: 'use staging' });
		expect(queueOp({ kind: 'discard', index: 0 }, q)).toEqual({ op: 'unqueue', index: 0, text: 'use staging', discard: true });
		expect(queueOp({ kind: 'move', index: 2, to: 0 }, q)).toEqual({ op: 'queue_move', index: 2, to: 0, text: 'and tell me' });
	});
	it('counts a negative place from the last (the message just sent)', () => {
		expect(queueOp({ kind: 'steer', index: -1 }, q)).toEqual({ op: 'steer', index: -1, text: 'and tell me' });
		expect(queueOp({ kind: 'steer', index: 5 }, q)).toEqual({ op: 'steer', index: 5 });
	});
});

describe('moving rows', () => {
	it('moves one message to another place', () => {
		expect(moved(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
		expect(moved(['a', 'b', 'c'], 0, 9)).toEqual(['a', 'b', 'c']);
	});
	it('drops a dragged row among the others, never above the fixed ones', () => {
		const centres = [10, 40, 70, 100];
		expect(dropPlace(centres, 3, 5, 0)).toBe(0);
		expect(dropPlace(centres, 3, 5, 1)).toBe(1);
		expect(dropPlace(centres, 0, 85, 0)).toBe(2);
		expect(dropPlace(centres, 0, 500, 0)).toBe(3);
	});
	it('steps a row with ↑ ↓ within the movable ones', () => {
		expect(stepPlace(2, -1, 4, 1)).toBe(1);
		expect(stepPlace(1, -1, 4, 1)).toBeNull();
		expect(stepPlace(3, 1, 4, 0)).toBeNull();
		expect(stepPlace(0, 1, 4, 0)).toBe(1);
	});
});
