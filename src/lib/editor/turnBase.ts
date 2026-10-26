// A file as it was before a turn edited it, from what it is now and the
// diffs of the turn's edits (the engines' tool cards): each edit undone, the
// last first. The diffs come in two shapes: unified hunks with context
// (LynShen, Codex) and plain "-old / +new" pairs (Claude Code, ACP agents),
// several pairs of a MultiEdit one after another.
import type { Msg } from '$lib/chat.svelte';
import { EDIT_TOOLS } from '$lib/approval';

interface Hunk {
	old: string[];
	new: string[];
}

/** The hunks of one edit's diff, in order. */
export function hunks(diff: string): Hunk[] {
	const out: Hunk[] = [];
	let cur: Hunk | null = null;
	let last = '';
	const lines = diff.split('\n');
	if (lines.at(-1) === '') lines.pop();
	for (const line of lines) {
		if (/^(--- |\+\+\+ |diff |index |new file|deleted file|similarity |rename |\\ )/.test(line)) continue;
		const mark = line[0] ?? ' ';
		// A new hunk: its header, or a removal right after an addition (the
		// next pair of a MultiEdit; unified hunks keep context between).
		if (line.startsWith('@@') || !cur || (mark === '-' && last === '+')) {
			cur = { old: [], new: [] };
			out.push(cur);
			if (line.startsWith('@@')) {
				last = '';
				continue;
			}
		}
		const body = line.slice(1);
		if (mark === '-') cur.old.push(body);
		else if (mark === '+') cur.new.push(body);
		else {
			// Context (an empty line may come without its leading space).
			const text = mark === ' ' ? body : line;
			cur.old.push(text);
			cur.new.push(text);
		}
		last = mark;
	}
	return out.filter((h) => h.old.length || h.new.length);
}

/** `now` with the edits (`diffs`, in the order made) undone; null when one
 *  can't be found in it (changed since, or nothing to find it by). */
export function turnBase(now: string, diffs: readonly string[]): string | null {
	let text = now;
	for (const diff of [...diffs].reverse()) {
		for (const h of hunks(diff).reverse()) {
			const after = h.new.join('\n');
			const before = h.old.join('\n');
			// A removal with no context: nothing left to find its place by.
			if (!after) return null;
			const at = text.indexOf(after);
			if (at < 0) return null;
			text = text.slice(0, at) + before + text.slice(at + after.length);
		}
	}
	return text;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^(a|b)\//, '');
/** Two names of one file: the same, or one a path ending in the other. */
const sameFile = (a: string, b: string) => {
	const x = norm(a);
	const y = norm(b);
	return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
};

/** The part of a unified diff of several files that is `path`'s ('' when
 *  none is), or the whole diff when it names no file. */
function diffOf(diff: string, path: string): string {
	if (!/^--- .*\n\+\+\+ /m.test(diff)) return diff;
	const parts: { path: string; lines: string[] }[] = [];
	let from = '';
	for (const line of diff.split('\n')) {
		if (line.startsWith('--- ')) from = line.slice(4);
		else if (line.startsWith('+++ ')) {
			const to = line.slice(4);
			parts.push({ path: to === '/dev/null' ? from : to, lines: [] });
		} else parts.at(-1)?.lines.push(line);
	}
	return parts.find((p) => sameFile(p.path, path))?.lines.join('\n') ?? '';
}

/** The diffs the turn that `reply` ends made to `path`, in order; null when
 *  one of them is not known (a failed parse, an edit of several files
 *  without a diff per file, a cut output). */
export function turnDiffs(messages: readonly Msg[], reply: Msg, path: string): string[] | null {
	const end = messages.indexOf(reply);
	if (end < 0) return null;
	let start = end;
	while (start > 0 && messages[start - 1]!.kind !== 'user') start--;
	const diffs: string[] = [];
	for (const m of messages.slice(start, end)) {
		if (m.kind !== 'tool' || m.isError || m.subagent || !EDIT_TOOLS.includes(m.name)) continue;
		let out: Record<string, unknown>;
		try {
			out = JSON.parse(m.output) as Record<string, unknown>;
		} catch {
			return null;
		}
		const paths = [out.path, ...(Array.isArray(out.paths) ? out.paths : [])].filter((p): p is string => typeof p === 'string' && !!p);
		if (!paths.some((p) => sameFile(p, path))) continue;
		const diff = str(out.diff);
		if (!diff || diff.includes(' characters not shown) …')) return null;
		const own = paths.length > 1 ? diffOf(diff, path) : diff;
		if (!own) return null;
		diffs.push(own);
	}
	return diffs.length ? diffs : null;
}
