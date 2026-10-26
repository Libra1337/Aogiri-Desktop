import { describe, expect, it } from 'vitest';
import type { Msg } from './chat.svelte';
import { forkNames, forkPoints, forkedMessages, handoffPrompt, sessionWorktreeNames, setupCommand } from './forks';

const user = (text: string): Msg => ({ kind: 'user', text });
const reply = (text: string): Msg => ({ kind: 'assistant', text });
const tool = (name: string, output: unknown, isError = false): Msg => ({ kind: 'tool', callId: name, name, output: JSON.stringify(output), running: false, isError });

describe('forkPoints', () => {
	it('marks the reply that ends each finished turn with the turns a fork keeps', () => {
		const a = reply('first answer');
		const b1 = reply('looking');
		const b2 = reply('second answer');
		const c = reply('third, still going');
		const messages = [user('one'), a, user('two'), b1, tool('read', { path: '/a' }), b2, user('three'), c];
		const busy = forkPoints(messages, true);
		expect([...busy.entries()]).toEqual([
			[a, 1],
			[b2, 2]
		]);
		expect(forkPoints(messages, false).get(c)).toBe(3);
		// A turn with no text reply has no point.
		expect(forkPoints([user('one'), tool('bash', {}), user('two'), reply('x')], false).size).toBe(1);
	});

	it('keeps the messages of the turns a fork takes', () => {
		const messages = [user('one'), reply('a'), user('two'), reply('b'), user('three')];
		expect(forkedMessages(messages, 2)).toEqual(messages.slice(0, 4));
		expect(forkedMessages(messages, 9)).toEqual(messages);
	});
});

describe('handoffPrompt', () => {
	it('is what the fork did after the turns it took, with its branch', () => {
		const messages = [user('one'), reply('a'), user('try the other cache'), tool('edit', { path: '/p/src/cache.ts' }), tool('bash', { command: 'pnpm test' }, true), reply('It works with an LRU of 64.')];
		const prompt = handoffPrompt(messages, 1, 'fork/cache-x');
		expect(prompt).toBe(
			"The fork's changes are on git branch fork/cache-x, in its own worktree.\n\nUser: try the other cache\n\n(Tools: edit cache.ts; bash pnpm test (failed))\n\nAgent: It works with an LRU of 64."
		);
		expect(handoffPrompt(messages, 1)).not.toContain('git branch');
	});

	it('is empty while the fork has not gone on', () => {
		expect(handoffPrompt([user('one'), reply('a')], 1)).toBe('');
		expect(handoffPrompt([user('one'), reply('a'), user('and?')], 1)).toBe('');
	});
});

describe('worktree names', () => {
	it('names a fork from its title and a session from its first message', () => {
		expect(forkNames('Fix the cache', 36 ** 3)).toEqual({ slug: 'fork-fix-the-cache-1000', branch: 'fork/fix-the-cache-1000' });
		expect(forkNames('修缓存', 36 ** 3)).toEqual({ slug: 'fork-1000', branch: 'fork/1000' });
		expect(sessionWorktreeNames('Add dark mode\nand more', 36 ** 3)).toEqual({ slug: 'add-dark-mode-1000', branch: 'task/add-dark-mode-1000' });
		expect(sessionWorktreeNames('加个暗色主题', 36 ** 3).slug).toBe('task-1000');
	});
});

describe('setupCommand', () => {
	it('sets the two folders first, quoted for the shell', () => {
		expect(setupCommand(' pnpm install ', "/Users/me/it's", '/w/t', false)).toBe(
			"export LYNSHEN_PROJECT_ROOT='/Users/me/it'\\''s' LYNSHEN_WORKTREE_PATH='/w/t'; pnpm install"
		);
		expect(setupCommand('pnpm install', "C:\\it's", 'C:\\w', true)).toBe(
			"$env:LYNSHEN_PROJECT_ROOT='C:\\it''s'; $env:LYNSHEN_WORKTREE_PATH='C:\\w'; pnpm install"
		);
		expect(setupCommand('  ', '/a', '/b', false)).toBe('');
		expect(setupCommand('# deps\npnpm install \\\n  --frozen-lockfile\n\ncp "$LYNSHEN_PROJECT_ROOT/.env" .', '/a', '/b', false)).toBe(
			`export LYNSHEN_PROJECT_ROOT='/a' LYNSHEN_WORKTREE_PATH='/b'; pnpm install --frozen-lockfile; cp "$LYNSHEN_PROJECT_ROOT/.env" .`
		);
	});
});
