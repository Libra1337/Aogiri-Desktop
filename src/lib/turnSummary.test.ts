import { describe, expect, it } from 'vitest';
import type { Msg } from './chat.svelte';
import { artifactKind, turnSummary } from './turnSummary';

const tool = (name: string, output: unknown, extra: Partial<Extract<Msg, { kind: 'tool' }>> = {}): Msg => ({
	kind: 'tool',
	callId: '',
	name,
	output: typeof output === 'string' ? output : JSON.stringify(output),
	running: false,
	isError: false,
	...extra
});

describe('turnSummary', () => {
	it('lists the deliverables, a file presented again in its new place with its new words', () => {
		const s = turnSummary([
			{ kind: 'user', text: 'make the report' },
			tool('present_files', { files: [{ path: '/r/a.html', description: 'Q3 report', size: 20480, kind: 'file' }, { path: '/r/demo.mp4', description: '', size: 5_242_880, kind: 'video' }], missing: ['gone.png'] }),
			tool('present_files', { files: [{ path: '/r/a.html', description: 'Q3 report, final', size: 21000 }] })
		]);
		expect(s?.artifacts.map((a) => [a.path, a.description, a.kind])).toEqual([
			['/r/demo.mp4', '', 'video'],
			['/r/a.html', 'Q3 report, final', 'file']
		]);
	});

	it('takes a file kind from its extension when an older card has none', () => {
		expect(artifactKind('/a/shot.PNG')).toBe('image');
		expect(artifactKind('/a/demo.webm')).toBe('video');
		expect(artifactKind('/a/notes.md')).toBe('file');
		expect(artifactKind('/a/shot.png', 'file')).toBe('file');
	});

	it('keeps a proposal by its id, and only a valid one', () => {
		const s = turnSummary([
			tool('propose_schedule', { id: 'prop-1', name: 'Tests', prompt: 'Run the tests', repeat: 'weekdays', time: '09:00', note: '…' }),
			tool('propose_schedule', { id: 'prop-2', name: 'x', prompt: 'y', repeat: 'sometimes', time: '09:00' }),
			tool('propose_schedule', { id: 'prop-3', name: 'Weekly', prompt: 'z', repeat: 'weekly', time: '18:00', days: [1, 3, 9] })
		]);
		expect(s?.proposals).toEqual([
			{ id: 'prop-1', name: 'Tests', prompt: 'Run the tests', repeat: 'weekdays', time: '09:00' },
			{ id: 'prop-3', name: 'Weekly', prompt: 'z', repeat: 'weekly', time: '18:00', days: [1, 3] }
		]);
	});

	it('lists the conversations started, where a later wait says they are', () => {
		const s = turnSummary([
			tool('start_session', { id: 'm1', session: 's-a', title: '翻译文档', status: 'delivered' }, { args: JSON.stringify({ message: 'go', engine: 'claude' }) }),
			tool('start_session', { id: 'm2', session: 's-b', title: '', status: 'queued' }),
			tool('wait_session', { id: 'm1', session: 's-a', title: '翻译文档', status: 'waiting_approval', note: '…' })
		]);
		expect(s?.children).toEqual([
			{ session: 's-a', title: '翻译文档', engine: 'claude', status: 'waiting_approval' },
			{ session: 's-b', title: '', engine: '', status: 'queued' }
		]);
	});

	it('skips failed and running calls, and a turn with nothing to show', () => {
		expect(turnSummary([tool('present_files', { files: [{ path: '/a' }] }, { isError: true }), tool('start_session', { session: 's' }, { running: true }), tool('bash', '{}')])).toBeNull();
		expect(turnSummary([tool('present_files', 'not json')])).toBeNull();
	});
});
