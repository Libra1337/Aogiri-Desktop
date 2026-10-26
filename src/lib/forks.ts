// Forks of a conversation (B09, D15), their worktrees, and what a fork found
// taken back to the conversation it came from.
//
// - Where a conversation can fork (MessageList): the reply that ends each
//   finished turn, with how many user turns a fork from it keeps.
// - 带回结论: what the fork did after the turns it took from the original,
//   for a one-shot model to write up as a message the original goes on from.
//   The user reads it in the original's composer before it is sent.
// - The names of a fork's worktree and branch, and the command a project's
//   setup script runs in a new worktree.
import type { Msg } from './chat.svelte';
import { slugifyTaskName } from './gitops';
import { toolTarget, parseToolOutput } from './toolSummary';

/** The reply that ends each finished turn, and how many user turns a fork
 *  from it keeps (the turn it ends and those before). The turn still running
 *  (`busy`) has none. */
export function forkPoints(messages: readonly Msg[], busy: boolean): Map<Msg, number> {
	const points = new Map<Msg, number>();
	let users = 0;
	let last: Msg | null = null;
	for (const m of messages) {
		if (m.kind === 'user') {
			if (last) points.set(last, users);
			last = null;
			users++;
		} else if (m.kind === 'assistant' && /\S/.test(m.text)) last = m;
	}
	if (last && !busy) points.set(last, users);
	return points;
}

/** The messages a fork keeping `turns` user turns starts with. */
export function forkedMessages(messages: readonly Msg[], turns: number): Msg[] {
	let users = 0;
	const upTo = messages.findIndex((m) => m.kind === 'user' && users++ === turns);
	return messages.slice(0, upTo < 0 ? undefined : upTo);
}

/** Characters of the fork's conversation the model reads (its end). */
const HANDOFF_LIMIT = 16_000;

export const HANDOFF_SYSTEM =
	'You write a handoff message. The user forked a coding-agent conversation to explore something on the side; ' +
	'you are given what happened in the fork after it split off. Write the message the user will send back to the agent ' +
	'of the original conversation so it can build on the fork: one opening sentence saying it comes from a forked ' +
	'exploration, then the conclusions, decisions and changes made (files, commands, open questions) as short bullet ' +
	'points. Report only what the conversation shows. Write in the language the user writes in. Output only the message.';

/** The fork's part of `messages` (after its first `turns` user turns) as
 *  text; `branch`: the worktree branch its changes are on, if any. Empty
 *  when the fork has not gone on yet. */
export function handoffPrompt(messages: readonly Msg[], turns: number, branch?: string): string {
	let users = 0;
	const start = messages.findIndex((m) => m.kind === 'user' && users++ === turns);
	if (start < 0) return '';
	const lines: string[] = [];
	let tools: string[] = [];
	const flush = () => {
		if (tools.length) lines.push(`(Tools: ${tools.join('; ')})`);
		tools = [];
	};
	for (const m of messages.slice(start)) {
		if (m.kind === 'tool' && !m.subagent) {
			const target = toolTarget(m.name, parseToolOutput(m.output));
			tools.push(`${m.name}${target ? ` ${target}` : ''}${m.isError ? ' (failed)' : ''}`);
		} else if (m.kind === 'user' || m.kind === 'assistant') {
			flush();
			if (/\S/.test(m.text)) lines.push(`${m.kind === 'user' ? 'User' : 'Agent'}: ${m.text.trim()}`);
		}
	}
	flush();
	if (!lines.some((l) => l.startsWith('Agent:') || l.startsWith('(Tools'))) return '';
	const text = lines.join('\n\n');
	const body = text.length > HANDOFF_LIMIT ? `…${text.slice(-HANDOFF_LIMIT)}` : text;
	return branch ? `The fork's changes are on git branch ${branch}, in its own worktree.\n\n${body}` : body;
}

/** A fork's worktree: `fork-<title>-<time>` (a valid, unused slug whatever
 *  the title's script) on branch `fork/<title>-<time>`. */
export function forkNames(title: string, now = Date.now()): { slug: string; branch: string } {
	const stem = [slugifyTaskName(title).slice(0, 40), now.toString(36)].filter(Boolean).join('-');
	return { slug: `fork-${stem}`, branch: `fork/${stem}` };
}

/** A new conversation's worktree: named from its first message (else the
 *  time), on branch `task/<slug>` as a parallel task's. */
export function sessionWorktreeNames(message: string, now = Date.now()): { slug: string; branch: string } {
	const named = slugifyTaskName(message.split('\n')[0] ?? '').slice(0, 32).replace(/-+$/, '');
	const slug = `${named || 'task'}-${now.toString(36)}`;
	return { slug, branch: `task/${slug}` };
}

/** A shell string in single quotes (POSIX) or as PowerShell takes it. */
function quoted(text: string, windows: boolean): string {
	return windows ? `'${text.replace(/'/g, "''")}'` : `'${text.replace(/'/g, `'\\''`)}'`;
}

/** The line a project's setup script runs as in a new worktree's terminal:
 *  LYNSHEN_PROJECT_ROOT (the project's folder) and LYNSHEN_WORKTREE_PATH
 *  (the worktree) set first; '' for no script. */
export function setupCommand(script: string, root: string, worktree: string, windows: boolean): string {
	// One line, as a terminal runs it: the lines in order (a trailing \
	// goes on to the next), comments and blank lines left out.
	const lines: string[] = [];
	let carry = '';
	for (const raw of script.split(/\r?\n/)) {
		const line = raw.trim();
		if (!carry && (!line || line.startsWith('#'))) continue;
		if (line.endsWith('\\') && !windows) {
			carry += line.slice(0, -1).trimEnd() + ' ';
			continue;
		}
		lines.push(carry + line);
		carry = '';
	}
	if (carry.trim()) lines.push(carry.trim());
	const body = lines.join('; ');
	if (!body) return '';
	const env = windows
		? `$env:LYNSHEN_PROJECT_ROOT=${quoted(root, true)}; $env:LYNSHEN_WORKTREE_PATH=${quoted(worktree, true)}; `
		: `export LYNSHEN_PROJECT_ROOT=${quoted(root, false)} LYNSHEN_WORKTREE_PATH=${quoted(worktree, false)}; `;
	return env + body;
}
