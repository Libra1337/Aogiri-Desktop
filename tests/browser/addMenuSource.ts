// The panels of this build's + menu, read from the page's source.
import page from '../../src/routes/+page.svelte?raw';
export function readFileSync(): string[] {
	const list = /const ALL_PANELS = \[([^\]]*)\]/.exec(page)?.[1] ?? '';
	return [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
}
