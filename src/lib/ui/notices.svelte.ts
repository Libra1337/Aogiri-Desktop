// Notices in the bottom-right corner (CornerNotices.svelte): something the
// app noticed on its own and offers to act on (a dev server an agent
// started). They close by themselves after a while; the pointer over one
// holds it. The outcome of the user's own action is a toast instead
// (toast.svelte.ts, under the title bar).

export type Notice = {
	id: number;
	title: string;
	/** A second line (an address), mono. */
	detail?: string;
	action?: { label: string; run: () => void };
	/** Notices with the same key replace each other. */
	key?: string;
};

type Options = Omit<Notice, 'id' | 'title'> & { /** ms; 0 keeps it until closed. */ duration?: number };

const DURATION = 10_000;
const MAX = 3;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const left = new Map<number, number>();
const started = new Map<number, number>();

export class Notices {
	/** Oldest first: the newest sits at the bottom. */
	items = $state<Notice[]>([]);

	show(title: string, opts: Options = {}): number {
		const { duration = DURATION, ...rest } = opts;
		if (rest.key) this.dismissKey(rest.key);
		const id = nextId++;
		const kept = [...this.items, { id, title, ...rest }];
		for (const old of kept.slice(0, Math.max(0, kept.length - MAX))) this.#clear(old.id);
		this.items = kept.slice(-MAX);
		if (duration > 0) {
			left.set(id, duration);
			this.resume(id);
		}
		return id;
	}

	/** The pointer is over it: its clock stops. */
	hold(id: number) {
		const timer = timers.get(id);
		if (timer === undefined) return;
		clearTimeout(timer);
		timers.delete(id);
		left.set(id, (left.get(id) ?? 0) - (Date.now() - (started.get(id) ?? Date.now())));
	}

	resume(id: number) {
		const ms = left.get(id);
		if (ms === undefined || timers.has(id)) return;
		started.set(id, Date.now());
		timers.set(id, setTimeout(() => this.dismiss(id), Math.max(ms, 1500)));
	}

	dismiss(id: number) {
		this.#clear(id);
		this.items = this.items.filter((n) => n.id !== id);
	}

	dismissKey(key: string) {
		for (const n of this.items) if (n.key === key) this.dismiss(n.id);
	}

	#clear(id: number) {
		clearTimeout(timers.get(id));
		timers.delete(id);
		left.delete(id);
		started.delete(id);
	}
}

export const notices = new Notices();
