// Mermaid diagrams in replies (Markdown.svelte): a ```mermaid block shows its
// diagram inside the code block's frame, in the colours of the theme's
// tokens. Mermaid is large, so it loads the first time a reply has a
// diagram; a source that does not parse gives null and the block stays code.
import type { Mermaid, MermaidConfig } from 'mermaid';

let loading: Promise<Mermaid> | null = null;
/** The theme mermaid was last initialized with (its variables as JSON). */
let configured = '';
let seq = 0;

// The SVG by theme and source, so a row windowed back in, or the same
// diagram in another reply, is not drawn again. null: it does not parse.
const drawn = new Map<string, string | null>();
const DRAWN_MAX = 100;

/** The token colours mermaid's base theme is made from (design.md §4 Color):
 *  nodes on `--panel` with a `--dim2` edge, text in `--text`, lines in
 *  `--dim`, clusters and labels on the surfaces. `color` gives a token as an
 *  opaque colour. */
export function themeVariables(color: (token: string) => string, font: string, size: string, dark: boolean): NonNullable<MermaidConfig['themeVariables']> {
	const surface = color('--surface');
	return {
		darkMode: dark,
		background: color('--bg'),
		fontFamily: font,
		fontSize: size,
		primaryColor: color('--panel'),
		primaryTextColor: color('--text'),
		primaryBorderColor: color('--dim2'),
		secondaryColor: color('--surface2'),
		tertiaryColor: surface,
		lineColor: color('--dim'),
		textColor: color('--text'),
		clusterBkg: surface,
		clusterBorder: color('--border-strong'),
		edgeLabelBackground: color('--bg'),
		noteBkgColor: color('--surface2'),
		noteTextColor: color('--text'),
		noteBorderColor: color('--border-strong'),
		// Flat, as cards in the transcript are (design.md §4 Surfaces).
		useGradient: false,
		dropShadow: 'none'
	};
}

let pixel: CanvasRenderingContext2D | null = null;

/** A CSS colour as opaque hex over `under`: mermaid works its shades out
 *  from hex colours and reads neither custom properties nor alpha. */
function solid(css: string, under: string): string {
	if (!pixel) {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		pixel = canvas.getContext('2d', { willReadFrequently: true });
	}
	const ctx = pixel;
	if (!ctx) return css;
	ctx.fillStyle = under;
	ctx.fillRect(0, 0, 1, 1);
	ctx.fillStyle = css;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** The current theme's variables, read from the tokens on the root. */
function currentTheme() {
	const root = document.documentElement;
	const css = getComputedStyle(root);
	const token = (name: string) => css.getPropertyValue(name).trim();
	const dark = root.dataset.theme !== 'light';
	const bg = solid(token('--bg'), dark ? '#000' : '#fff');
	return themeVariables((name) => (name === '--bg' ? bg : solid(token(name), bg)), token('--font-sans'), token('--fs-sm') || '13px', dark);
}

/** The diagram as SVG in the current theme, or null when the source is not
 *  valid mermaid (the code block then stays as it is). */
export async function renderMermaid(source: string): Promise<string | null> {
	const vars = currentTheme();
	const theme = JSON.stringify(vars);
	const key = `${theme}\n${source}`;
	const hit = drawn.get(key);
	if (hit !== undefined) return hit;
	loading ??= import('mermaid').then((m) => m.default);
	const mermaid = await loading;
	if (configured !== theme) {
		mermaid.initialize({
			startOnLoad: false,
			// Labels are sanitized and click handlers are off.
			securityLevel: 'strict',
			// A bad source gives null here, not mermaid's error picture.
			suppressErrorRendering: true,
			// Plain shapes with 1px edges: no hand-drawn or shaded look.
			look: 'classic',
			theme: 'base',
			themeVariables: vars
		});
		configured = theme;
	}
	let svg: string | null = null;
	try {
		if (await mermaid.parse(source, { suppressErrors: true })) svg = (await mermaid.render(`mermaid-${++seq}`, source)).svg;
	} catch {
		svg = null;
	}
	if (drawn.size >= DRAWN_MAX) drawn.delete(drawn.keys().next().value!);
	drawn.set(key, svg);
	return svg;
}
