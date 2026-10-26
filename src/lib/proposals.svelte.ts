// What the user did with an agent's proposed scheduled tasks
// (`propose_schedule` cards, ScheduleProposal.svelte): created a task from
// it, or set it aside. A created task carries the proposal's id (`origin`,
// LynShen CLI 0.7.9+), so the daemon's list says so on every device; this
// keeps the choice on this device too, for a daemon whose tasks carry no
// origin and for 不用了, which the daemon does not hear of.
import { SvelteMap } from 'svelte/reactivity';
import type { Schedule } from './schedules';

const KEY = 'lynshen-proposals';
/** The newest choices kept. */
const MAX = 200;

export type ProposalChoice = 'created' | 'declined';

class Proposals {
	#choices = new SvelteMap<string, ProposalChoice>();
	#loaded = false;

	#load() {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
			if (Array.isArray(raw))
				for (const e of raw) if (Array.isArray(e) && typeof e[0] === 'string' && (e[1] === 'created' || e[1] === 'declined')) this.#choices.set(e[0], e[1]);
		} catch {
			/* no storage, or not ours: start empty */
		}
	}

	#save() {
		try {
			localStorage.setItem(KEY, JSON.stringify([...this.#choices].slice(-MAX)));
		} catch {
			/* storage full or off: in memory only */
		}
	}

	/** What became of proposal `id`: a task with its origin, else the
	 *  choice made here, else null (still open). */
	state(id: string, schedules: readonly Pick<Schedule, 'origin'>[]): ProposalChoice | null {
		if (schedules.some((s) => s.origin === id)) return 'created';
		this.#load();
		return this.#choices.get(id) ?? null;
	}

	set(id: string, choice: ProposalChoice) {
		this.#load();
		this.#choices.delete(id);
		this.#choices.set(id, choice);
		this.#save();
	}
}

export const proposals = new Proposals();
