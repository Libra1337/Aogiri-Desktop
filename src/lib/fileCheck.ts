// Whether a file a reply names exists, for showing its link (Markdown.svelte):
// a path that resolves to no file reads as plain text. The conversation that
// knows where its paths resolve (ChatPane) provides the check by context;
// elsewhere (the phone page, a preview) links stay as they are.

import { getContext, setContext } from 'svelte';

const KEY = Symbol('file-check');
/** A missing file may be written soon (the agent names it, then creates it):
 *  it is asked again after this long. A found file stays found. */
export const RETRY_MS = 20_000;

export interface FileCheck {
	/** The answer already known, if any. */
	known(href: string): boolean | undefined;
	check(href: string): Promise<boolean>;
}

/** The check `resolve` answers, with the answers kept (`now`: for tests). */
export function fileCheck(resolve: (href: string) => Promise<boolean>, now: () => number = () => performance.now()): FileCheck {
	const answers = new Map<string, { ok: boolean; at: number }>();
	const asking = new Map<string, Promise<boolean>>();
	return {
		known(href) {
			const a = answers.get(href);
			return a && (a.ok || now() - a.at < RETRY_MS) ? a.ok : undefined;
		},
		check(href) {
			let p = asking.get(href);
			if (!p) {
				p = resolve(href)
					.catch(() => false)
					.then((ok) => {
						answers.set(href, { ok, at: now() });
						asking.delete(href);
						return ok;
					});
				asking.set(href, p);
			}
			return p;
		}
	};
}

export function provideFileCheck(resolve: (href: string) => Promise<boolean>) {
	setContext<FileCheck>(KEY, fileCheck(resolve));
}

export const useFileCheck = () => getContext<FileCheck | undefined>(KEY);
