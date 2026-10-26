import { describe, expect, it } from 'vitest';
import type { Msg } from '$lib/chat.svelte';
import { hunks, turnBase, turnDiffs } from './turnBase';

describe('turnBase', () => {
	it('undoes Claude-style pairs, a MultiEdit and edits in order', () => {
		const before = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
		// Edit 1 (MultiEdit): a → 10, c → 30. Edit 2: 10 → 100.
		const multi = '-const a = 1;\n+const a = 10;\n-const c = 3;\n+const c = 30;';
		const second = '-const a = 10;\n+const a = 100;';
		expect(hunks(multi)).toHaveLength(2);
		const now = 'const a = 100;\nconst b = 2;\nconst c = 30;\n';
		expect(turnBase(now, [multi, second])).toBe(before);
	});

	it('undoes unified hunks with context', () => {
		const diff = ['--- a/x.ts', '+++ b/x.ts', '@@ -1,3 +1,3 @@', ' one', '-two', '+TWO', ' three', '@@ -9,2 +9,3 @@', ' nine', '+nine and a half', ' ten'].join('\n');
		const now = 'one\nTWO\nthree\n4\n5\n6\n7\n8\nnine\nnine and a half\nten\n';
		expect(turnBase(now, [diff])).toBe('one\ntwo\nthree\n4\n5\n6\n7\n8\nnine\nten\n');
	});

	it('takes a file written whole as new', () => {
		expect(turnBase('hello\nworld\n', ['+hello\n+world\n+'])).toBe('');
	});

	it('gives up when an edit is no longer there', () => {
		expect(turnBase('changed since\n', ['-old\n+new'])).toBeNull();
		// A removal with nothing around it can't be placed.
		expect(turnBase('a\n', ['-gone'])).toBeNull();
	});
});

describe('turnDiffs', () => {
	const tool = (name: string, output: unknown, extra: Partial<Extract<Msg, { kind: 'tool' }>> = {}): Msg =>
		({ kind: 'tool', name, output: JSON.stringify(output), running: false, isError: false, ...extra }) as Msg;
	const user = (text: string): Msg => ({ kind: 'user', text }) as Msg;
	const reply = (text: string): Msg => ({ kind: 'assistant', text }) as Msg;

	it('takes the edits of one turn to one file, its part of a diff of several', () => {
		const end = reply('done');
		const several = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-a', '+A', '--- a/src/b.ts', '+++ b/src/b.ts', '@@ -1 +1 @@', '-b', '+B'].join('\n');
		const messages = [
			user('one'),
			tool('edit', { path: '/p/src/a.ts', diff: '-x\n+y' }),
			reply('earlier'),
			user('two'),
			tool('edit', { path: '/p/src/a.ts', diff: '-y\n+z' }),
			tool('edit', { path: '/p/src/c.ts', diff: '-c\n+C' }),
			tool('apply_patch', { paths: ['src/a.ts', 'src/b.ts'], diff: several }),
			tool('edit', { path: '/p/src/a.ts', diff: '-q\n+r' }, { isError: true }),
			end
		];
		expect(turnDiffs(messages, end, '/p/src/a.ts')).toEqual(['-y\n+z', ['@@ -1 +1 @@', '-a', '+A'].join('\n')]);
		expect(turnDiffs(messages, end, '/p/src/b.ts')).toEqual([['@@ -1 +1 @@', '-b', '+B'].join('\n')]);
		expect(turnDiffs(messages, end, '/p/src/d.ts')).toBeNull();
	});

	it('knows nothing of an edit whose diff was cut or is missing', () => {
		const end = reply('done');
		expect(turnDiffs([user('x'), tool('write', { path: '/p/a.ts' }), end], end, '/p/a.ts')).toBeNull();
		const cut = `-a\n… (100 characters not shown) …\n+b`;
		expect(turnDiffs([user('x'), tool('edit', { path: '/p/a.ts', diff: cut }), end], end, '/p/a.ts')).toBeNull();
	});
});
