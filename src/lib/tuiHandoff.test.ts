import { describe, it, expect } from 'vitest';
import { canHandOffToTui, isValidResumeSessionId } from './tuiHandoff';

const SID = '0f3d7a1c-9e2b-4b7e-9d4d-2a1b3c4d5e6f';

describe('isValidResumeSessionId', () => {
	it('accepts uuid-like ids (mirrors rust is_valid_session_id)', () => {
		expect(isValidResumeSessionId(SID)).toBe(true);
		expect(isValidResumeSessionId('abc123')).toBe(true);
		expect(isValidResumeSessionId('a'.repeat(64))).toBe(true);
	});

	it('rejects flag-like, whitespace, unicode and oversized ids', () => {
		for (const bad of [
			'',
			'-x',
			'--resume',
			'a b',
			'../etc/passwd',
			'a_b',
			'ID;rm',
			'会话id',
			'a'.repeat(65)
		]) {
			expect(isValidResumeSessionId(bad), JSON.stringify(bad)).toBe(false);
		}
	});
});

describe('canHandOffToTui', () => {
	it('allows the three native CLIs and never acp', () => {
		expect(canHandOffToTui('lynshen')).toBe(true);
		expect(canHandOffToTui('claude')).toBe(true);
		expect(canHandOffToTui('codex')).toBe(true);
		expect(canHandOffToTui('acp')).toBe(false);
	});

	it('allows a built-in ACP agent and a registered OpenCode once the daemon runs them', () => {
		const omp = { id: 'omp', builtin: true };
		expect(canHandOffToTui('acp', omp, true)).toBe(true);
		expect(canHandOffToTui('acp', { id: 'pi', builtin: true }, true)).toBe(true);
		expect(canHandOffToTui('acp', { id: 'my-opencode', opencode: true }, true)).toBe(true);
		// Another registered agent, an unknown built-in, an older daemon: no.
		expect(canHandOffToTui('acp', { id: 'gemini' }, true)).toBe(false);
		expect(canHandOffToTui('acp', { id: 'goose', builtin: true }, true)).toBe(false);
		expect(canHandOffToTui('acp', omp, false)).toBe(false);
	});
});
