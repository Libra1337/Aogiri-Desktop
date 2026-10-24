// External editors (VS Code, Cursor, Zed, Xcode, JetBrains IDEs…) a project
// or a file opens in. Which are installed comes from the app (editors.rs);
// the one last chosen is kept on this computer only: another computer has
// other editors installed, so it is not synced.
import { listEditors, openInEditor, type EditorInfo } from '$lib/protocol';

const KEY = 'lynshen-external-editor';

class Editors {
	list = $state<EditorInfo[]>([]);
	#chosen = $state(typeof localStorage === 'undefined' ? '' : (localStorage.getItem(KEY) ?? ''));
	#loading: Promise<void> | null = null;

	/** The editor a plain click opens: the last chosen while it is installed, else the first found. */
	get preferred(): EditorInfo | undefined {
		return this.list.find((e) => e.id === this.#chosen) ?? this.list[0];
	}

	/** Looks again (an editor may have been installed since). Calls made
	 *  while a look is under way share it. */
	load(): Promise<void> {
		this.#loading ??= listEditors()
			.catch((e) => {
				console.error('list editors failed', e);
				return [];
			})
			.then((list) => {
				this.list = list;
				this.#loading = null;
			});
		return this.#loading;
	}

	/** Opens `path` in `id` and makes it the preferred one. Rejects with the reason it could not. */
	async open(id: string, path: string, at?: { line?: number; col?: number }, root?: string) {
		this.#chosen = id;
		localStorage.setItem(KEY, id);
		await openInEditor(id, path, at, root);
	}
}

export const editors = new Editors();
