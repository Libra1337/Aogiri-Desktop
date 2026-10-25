import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { setLocale } from '$lib/i18n';

// No plan in force; nothing reaches the app shell.
vi.mock('$lib/trial.svelte', () => ({ trial: { refreshStatus: async () => {}, plan: null, balanceUntil: null } }));
vi.mock('$lib/protocol', () => ({
	fetchMonoizeLiveUsage: () => new Promise(() => {}),
	readConfig: () => new Promise(() => {})
}));

const user = { id: 'u1', username: 'Ann', role: 'user' };
const props = (balance: Record<string, string>) => ({
	user,
	balance: balance as never,
	onRelogin() {},
	onLogout() {},
	onSquare() {},
	onApiKey() {},
	onUsage() {},
	onInvite() {},
	onDevices() {},
	onPurchase() {}
});
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the account page balance', () => {
	it('shows the total with the gifted part in brackets', async () => {
		setLocale('zh');
		const { default: AccountPage } = await import('./AccountPage.svelte');
		const shown = text(
			render(AccountPage, { props: props({ currency: 'CNY', total_balance: '12.30', granted_balance: '2.30', topped_up_balance: '10.00' }) }).body
		);
		expect(shown).toContain('12.30 CNY（赠 2.30 CNY）');
	});

	it('shows the total alone from a gateway that reports no gifted credit', async () => {
		setLocale('zh');
		const { default: AccountPage } = await import('./AccountPage.svelte');
		const shown = text(
			render(AccountPage, { props: props({ currency: 'CNY', total_balance: '12.30', granted_balance: '0', topped_up_balance: '12.30' }) }).body
		);
		expect(shown).toContain('12.30 CNY');
		expect(shown).not.toContain('（赠');
	});
});
