import { describe, expect, it } from 'vitest';
import { FONT_CHOICES, fontChoice, offeredFonts } from './fonts';

describe('fonts', () => {
	it('keeps a saved choice only when it is on the list', () => {
		expect(fontChoice('ui', 'MiSans')).toBe('MiSans');
		expect(fontChoice('ui', 'Fira Code')).toBe('default');
		expect(fontChoice('chat', 42)).toBe('default');
		expect(fontChoice('code', 'Fira Code')).toBe('Fira Code');
	});

	it('offers the generic and bundled choices, the installed fonts and the current one', () => {
		const has = (f: string) => f === 'Noto Sans SC';
		expect(offeredFonts('ui', 'default', has).map((c) => c.id)).toEqual(['default', 'inter', 'Noto Sans SC']);
		expect(offeredFonts('ui', 'MiSans', has).map((c) => c.id)).toEqual(['default', 'inter', 'MiSans', 'Noto Sans SC']);
		expect(offeredFonts('code', 'default', () => false).map((c) => c.id)).toEqual(['default', 'system']);
	});

	it('offers only sans faces for the interface and the conversation', () => {
		for (const slot of ['ui', 'chat'] as const)
			for (const c of FONT_CHOICES[slot]) expect(c.stack ?? 'sans-serif').toMatch(/sans-serif|var\(--font-sans\)/);
	});

	it('lets each named font fall back to the app stack', () => {
		const mi = FONT_CHOICES.chat.find((c) => c.id === 'MiSans');
		expect(mi?.stack).toBe("'MiSans', var(--font-sans)");
	});
});
