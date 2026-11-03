import { describe, expect, it, vi } from 'vitest';
import { catalogRefresher } from './catalogRefresh';

describe('catalogRefresher', () => {
	it('reads at most once a minute unless forced', async () => {
		let now = 1_000_000;
		const refresh = vi.fn(async () => false);
		const r = catalogRefresher({ refresh, now: () => now });
		await r.run();
		await r.run();
		expect(refresh).toHaveBeenCalledTimes(1);
		now += 59_000;
		await r.run();
		expect(refresh).toHaveBeenCalledTimes(1);
		// The app's own reads (launch, Settings closed, sign-in) go through.
		await r.run(true);
		expect(refresh).toHaveBeenCalledTimes(2);
		now += 60_000;
		await r.run();
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	it('shares a read under way', async () => {
		let finish: (changed: boolean) => void = () => {};
		const refresh = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
		const r = catalogRefresher({ refresh });
		const first = r.run();
		const second = r.run(true);
		expect(refresh).toHaveBeenCalledTimes(1);
		finish(true);
		expect(await first).toBe(true);
		expect(await second).toBe(true);
	});

	it('tells only about a change', async () => {
		const onChanged = vi.fn();
		let next = false;
		let now = 0;
		const r = catalogRefresher({ refresh: async () => next, onChanged, now: () => now });
		await r.run();
		expect(onChanged).not.toHaveBeenCalled();
		next = true;
		now += 60_000;
		expect(await r.run()).toBe(true);
		expect(onChanged).toHaveBeenCalledTimes(1);
	});

	it('keeps a failure quiet: logged, no change, the next minute tries again', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let now = 0;
		const refresh = vi.fn(async () => {
			throw new Error('not_signed_in');
		});
		const onChanged = vi.fn();
		const r = catalogRefresher({ refresh, onChanged, now: () => now });
		expect(await r.run()).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(onChanged).not.toHaveBeenCalled();
		await r.run();
		expect(refresh).toHaveBeenCalledTimes(1);
		now += 60_000;
		await r.run();
		expect(refresh).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});
