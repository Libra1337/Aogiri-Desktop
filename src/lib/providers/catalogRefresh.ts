// Keeps the gateway's model list current while the app runs (the model
// market changes on the gateway; a signed-in desktop follows without a new
// sign-in): read again when the window gains focus, at most once a minute,
// and on the app's 10-minute timer. Concurrent reads share one request. A
// read that fails, or one made signed out, is logged and otherwise quiet.

export interface CatalogRefresher {
	/** Reads the list unless one was read less than `minInterval` ago
	 *  (`force`: read anyway). Answers whether the list changed. */
	run(force?: boolean): Promise<boolean>;
}

export function catalogRefresher(options: {
	/** Reads the list; answers whether it changed. */
	refresh: () => Promise<boolean>;
	/** After a read that changed the list. */
	onChanged?: () => void;
	minInterval?: number;
	now?: () => number;
}): CatalogRefresher {
	const { refresh, onChanged, minInterval = 60_000, now = Date.now } = options;
	let last = Number.NEGATIVE_INFINITY;
	let pending: Promise<boolean> | null = null;
	return {
		run(force = false) {
			if (pending) return pending;
			if (!force && now() - last < minInterval) return Promise.resolve(false);
			last = now();
			pending = (async () => {
				try {
					const changed = await refresh();
					if (changed) onChanged?.();
					return changed;
				} catch (e) {
					console.warn('Model list refresh failed', e);
					return false;
				} finally {
					pending = null;
				}
			})();
			return pending;
		}
	};
}
