import { describe, expect, it } from 'vitest';
import { setLocale } from '$lib/i18n';
import { balanceWithBonusText, fmtBalance, shownBalance } from './money';

describe('fmtBalance', () => {
	it('cuts to two decimals', () => {
		expect(fmtBalance('123.456789')).toBe('123.45');
		expect(fmtBalance('0.29')).toBe('0.29');
		expect(fmtBalance('9.999')).toBe('9.99');
	});
	it('pads whole and short amounts', () => {
		expect(fmtBalance('100')).toBe('100.00');
		expect(fmtBalance('0.5')).toBe('0.50');
		expect(fmtBalance(undefined)).toBe('0.00');
	});
	it('keeps the sign only when something is left', () => {
		expect(fmtBalance('-3.141')).toBe('-3.14');
		expect(fmtBalance('-0.001')).toBe('0.00');
	});
});

describe('shownBalance', () => {
	it('converts a USD balance to CNY at the gateway rate, cut to two decimals', () => {
		expect(shownBalance('847.527218889', 'USD', 'CNY')).toEqual({ amount: '5695.38', currency: 'CNY' });
		expect(shownBalance('847.527218889', 'USD', 'USD')).toEqual({ amount: '847.52', currency: 'USD' });
	});

	it('leaves another currency, and an unreadable amount, as reported', () => {
		expect(shownBalance('12.5', 'CNY', 'USD')).toEqual({ amount: '12.50', currency: 'CNY' });
		expect(shownBalance('n/a', 'USD', 'CNY')).toEqual({ amount: 'n/a', currency: 'USD' });
	});
});

describe('balanceWithBonusText', () => {
	it('shows the total with the gifted part in brackets', () => {
		setLocale('zh');
		const info = { currency: 'USD', total_balance: '2.5', granted_balance: '0.75', topped_up_balance: '1.75' };
		expect(balanceWithBonusText(info, 'CNY')).toBe('16.80 CNY（赠 5.04 CNY）');
		expect(balanceWithBonusText(info, 'USD')).toBe('2.50 USD（赠 0.75 USD）');
		setLocale('en');
		expect(balanceWithBonusText(info, 'USD')).toBe('2.50 USD (incl. 0.75 USD bonus)');
		setLocale('zh');
	});

	it('shows the total alone without gifted credit, or from a gateway that reports none', () => {
		expect(balanceWithBonusText({ currency: 'USD', total_balance: '2.5', granted_balance: '0' }, 'CNY')).toBe('16.80 CNY');
		expect(balanceWithBonusText({ currency: 'USD', total_balance: '2.5' }, 'CNY')).toBe('16.80 CNY');
		expect(balanceWithBonusText({ currency: 'USD', total_balance: '2.5', granted_balance: '0.0001' }, 'USD')).toBe('2.50 USD');
	});
});
