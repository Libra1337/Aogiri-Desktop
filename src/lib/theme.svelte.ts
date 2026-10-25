import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BUILTIN_SEEDS, cleanChoice, lightnessOf, schemeProblems, schemeTokens, SCHEMES_MAX, type ColorScheme, type SchemeChoice, type SchemeSeeds } from './colorScheme';

export type ThemePref = 'system' | 'light' | 'dark';
type Mode = 'dark' | 'light';

// `pref` is the user's choice; `value` is the resolved theme actually applied
// (consumers like the terminal palette read `value`). `schemes`, `dark` and
// `light`: the custom colour schemes (colorScheme.ts) and the one used in each
// theme ('' for the built-in colours). `preview`: a scheme shown while
// Settings edits it. `revision` changes on every apply, for readers of the
// resolved CSS (the terminal palette, the editor).
export const themeState = $state<{
	pref: ThemePref;
	value: Mode;
	schemes: ColorScheme[];
	dark: string;
	light: string;
	preview: SchemeSeeds | null;
	revision: number;
}>({
	pref: 'system',
	value: 'dark',
	schemes: [],
	dark: '',
	light: '',
	preview: null,
	revision: 0
});

const SCHEMES_KEY = 'lynshen-color-schemes';
const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;
// app.html sets the scheme's canvas before the first frame.
let applied: string[] = ['--bg'];
let revision = 0;

function resolve(pref: ThemePref): Mode {
	return pref === 'system' ? (prefersLight() ? 'light' : 'dark') : pref;
}

/** The colours on screen: the scheme being edited, else the one chosen for
 *  the theme in use when it keeps the contrast rule; null for the built-in
 *  colours. */
export function activeSeeds(): SchemeSeeds | null {
	if (themeState.preview) return themeState.preview;
	const mode = resolve(themeState.pref);
	const scheme = themeState.schemes.find((s) => s.id === themeState[mode]);
	return scheme && lightnessOf(scheme.bg) === mode && !schemeProblems(scheme).length ? scheme : null;
}

function apply() {
	themeState.value = resolve(themeState.pref);
	const root = document.documentElement;
	const seeds = activeSeeds();
	// A scheme being edited may be of the other lightness than the theme.
	if (seeds) themeState.value = lightnessOf(seeds.bg);
	root.setAttribute('data-theme', themeState.value);
	for (const token of applied) root.style.removeProperty(token);
	root.removeAttribute('data-scheme-bg');
	applied = [];
	if (seeds) {
		const tokens = schemeTokens(seeds);
		for (const [token, value] of Object.entries(tokens)) root.style.setProperty(token, value);
		applied = Object.keys(tokens);
		root.setAttribute('data-scheme', '');
	} else root.removeAttribute('data-scheme');
	themeState.revision = ++revision;
	// The native window appearance drives the macOS frosted material behind the
	// chrome: a light app on a dark system would otherwise sit on dark frost.
	// "system" hands the appearance back to the OS.
	if ('__TAURI_INTERNALS__' in window) {
		getCurrentWindow()
			.setTheme(themeState.pref === 'system' ? null : themeState.value)
			.catch(() => {});
		// The app keeps the choice for its next start, when it paints the
		// window in the theme's canvas colour before this page exists, and
		// repaints the window behind the page now (it shows while the window
		// is resized faster than the page).
		invoke('set_window_theme', { theme: themeState.pref, dark: themeState.value === 'dark' }).catch(() => {});
	}
}

function loadSchemes() {
	try {
		const choice = cleanChoice(JSON.parse(localStorage.getItem(SCHEMES_KEY) || '{}'));
		themeState.schemes = choice.schemes;
		themeState.dark = choice.dark;
		themeState.light = choice.light;
	} catch {
		/* unreadable: the built-in colours */
	}
}

function saveSchemes() {
	try {
		localStorage.setItem(SCHEMES_KEY, JSON.stringify(schemeChoice()));
	} catch {
		/* private mode / no storage: in memory only */
	}
}

export function initTheme() {
	const saved = localStorage.getItem('lynshen-theme');
	themeState.pref = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
	loadSchemes();
	apply();
	// Track OS theme changes while following the system.
	window
		.matchMedia('(prefers-color-scheme: light)')
		.addEventListener('change', () => {
			if (themeState.pref === 'system') apply();
		});
}

export function setTheme(pref: ThemePref) {
	themeState.pref = pref;
	localStorage.setItem('lynshen-theme', pref);
	apply();
}

// Sidebar/command-palette control: system → light → dark → system.
export function cycleTheme() {
	const order: ThemePref[] = ['system', 'light', 'dark'];
	setTheme(order[(order.indexOf(themeState.pref) + 1) % order.length]);
}

/** What syncs with the account (cloudSync.svelte.ts `ui.colorSchemes`). */
export function schemeChoice(): SchemeChoice {
	return { schemes: themeState.schemes.map((s) => ({ ...s })), dark: themeState.dark, light: themeState.light };
}

/** Takes the schemes and choices from another computer (cloudSync). */
export function setSchemeChoice(raw: unknown) {
	const choice = cleanChoice(raw);
	themeState.schemes = choice.schemes;
	themeState.dark = choice.dark;
	themeState.light = choice.light;
	saveSchemes();
	apply();
}

/** Uses scheme `id` ('' for the built-in colours) in the `mode` theme. */
export function setSchemeSlot(mode: Mode, id: string) {
	const scheme = themeState.schemes.find((s) => s.id === id);
	themeState[mode] = scheme && lightnessOf(scheme.bg) === mode ? id : '';
	saveSchemes();
	apply();
}

/** A new scheme from the colours of the `mode` theme as they are now,
 *  used in that theme. Null when the most schemes are kept already. */
export function createScheme(name: string, mode: Mode): ColorScheme | null {
	if (themeState.schemes.length >= SCHEMES_MAX) return null;
	const current = themeState.schemes.find((s) => s.id === themeState[mode]);
	const seeds = current ?? BUILTIN_SEEDS[mode];
	const scheme: ColorScheme = { id: Date.now().toString(36), name, bg: seeds.bg, text: seeds.text, accent: seeds.accent, link: seeds.link };
	themeState.schemes = [...themeState.schemes, scheme];
	themeState[mode] = scheme.id;
	saveSchemes();
	apply();
	return scheme;
}

/** Saves a scheme's new name or colours. A scheme whose colours change its
 *  lightness leaves the theme slot it no longer fits. */
export function updateScheme(id: string, patch: Partial<Omit<ColorScheme, 'id'>>) {
	themeState.schemes = themeState.schemes.map((s) => (s.id === id ? { ...s, ...patch } : s));
	const scheme = themeState.schemes.find((s) => s.id === id);
	for (const mode of ['dark', 'light'] as const) if (themeState[mode] === id && scheme && lightnessOf(scheme.bg) !== mode) themeState[mode] = '';
	saveSchemes();
	apply();
}

export function deleteScheme(id: string) {
	themeState.schemes = themeState.schemes.filter((s) => s.id !== id);
	if (themeState.dark === id) themeState.dark = '';
	if (themeState.light === id) themeState.light = '';
	saveSchemes();
	apply();
}

/** Shows `seeds` whatever the theme while Settings edits them (null: back
 *  to the theme's own colours). */
export function previewScheme(seeds: SchemeSeeds | null) {
	themeState.preview = seeds;
	apply();
}

/** xterm palette from the theme tokens (xterm needs concrete colors, so it
 *  reads the resolved custom properties). Call again after a theme change. */
export function terminalPalette() {
	const css = getComputedStyle(document.documentElement);
	const token = (name: string) => css.getPropertyValue(name).trim();
	return {
		background: token('--panel'),
		foreground: token('--text'),
		cursor: token('--accent-bright'),
		selectionBackground: `${token('--accent')}40`
	};
}
