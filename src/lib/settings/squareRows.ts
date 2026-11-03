// 模型广场's rows (Settings → 账户): one per route the key may pick for a
// model, named as the model picker names it (composer/modelRows.ts,
// DA-8b: "私有 · 新科研"), and one for a model with no route, saying why.
// A model with no route is not counted as a model.

import type { MonoizeMarketplaceModel } from '$lib/protocol';
import { routeLineOf } from '$lib/composer/modelRows';

/** Why the key cannot use a model the gateway lists without a route. */
export type SquareReason = 'planInactive' | 'notInPlan' | 'unpriced' | 'unavailable';

export interface SquareRow {
	key: string;
	/** The request id. */
	model: string;
	/** The route as the picker's second line names it; empty for a model without one. */
	route: string;
	/** Set for a model without a route. */
	reason?: SquareReason;
	/** The gateway's row (its window and prices). */
	entry: MonoizeMarketplaceModel;
}

export interface SquareLabels {
	/** "私有" for `private`. */
	accountClass?: (accountClass: string) => string;
	/** "分组 {group}": a model the gateway routes by Group only (Auto, an older gateway). */
	routeGroup?: (group: string) => string;
}

/** The reason for the gateway's `routing_status` of a model without a route. */
export function squareReason(status: string | undefined): SquareReason {
	if (status === 'plan_inactive') return 'planInactive';
	if (status === 'model_not_in_plan') return 'notInPlan';
	if (status && /pric/.test(status)) return 'unpriced';
	return 'unavailable';
}

/** The rows, models with a route first (in the gateway's order), and how
 *  many models have a route and how many have none. */
export function squareRows(
	models: MonoizeMarketplaceModel[],
	labels: SquareLabels = {}
): { rows: SquareRow[]; usable: number; unavailable: number } {
	const routed: SquareRow[] = [];
	const unrouted: SquareRow[] = [];
	for (const entry of models) {
		const model = entry.model_id;
		const providers = entry.providers ?? [];
		const groups = entry.groups ?? [];
		if (providers.length) {
			for (const p of providers)
				routed.push({ key: `${model}::${p.id}`, model, route: routeLineOf(p, labels), entry });
			continue;
		}
		// No Provider list but Groups that route it: Auto (the gateway picks
		// its target per request), or a gateway before DA-8a.
		if (groups.length && (!entry.routing_status || entry.routing_status === 'ready')) {
			for (const g of groups)
				routed.push({ key: `${model}@${g}`, model, route: labels.routeGroup ? labels.routeGroup(g) : g, entry });
			continue;
		}
		unrouted.push({ key: `${model}::`, model, route: '', reason: squareReason(entry.routing_status), entry });
	}
	return {
		rows: [...routed, ...unrouted],
		usable: new Set(routed.map((r) => r.model)).size,
		unavailable: unrouted.length
	};
}
