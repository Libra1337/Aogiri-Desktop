import { describe, expect, it } from 'vitest';
import { diffStat, editedPaths, isEdit, runTime, toolFailed, toolKind, toolTarget, toolVerb } from './toolSummary';

describe('tool summaries', () => {
	it('counts the lines of an edit from its diff, or the counts a streaming edit reports', () => {
		expect(diffStat({ diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n+more' })).toEqual({ add: 2, del: 1 });
		// Claude Code's long Write while its input streams (B01 C04).
		expect(diffStat({ path: '/a/b.rs', paths: ['/a/b.rs'], add: 3, del: 0 })).toEqual({ add: 3, del: 0 });
		expect(diffStat({ path: '/a/b.rs' })).toBeNull();
		expect(diffStat(null)).toBeNull();
	});

	it('names the files an edit touched once each', () => {
		expect(editedPaths({ path: '/a.ts', paths: ['/a.ts', '/b.ts'] })).toEqual(['/a.ts', '/b.ts']);
		expect(editedPaths({ path: '' })).toEqual([]);
	});

	it('knows what a call does, by its name or an ACP card kind', () => {
		expect(toolKind('bash', null)).toBe('command');
		expect(toolKind('edit', null)).toBe('edit');
		expect(isEdit('str_replace', null)).toBe(true);
		expect(isEdit('Edit a.rs', { kind: 'edit' })).toBe(true);
		expect(toolKind('Read a.rs', { kind: 'read' })).toBe('read');
		expect(toolKind('mcp__x__y', null)).toBe('other');
	});

	it('takes a failure from the engine or from the output', () => {
		expect(toolFailed({ isError: true, output: '{}' })).toBe(true);
		expect(toolFailed({ isError: false, output: '{"error":"no such file"}' })).toBe(true);
		expect(toolFailed({ isError: false, output: '{"ok":true}' })).toBe(false);
	});

	it('times a run as the union of its calls, side by side once, the gaps not at all', () => {
		const call = (startedAt: number | undefined, endedAt?: number, running = false) => ({ startedAt, endedAt, running });
		expect(runTime([call(1000, 3000), call(2000, 4000)], 0)).toBe(3000);
		expect(runTime([call(1000, 2000), call(5000, 6000)], 0)).toBe(2000);
		// A call still running counts to now.
		expect(runTime([call(1000, 2000), call(3000, undefined, true)], 3500)).toBe(1500);
		// Replayed calls have no times.
		expect(runTime([call(undefined), call(undefined)], 0)).toBeNull();
	});

	it('says what the app tools and the session tools did', () => {
		expect(toolTarget('start_session', { session: 's1', title: '翻译文档', status: 'delivered' })).toBe('翻译文档');
		expect(toolTarget('wait_session', { session: 's1', status: 'running' })).toBe('s1');
		expect(toolVerb('present_files')).not.toBe('present_files');
		expect(toolVerb('propose_schedule')).not.toBe('propose_schedule');
	});
});
