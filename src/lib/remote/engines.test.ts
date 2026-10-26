import { describe, expect, it } from 'vitest';
import { setLocale } from '$lib/i18n';
import type { AcpBuiltin } from '$lib/protocol';
import { engineKey, listable, pickEngines } from './engines';

const agent = (id: string, extra: Partial<AcpBuiltin> = {}): AcpBuiltin => ({
	id,
	name: id,
	status: 'ready',
	path: `/usr/local/bin/${id}`,
	version: '1.0.0',
	min_version: null,
	below_version: null,
	approvals: true,
	gateway: true,
	install: `npm i -g ${id}`,
	tui: true,
	...extra
});

describe('a phone picks an engine', () => {
	it('lists the native engines, then the built-in agents with why one cannot start', () => {
		setLocale('zh');
		const rows = pickEngines(
			[agent('opencode'), agent('omp', { status: 'missing', path: null }), agent('pi', { approvals: false })],
			true
		);
		expect(rows.map((r) => r.key)).toEqual(['lynshen', 'claude', 'codex', 'acp:opencode', 'acp:omp', 'acp:pi']);
		expect(rows[3]).toMatchObject({ engine: 'acp', agent: 'opencode', disabled: false });
		expect(rows[4]).toMatchObject({ disabled: true, note: '未安装' });
		expect(rows[5]).toMatchObject({ disabled: false, note: '无审批', noApprovals: true });
	});

	it('an agent that never asks needs the phone to be allowed 全自动', () => {
		const rows = pickEngines([agent('pi', { approvals: false })], false, 'needs full auto');
		expect(rows[3]).toMatchObject({ disabled: true, note: 'needs full auto' });
	});

	it('an older daemon offers the native engines only', () => {
		expect(pickEngines([], true).map((r) => r.key)).toEqual(['lynshen', 'claude', 'codex']);
	});

	it('keys an ACP row by its agent', () => {
		expect(engineKey('acp', 'omp')).toBe('acp:omp');
		expect(engineKey('claude')).toBe('claude');
		expect(engineKey(undefined)).toBe('lynshen');
	});

	it("lists a closed ACP session only when it ran a built-in agent", () => {
		expect(listable({ engine: 'acp', open: false, acp_agent: { builtin: true } })).toBe(true);
		expect(listable({ engine: 'acp', open: false, acp_agent: null })).toBe(false);
		expect(listable({ engine: 'acp', open: true })).toBe(true);
		expect(listable({ engine: 'claude' })).toBe(true);
	});
});
