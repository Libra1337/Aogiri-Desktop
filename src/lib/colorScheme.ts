// Custom colour schemes (Settings → 通用 → 配色). A scheme is four colours:
// the canvas, the text, the accent (primary buttons, selection) and links
// (links and the focus ring). Every other colour token is derived from them
// in the ratios of the built-in theme of the same lightness (app.css), so a
// scheme keeps the frame tone, the layers and the strokes of design.md §4.
// Status colours, the logo lights, shadows and code colours stay the
// built-in theme's.
//
// design.md's contrast rule holds for every scheme: --dim and --dim2 are
// pulled toward the text until they read at 7:1 and 4.5:1 on the canvas and
// the frame tone; a scheme whose text cannot reach 12:1 there, or whose link
// colour cannot reach 4.5:1, is not applied (`schemeProblems`).

import { contrast, parseColor, type RGB } from './readability';

export interface SchemeSeeds {
	bg: string;
	text: string;
	accent: string;
	link: string;
}

export interface ColorScheme extends SchemeSeeds {
	id: string;
	name: string;
}

export type Lightness = 'dark' | 'light';

/** The built-in themes' four colours (app.css). */
export const BUILTIN_SEEDS: Record<Lightness, SchemeSeeds> = {
	dark: { bg: '#1a1a1a', text: '#ececec', accent: '#ececec', link: '#a78bfa' },
	light: { bg: '#f6f5f2', text: '#1a1917', accent: '#1a1917', link: '#6d28d9' }
};

/** design.md §4 Color: text on the canvas and the frame tone. */
export const CONTRAST = { text: 12, dim: 7, dim2: 4.5, link: 4.5 } as const;

const hex = (rgb: RGB) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** `#rrggbb` in lowercase; null when `value` is not a hex colour. */
export function normalizeHex(value: string): string | null {
	if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())) return null;
	const rgb = parseColor(value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`);
	return rgb ? hex(rgb) : null;
}

const rgbOf = (value: string): RGB => parseColor(value) ?? [0, 0, 0];

/** `share` of `a` over `b`, as sRGB. */
const mix = (a: RGB, b: RGB, share: number): RGB => [0, 1, 2].map((i) => a[i]! * share + b[i]! * (1 - share)) as RGB;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** A canvas is dark when white text reads better on it than black. */
export const lightnessOf = (bg: string): Lightness => (contrast(rgbOf(bg), WHITE) > contrast(rgbOf(bg), BLACK) ? 'dark' : 'light');

/** Text on the accent: white or near-black, whichever reads better. */
export const onAccent = (accent: string) => (contrast(rgbOf(accent), WHITE) >= contrast(rgbOf(accent), [23, 23, 23]) ? '#ffffff' : '#171717');

type Mix = { from: keyof SchemeSeeds | 'white' | 'black'; over: keyof SchemeSeeds | 'white' | 'black' | 'transparent'; share: number };
const m = (from: Mix['from'], over: Mix['over'], share: number): Mix => ({ from, over, share });

// The ratios that give the built-in themes their own values (app.css).
const MIXES: Record<Lightness, Record<string, Mix>> = {
	dark: {
		'--sidebar': m('bg', 'black', 0.769),
		'--rail': m('bg', 'black', 0.769),
		'--divider': m('text', 'bg', 0.076),
		'--panel': m('text', 'bg', 0.057),
		'--border': m('text', 'bg', 0.095),
		'--border-strong': m('text', 'bg', 0.152),
		'--surface': m('text', 'transparent', 0.03),
		'--surface2': m('text', 'transparent', 0.06),
		'--hairline': m('text', 'transparent', 0.06),
		'--dim': m('text', 'bg', 0.69),
		'--dim2': m('text', 'bg', 0.524),
		'--accent-bright': m('accent', 'white', 0.75),
		'--accent-deep': m('accent', 'bg', 0.65),
		'--accent-soft': m('accent', 'transparent', 0.08),
		'--brand': m('link', 'bg', 0.85)
	},
	light: {
		'--sidebar': m('bg', 'black', 0.974),
		'--rail': m('bg', 'black', 0.974),
		'--divider': m('text', 'bg', 0.106),
		'--panel': m('bg', 'white', 0.506),
		'--border': m('text', 'bg', 0.12),
		'--border-strong': m('text', 'bg', 0.206),
		'--surface': m('text', 'transparent', 0.03),
		'--surface2': m('text', 'transparent', 0.06),
		'--hairline': m('text', 'transparent', 0.07),
		'--dim': m('text', 'bg', 0.795),
		'--dim2': m('text', 'bg', 0.668),
		'--accent-bright': m('accent', 'black', 0.8),
		'--accent-deep': m('accent', 'bg', 0.77),
		'--accent-soft': m('accent', 'transparent', 0.05),
		'--brand': m('link', 'bg', 0.9)
	}
};

/** The least share of the text over the canvas that reads at `least` on
 *  both the canvas and the frame tone, from `start` up. */
function readableShare(text: RGB, bg: RGB, frame: RGB, start: number, least: number): number {
	for (let s = start; s < 1; s += 0.01) {
		// As painted: whole levels.
		const ink = mix(text, bg, s).map(Math.round) as RGB;
		if (contrast(ink, bg) >= least && contrast(ink, frame) >= least) return s;
	}
	return 1;
}

/** Every colour token a scheme sets, as concrete colours: the terminal and
 *  the editor read them from CSS and need plain values. */
export function schemeTokens(seeds: SchemeSeeds): Record<string, string> {
	const kind = lightnessOf(seeds.bg);
	const rgb = (s: Mix['from'] | Mix['over']): RGB => (s === 'white' ? WHITE : s === 'black' ? BLACK : rgbOf(seeds[s as keyof SchemeSeeds]));
	const tokens: Record<string, string> = {
		'--bg': normalizeHex(seeds.bg) ?? seeds.bg,
		'--text': normalizeHex(seeds.text) ?? seeds.text,
		'--accent': normalizeHex(seeds.accent) ?? seeds.accent,
		'--on-accent': onAccent(seeds.accent),
		'--brand-bright': normalizeHex(seeds.link) ?? seeds.link
	};
	for (const [token, { from, over, share }] of Object.entries(MIXES[kind])) {
		const a = rgb(from);
		tokens[token] = over === 'transparent' ? `rgba(${a.map(Math.round).join(', ')}, ${share})` : hex(mix(a, rgb(over), share));
	}
	// --dim and --dim2 keep design.md's contrast on the canvas and the frame.
	const bg = rgbOf(seeds.bg);
	const text = rgbOf(seeds.text);
	const frame = rgbOf(tokens['--rail']!);
	tokens['--dim'] = hex(mix(text, bg, readableShare(text, bg, frame, MIXES[kind]['--dim']!.share, CONTRAST.dim)));
	tokens['--dim2'] = hex(mix(text, bg, readableShare(text, bg, frame, MIXES[kind]['--dim2']!.share, CONTRAST.dim2)));
	return tokens;
}

/** The contrast figures of a scheme as applied (text, links on the canvas
 *  and the frame tone), and what fails design.md's rule. */
export function schemeContrast(seeds: SchemeSeeds): { text: number; dim: number; dim2: number; link: number; accent: number; problems: ('text' | 'link' | 'accent')[] } {
	const tokens = schemeTokens(seeds);
	const on = (ink: string) => Math.min(contrast(rgbOf(tokens[ink]!), rgbOf(tokens['--bg']!)), contrast(rgbOf(tokens[ink]!), rgbOf(tokens['--rail']!)));
	const text = on('--text');
	const link = on('--brand-bright');
	const accent = contrast(rgbOf(tokens['--accent']!), rgbOf(tokens['--on-accent']!));
	const problems: ('text' | 'link' | 'accent')[] = [];
	if (text < CONTRAST.text) problems.push('text');
	if (link < CONTRAST.link) problems.push('link');
	if (accent < CONTRAST.link) problems.push('accent');
	return { text, dim: on('--dim'), dim2: on('--dim2'), link, accent, problems };
}

/** What keeps a scheme from being applied (empty: it can be). */
export const schemeProblems = (seeds: SchemeSeeds) => schemeContrast(seeds).problems;

/** At most this many schemes are kept (they sync with the account). */
export const SCHEMES_MAX = 12;

/** A scheme read from storage or the cloud, made valid; null when it cannot be. */
export function cleanScheme(raw: unknown): ColorScheme | null {
	const s = raw as Partial<ColorScheme> | null;
	if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[\w-]{1,40}$/.test(s.id)) return null;
	const colors = (['bg', 'text', 'accent', 'link'] as const).map((k) => (typeof s[k] === 'string' ? normalizeHex(s[k]) : null));
	if (colors.some((c) => !c)) return null;
	const [bg, text, accent, link] = colors as string[];
	const name = typeof s.name === 'string' ? s.name.slice(0, 40) : '';
	return { id: s.id, name, bg: bg!, text: text!, accent: accent!, link: link! };
}

/** What Settings → 配色 keeps and syncs: the schemes, and the one used in the
 *  dark and in the light theme ('' for the built-in one). */
export interface SchemeChoice {
	schemes: ColorScheme[];
	dark: string;
	light: string;
}

export function cleanChoice(raw: unknown): SchemeChoice {
	const c = (raw ?? {}) as Partial<SchemeChoice>;
	const schemes = (Array.isArray(c.schemes) ? c.schemes : []).map(cleanScheme).filter((x): x is ColorScheme => !!x).slice(0, SCHEMES_MAX);
	const pick = (id: unknown, kind: Lightness) => {
		const s = typeof id === 'string' ? schemes.find((x) => x.id === id) : undefined;
		return s && lightnessOf(s.bg) === kind ? s.id : '';
	};
	return { schemes, dark: pick(c.dark, 'dark'), light: pick(c.light, 'light') };
}
