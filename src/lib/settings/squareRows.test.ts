import { describe, expect, it } from 'vitest';
import { squareReason, squareRows } from './squareRows';
import type { MonoizeMarketplaceModel } from '$lib/protocol';

const labels = {
	accountClass: (c: string) => ({ private: '私有', standard: '普通' })[c] ?? c,
	routeGroup: (g: string) => `分组 ${g}`
};
const route = (id: string, name: string, group = '国模') => ({ id, name, group, account_class: 'private' });

describe('squareRows', () => {
	it('lists one row per route, named as the model menu names it', () => {
		const { rows, usable, unavailable } = squareRows(
			[
				// The current gateway: a stale binding leaves Groups empty and a
				// binding error, but the routes are there (a pin routes them).
				{ model_id: 'claude-opus-5-5', groups: [], routing_status: 'channel_selection_required', providers: [route('p-cc', 'Claude 官转', 'Claude'), route('p-cc2', 'Claude 备线', '海外')] },
				{ model_id: 'deepseek-v4.1-flash', groups: ['国模'], routing_status: 'ready', providers: [route('p-ds', '新科研')] }
			],
			labels
		);
		expect(rows.map((r) => [r.model, r.route, r.reason])).toEqual([
			['claude-opus-5-5', '私有 · Claude 官转', undefined],
			['claude-opus-5-5', '私有 · Claude 备线', undefined],
			['deepseek-v4.1-flash', '私有 · 新科研', undefined]
		]);
		expect(new Set(rows.map((r) => r.key)).size).toBe(3);
		expect(usable).toBe(2);
		expect(unavailable).toBe(0);
	});

	it('shows a model without a route once, with the reason, after the usable ones, and does not count it', () => {
		const models: MonoizeMarketplaceModel[] = [
			{ model_id: 'grok-4.6', groups: [], routing_status: 'plan_inactive', providers: [] },
			{ model_id: 'kimi-k3', groups: [], routing_status: 'model_not_in_plan', providers: [] },
			{ model_id: 'gemini-3.5-pro', groups: [], routing_status: 'model_pricing_required', providers: [] },
			{ model_id: 'minimax-m3', groups: [], routing_status: 'unavailable', providers: [] },
			{ model_id: 'glm-5.3', groups: ['国模'], routing_status: 'ready', providers: [route('p-glm', '国模模型组')] },
			{ model_id: 'odd', routing_status: 'channel_selection_required' }
		];
		const { rows, usable, unavailable } = squareRows(models, labels);
		expect(rows.map((r) => [r.model, r.route, r.reason])).toEqual([
			['glm-5.3', '私有 · 国模模型组', undefined],
			['grok-4.6', '', 'planInactive'],
			['kimi-k3', '', 'notInPlan'],
			['gemini-3.5-pro', '', 'unpriced'],
			['minimax-m3', '', 'unavailable'],
			['odd', '', 'unavailable']
		]);
		expect(usable).toBe(1);
		expect(unavailable).toBe(5);
	});

	it('names the Group of a model the gateway routes without a Provider list (Auto, an older gateway)', () => {
		const { rows, usable } = squareRows(
			[
				{ model_id: 'auto', groups: ['国模'], routing_status: 'ready', providers: [] },
				{ model_id: 'gpt-5.5', groups: ['default', '海外'] }
			],
			labels
		);
		expect(rows.map((r) => [r.model, r.route])).toEqual([
			['auto', '分组 国模'],
			['gpt-5.5', '分组 default'],
			['gpt-5.5', '分组 海外']
		]);
		expect(usable).toBe(2);
	});

	it('maps every routing status to a reason', () => {
		expect(squareReason('plan_inactive')).toBe('planInactive');
		expect(squareReason('model_not_in_plan')).toBe('notInPlan');
		expect(squareReason('model_pricing_required')).toBe('unpriced');
		expect(squareReason('pricing')).toBe('unpriced');
		expect(squareReason('channel_selection_required')).toBe('unavailable');
		expect(squareReason(undefined)).toBe('unavailable');
	});
});
