import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./protocol', () => ({ daemon: { request: vi.fn() } }));

import { daemon } from './protocol';
import { engine } from './engineVersion.svelte';
import { loadProfile } from './backendProfile';
import { probeEngine, profileFromEvents } from './engineProbe';

const store = new Map<string, string>();
beforeEach(() => {
	store.clear();
	vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
	vi.mocked(daemon.request).mockReset();
	engine.features = [];
});

const EVENTS = [
	{ type: 'model_status', provider: 'anthropic', model: 'claude-opus-5-5', model_label: 'Opus 5.5', reasoning_effort: 'high', reasoning_efforts: ['low', 'high'], context_window: 200000 },
	{ type: 'model_view', models: [{ model: 'claude-opus-5-5', active: true }], active_effort: 'high' },
	{ type: 'command_list', commands: [{ name: 'compact', description: 'Compact' }] },
	{ type: 'engine_caps', caps: { fork: true } }
];

describe('engineProbe', () => {
	it('makes a draft profile from what the engine said', () => {
		expect(profileFromEvents(EVENTS)).toEqual({
			provider: 'anthropic',
			model: 'claude-opus-5-5',
			modelLabel: 'Opus 5.5',
			effort: 'high',
			efforts: ['low', 'high'],
			contextWindow: 200000,
			catalog: [{ model: 'claude-opus-5-5', active: true }],
			catalogEffort: 'high',
			commands: [{ name: 'compact', description: 'Compact' }]
		});
	});

	it('probes Claude Code once on a daemon that can, and not again while fresh', async () => {
		expect(await probeEngine('claude')).toBe(false);
		expect(daemon.request).not.toHaveBeenCalled();
		engine.features = ['engine_probe'];
		vi.mocked(daemon.request).mockResolvedValue({ type: 'engine_probed', engine: 'claude', events: EVENTS, at: 1, cached: false });
		expect(await probeEngine('claude')).toBe(true);
		expect(daemon.request).toHaveBeenCalledWith({ op: 'engine_probe', engine: 'claude', options: {} });
		expect(loadProfile('claude').model).toBe('claude-opus-5-5');
		expect(await probeEngine('claude')).toBe(false);
		expect(daemon.request).toHaveBeenCalledTimes(1);
		// LynShen and ACP agents are never probed.
		expect(await probeEngine('lynshen')).toBe(false);
		expect(await probeEngine('acp')).toBe(false);
	});

	it('keeps the old profile when the probe fails', async () => {
		engine.features = ['engine_probe'];
		vi.mocked(daemon.request).mockRejectedValue(new Error('claude: not found'));
		expect(await probeEngine('codex')).toBe(false);
		expect(loadProfile('codex')).toEqual({});
	});
});
