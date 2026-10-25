// The colour schemes of Settings → 配色 (colorScheme.ts): the built-in
// themes' own four colours give back app.css's tokens (within a few levels
// of rounding), and every scheme that is applied keeps design.md's contrast
// rule.
import { describe, expect, it } from 'vitest';
import appCss from './app.css?raw';
import { BUILTIN_SEEDS, cleanChoice, cleanScheme, CONTRAST, lightnessOf, normalizeHex, schemeContrast, schemeProblems, schemeTokens } from './colorScheme';
import { contrast, parseColor, type RGB } from './readability';

const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
function block(selector: string): Record<string, string> {
	const start = css.indexOf(`\n${selector} {`);
	const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
	const vars: Record<string, string> = {};
	for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[name] = value.trim();
	return vars;
}
const dark = block(':root');
const light = { ...dark, ...block("[data-theme='light']") };
const rgb = (v: string) => parseColor(v) as RGB;
const far = (a: string, b: string) => Math.max(...rgb(a).map((c, i) => Math.abs(c - rgb(b)[i]!)));

describe.each([
	['dark', dark],
	['light', light]
] as const)('the %s theme’s own colours', (kind, theme) => {
	const tokens = schemeTokens(BUILTIN_SEEDS[kind]);
	it('give back its frame, layers and strokes', () => {
		for (const name of ['--bg', '--text', '--sidebar', '--rail', '--panel', '--border', '--border-strong', '--divider', '--accent', '--on-accent'])
			expect(far(tokens[name]!, theme[name]!), name).toBeLessThanOrEqual(6);
	});
	it('are read as that lightness', () => expect(lightnessOf(BUILTIN_SEEDS[kind].bg)).toBe(kind));
});

describe('contrast', () => {
	const schemes = [
		{ bg: '#0f1720', text: '#e6edf3', accent: '#58a6ff', link: '#79c0ff' },
		{ bg: '#fdf6e3', text: '#002b36', accent: '#268bd2', link: '#1f6fb2' },
		{ bg: '#282a36', text: '#f8f8f2', accent: '#bd93f9', link: '#8be9fd' },
		{ bg: '#ffffff', text: '#000000', accent: '#000000', link: '#0645ad' }
	];
	it.each(schemes)('holds design.md’s rule for %o', (seeds) => {
		const c = schemeContrast(seeds);
		expect(c.problems).toEqual([]);
		expect(c.text).toBeGreaterThanOrEqual(CONTRAST.text);
		expect(c.dim).toBeGreaterThanOrEqual(CONTRAST.dim);
		expect(c.dim2).toBeGreaterThanOrEqual(CONTRAST.dim2);
		expect(c.link).toBeGreaterThanOrEqual(CONTRAST.link);
	});
	it('names what keeps a scheme from being applied', () => {
		expect(schemeProblems({ bg: '#808080', text: '#ffffff', accent: '#ffffff', link: '#ffffff' })).toContain('text');
		expect(schemeProblems({ bg: '#1a1a1a', text: '#ececec', accent: '#ececec', link: '#2a2a2a' })).toEqual(['link']);
	});
	it('pulls --dim toward the text when the mix would read too faintly', () => {
		// The built-in ratio would give #8f8f8f here, 6.5:1 on black.
		const t = schemeTokens({ bg: '#000000', text: '#d0d0d0', accent: '#ffffff', link: '#ffffff' });
		expect(contrast(rgb(t['--dim']!), rgb('#000000'))).toBeGreaterThanOrEqual(CONTRAST.dim);
		expect(contrast(rgb(t['--dim2']!), rgb('#000000'))).toBeGreaterThanOrEqual(CONTRAST.dim2);
	});
});

describe('storage', () => {
	it('keeps only valid colours and schemes, and a slot only for its lightness', () => {
		expect(normalizeHex('ABC')).toBe('#aabbcc');
		expect(normalizeHex('red')).toBeNull();
		expect(cleanScheme({ id: 'a', name: 'x', bg: '#000', text: '#fff', accent: '#fff', link: '#8af' })).toEqual({ id: 'a', name: 'x', bg: '#000000', text: '#ffffff', accent: '#ffffff', link: '#88aaff' });
		expect(cleanScheme({ id: 'a', bg: 'nope', text: '#fff', accent: '#fff', link: '#fff' })).toBeNull();
		const choice = cleanChoice({ schemes: [{ id: 'd', bg: '#101010', text: '#eeeeee', accent: '#eeeeee', link: '#99bbff' }, 'junk'], dark: 'd', light: 'd' });
		expect(choice.schemes.map((s) => s.id)).toEqual(['d']);
		expect([choice.dark, choice.light]).toEqual(['d', '']);
	});
});
