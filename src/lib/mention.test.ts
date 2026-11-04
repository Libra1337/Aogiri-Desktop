import { describe, it, expect } from 'vitest';
import { buildEntries, fuzzyScore, fuzzyPositions, mentionMatches, mentionRoot, MentionFiles } from './mention';

const FILES = [
	'src/lib/Composer.svelte',
	'src/lib/ui/Button.svelte',
	'src/routes/+page.svelte',
	'README.md',
	'src/lib/chat.svelte.ts'
];

describe('buildEntries', () => {
	it('derives every parent folder, deduped', () => {
		const entries = buildEntries(FILES);
		const dirs = entries.filter((e) => e.dir).map((e) => e.path).sort();
		expect(dirs).toEqual(['src', 'src/lib', 'src/lib/ui', 'src/routes']);
		expect(entries.filter((e) => !e.dir)).toHaveLength(FILES.length);
	});

	it('handles an empty list', () => {
		expect(buildEntries([])).toEqual([]);
	});
});

describe('fuzzyScore', () => {
	it('returns 0 when the query is not a subsequence', () => {
		expect(fuzzyScore('button.svelte', 'xyz')).toBe(0);
	});
	it('scores boundary + consecutive matches higher', () => {
		// "button" hits the basename start (boundary) and runs consecutively
		expect(fuzzyScore('src/ui/button.ts', 'button')).toBeGreaterThan(
			fuzzyScore('abuttonx.ts', 'button')
		);
	});
});

describe('fuzzyPositions', () => {
	it('returns the matched indices', () => {
		// b=0, t=2 (first t), n=5 in "button.svelte"
		expect(fuzzyPositions('Button.svelte', 'btn')).toEqual([0, 2, 5]);
	});
	it('is case-insensitive', () => {
		expect(fuzzyPositions('Composer', 'cmp')).toEqual([0, 2, 3]);
	});
	it('returns null when not a subsequence', () => {
		expect(fuzzyPositions('abc', 'xyz')).toBeNull();
	});
	it('returns [] for an empty query', () => {
		expect(fuzzyPositions('abc', '')).toEqual([]);
	});
});

describe('mentionMatches', () => {
	const entries = buildEntries(FILES);

	it('empty query lists root entries, folders first', () => {
		const r = mentionMatches(entries, '');
		expect(r[0]).toEqual({ path: 'src', dir: true });
		expect(r.map((e) => e.path)).toContain('README.md');
		// nothing nested
		expect(r.every((e) => !e.path.includes('/'))).toBe(true);
	});

	it('ranks a basename match to the top', () => {
		expect(mentionMatches(entries, 'comp')[0].path).toBe('src/lib/Composer.svelte');
	});

	it('finds a file deep in a subfolder', () => {
		expect(mentionMatches(entries, 'button')[0].path).toBe('src/lib/ui/Button.svelte');
	});

	it('drills into a folder on trailing slash (direct children only)', () => {
		const r = mentionMatches(entries, 'src/lib/');
		// folder first, then files by localeCompare ('chat…' < 'Composer…')
		expect(r.map((e) => e.path)).toEqual([
			'src/lib/ui',
			'src/lib/chat.svelte.ts',
			'src/lib/Composer.svelte'
		]);
		expect(r.every((e) => !e.path.slice('src/lib/'.length).includes('/'))).toBe(true);
	});

	it('respects the result limit (top-K)', () => {
		const many = buildEntries(Array.from({ length: 500 }, (_, i) => `dir/file${i}.ts`));
		expect(mentionMatches(many, 'file', 10)).toHaveLength(10);
	});

	it('is case-insensitive', () => {
		expect(mentionMatches(entries, 'COMPOSER')[0].path).toBe('src/lib/Composer.svelte');
	});
});

// Ticket #75: a new conversation in a project (a draft: no engine, so no cwd
// yet) showed an empty @ menu; Windows lists paths with backslashes.
describe('mentionRoot', () => {
	it('uses the project folder before the engine reports its directory', () => {
		expect(mentionRoot('', { path: 'C:\\Users\\me\\proj' })).toBe('C:\\Users\\me\\proj');
	});
	it("prefers the engine's directory once it is known", () => {
		expect(mentionRoot('/repo/.lynshen-worktrees/repo/task', { path: '/repo' })).toBe('/repo/.lynshen-worktrees/repo/task');
	});
	it('lists nothing for a conversation whose folder is not made yet', () => {
		expect(mentionRoot('', { path: '/Users/me/Documents/LynShen', newFolder: true })).toBe('');
		expect(mentionRoot('', undefined)).toBe('');
	});
});

describe('MentionFiles', () => {
	const flush = () => new Promise((r) => setTimeout(r, 0));

	it('loads the project of a draft conversation the first time @ is typed', async () => {
		const asked: string[] = [];
		let shown: string[] = ['stale'];
		const files = new MentionFiles(
			async (root) => (asked.push(root), ['README.md', 'src\\lib\\a.ts']),
			(f) => (shown = f)
		);
		files.open(mentionRoot('', { path: 'C:\\proj' }));
		await flush();
		expect(asked).toEqual(['C:\\proj']);
		// Backslashes become '/', so folders are derived and drill-down works.
		expect(shown).toEqual(['README.md', 'src/lib/a.ts']);
		expect(mentionMatches(buildEntries(shown), '').map((e) => e.path)).toEqual(['src', 'README.md']);
		expect(mentionMatches(buildEntries(shown), 'src/lib/').map((e) => e.path)).toEqual(['src/lib/a.ts']);
		// The same folder again: no second walk.
		files.open('C:\\proj');
		expect(asked).toHaveLength(1);
	});

	it('reloads when the folder changes and drops a late answer for the old one', async () => {
		const pending: Record<string, (f: string[]) => void> = {};
		let shown: string[] = [];
		const files = new MentionFiles(
			(root) => new Promise((resolve) => (pending[root] = resolve)),
			(f) => (shown = f)
		);
		files.open('/a');
		files.open('/b');
		pending['/b']!(['b.ts']);
		pending['/a']!(['a.ts']);
		await flush();
		expect(shown).toEqual(['b.ts']);
	});

	it("never walks the app's own directory for an unknown folder", () => {
		const asked: string[] = [];
		const files = new MentionFiles(async (root) => (asked.push(root), []), () => {});
		files.open('');
		expect(asked).toEqual([]);
	});
});
