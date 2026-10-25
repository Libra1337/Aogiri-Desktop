import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('proposals', () => {
	let store: Record<string, string>;
	beforeEach(() => {
		store = {};
		vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) });
		vi.resetModules();
	});

	it('is created once a task carries its id, whatever this device chose', async () => {
		const { proposals } = await import('./proposals.svelte');
		expect(proposals.state('prop-1', [])).toBeNull();
		expect(proposals.state('prop-1', [{ origin: null }, { origin: 'prop-1' }])).toBe('created');
		proposals.set('prop-2', 'declined');
		expect(proposals.state('prop-2', [])).toBe('declined');
		expect(proposals.state('prop-2', [{ origin: 'prop-2' }])).toBe('created');
	});

	it('keeps the choice made here for a daemon whose tasks carry no origin', async () => {
		const first = await import('./proposals.svelte');
		first.proposals.set('prop-9', 'created');
		vi.resetModules();
		const again = await import('./proposals.svelte');
		expect(again.proposals.state('prop-9', [{}])).toBe('created');
	});
});
