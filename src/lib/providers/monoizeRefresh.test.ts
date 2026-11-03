import { beforeEach, describe, expect, it, vi } from 'vitest';

// refreshMonoizeCatalog against a stand-in gateway and config.json: what it
// writes, and whether it reports a change (running sessions then reload).
const state = vi.hoisted(() => ({
	list: [] as unknown[],
	config: {} as Record<string, unknown>,
	writes: [] as Record<string, unknown>[]
}));

vi.mock('$lib/protocol', () => ({
	fetchMonoizeModels: vi.fn(async () => state.list),
	readConfig: vi.fn(async () => state.config),
	writeConfig: vi.fn(async (patch: Record<string, unknown>) => {
		state.writes.push(patch);
		state.config = { ...state.config, ...patch };
	})
}));
vi.mock('$lib/models/catalogStore.svelte', () => ({ gatewayCatalog: { refresh: async () => null } }));

const { refreshMonoizeCatalog } = await import('./monoize');

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (k: string) => storage.get(k) ?? null,
	setItem: (k: string, v: string) => void storage.set(k, v),
	removeItem: (k: string) => void storage.delete(k)
});
const route = (id: string) => ({ id, name: id, group: '国模', account_class: 'private' });
const stored = () => JSON.parse(storage.get('lynshen-custom-providers') ?? '[]').find((p: { id: string }) => p.id === 'monoize');

beforeEach(() => {
	storage.clear();
	state.writes = [];
	state.config = { provider: 'monoize', model: 'glm-5.3' };
	state.list = [{ id: 'glm-5.3', routing_status: 'ready', providers: [route('p-glm')] }];
});

describe('refreshMonoizeCatalog', () => {
	it('reports a change the first time, and nothing (no write) when the gateway says the same again', async () => {
		expect(await refreshMonoizeCatalog()).toBe(true);
		expect(state.writes.length).toBe(1);
		expect(await refreshMonoizeCatalog()).toBe(false);
		expect(state.writes.length).toBe(1);
	});

	it('reports a model put on sale, and a route added', async () => {
		await refreshMonoizeCatalog();
		state.list = [...state.list, { id: 'kimi-k3', routing_status: 'ready', providers: [route('p-kimi')] }];
		expect(await refreshMonoizeCatalog()).toBe(true);
		expect(stored().models.map((m: { name: string }) => m.name)).toEqual(['glm-5.3', 'kimi-k3']);
		state.list = [state.list[0], { id: 'kimi-k3', routing_status: 'ready', providers: [route('p-kimi'), route('p-kimi2')] }];
		expect(await refreshMonoizeCatalog()).toBe(true);
		expect(stored().models[1].routes.map((r: { id: string }) => r.id)).toEqual(['p-kimi', 'p-kimi2']);
	});

	it('leaves everything as it is on an empty answer (a gateway hiccup)', async () => {
		await refreshMonoizeCatalog();
		const before = { config: state.config, list: stored() };
		state.list = [];
		expect(await refreshMonoizeCatalog()).toBe(false);
		expect(state.config).toEqual(before.config);
		expect(stored()).toEqual(before.list);
	});

	it('keeps the route the user chose while its model is briefly unroutable', async () => {
		state.config = { ...state.config, model: 'kimi-k3', monoize_providers: { 'kimi-k3': 'p-kimi2' } };
		state.list = [state.list[0], { id: 'kimi-k3', routing_status: 'channel_selection_required', providers: [route('p-kimi'), route('p-kimi2')] }];
		await refreshMonoizeCatalog();
		expect(state.config.monoize_providers).toEqual({ 'kimi-k3': 'p-kimi2' });
		expect(state.config.model).toBe('kimi-k3');
	});
});
