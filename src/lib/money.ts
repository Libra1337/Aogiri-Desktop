import { t } from '$lib/i18n';

/** A balance to two decimals, cut rather than rounded so it never reads higher
 *  than it is. Amounts spent are shown as the server sends them. */
export function fmtBalance(v?: string | null): string {
	const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec((v ?? '').trim() || '0');
	if (!m) return v ?? '';
	const frac = (m[3] ?? '').padEnd(2, '0').slice(0, 2);
	const int = m[2] || '0';
	const sign = m[1] && /[1-9]/.test(int + frac) ? '-' : '';
	return `${sign}${int}.${frac}`;
}

/** The gateway's fixed rate (Monoize SB-FX-1), as the website converts with it. */
export const CNY_PER_USD = 6.72;

/**
 * A balance in the currency the user chose to see. Only a USD amount converts
 * (the gateway keeps balances in USD); any other currency stays as reported.
 */
export function shownBalance(
	amount: string | null | undefined,
	currency: string | null | undefined,
	wanted: 'CNY' | 'USD'
): { amount: string; currency: string } {
	const from = (currency ?? '').toUpperCase();
	if (from === 'USD' && wanted === 'CNY') {
		const usd = Number(amount);
		if (Number.isFinite(usd)) return { amount: fmtBalance((usd * CNY_PER_USD).toFixed(6)), currency: 'CNY' };
	}
	return { amount: fmtBalance(amount), currency: currency ?? '' };
}

/** `shownBalance` as one string: "5695.38 CNY". */
export function shownBalanceText(
	amount: string | null | undefined,
	currency: string | null | undefined,
	wanted: 'CNY' | 'USD'
): string {
	const b = shownBalance(amount, currency, wanted);
	return `${b.amount} ${b.currency}`.trim();
}

/** One `balance_infos` entry of the gateway's /user/balance (DeepSeek format). */
export interface BalanceInfo {
	total_balance: string;
	currency: string;
	granted_balance?: string | null;
}

/**
 * The account balance as one line: the total (paid plus gifted credit, which
 * model calls spend after the paid part), and the gifted part in brackets,
 * "12.30 CNY（赠 2.30 CNY）". Without gifted credit, or from a gateway that
 * reports none (granted_balance "0"), the total alone.
 */
export function balanceWithBonusText(info: BalanceInfo, wanted: 'CNY' | 'USD'): string {
	const total = shownBalanceText(info.total_balance, info.currency, wanted);
	const granted = Number(info.granted_balance ?? 0);
	if (!Number.isFinite(granted) || granted <= 0) return total;
	const bonus = shownBalance(info.granted_balance, info.currency, wanted);
	if (Number(bonus.amount) <= 0) return total;
	return total + t('shell.account.bonusSuffix', { bonus: `${bonus.amount} ${bonus.currency}`.trim() });
}
