// A turn a plan's usage limit stopped (a Claude Code or Codex subscription)
// goes on once the limit resets, if the user asked on the notice
// (UsageLimit.svelte): in place, as an automatic retry does
// (SessionStore.retryTurn). The wait lives in this run of the app only;
// sending, stopping or closing the notice calls it off.

import type { ChatState } from './chat.svelte';
import { t } from './i18n';
import type { SessionStore } from './session.svelte';

/** After the reset time: the provider's clock may run a little behind. */
export const RESUME_GRACE_MS = 30_000;

export class LimitResume {
	#timers = new Map<ChatState, ReturnType<typeof setTimeout>>();

	/** Set by the page. */
	store: SessionStore | null = null;

	/** Goes on with the session's stopped turn when its limit resets. */
	arm(chat: ChatState) {
		const at = chat.rateLimit?.resetsAt;
		if (!at) return;
		this.cancel(chat);
		chat.resumeAtReset = true;
		// setTimeout holds at most about 24.8 days.
		const delay = Math.min(2_147_000_000, Math.max(0, at - Date.now()) + RESUME_GRACE_MS);
		this.#timers.set(
			chat,
			setTimeout(() => this.#fire(chat), delay)
		);
	}

	cancel(chat: ChatState) {
		const timer = this.#timers.get(chat);
		if (timer) clearTimeout(timer);
		this.#timers.delete(chat);
		chat.resumeAtReset = false;
	}

	#fire(chat: ChatState) {
		this.cancel(chat);
		const session = this.store?.allSessions.find((s) => s.chat === chat);
		if (!this.store || !session || chat.busy) return;
		chat.rateLimit = null;
		void this.store.retryTurn(session.id, t('shell.limit.resumed'), true);
	}
}

export const limitResume = new LimitResume();
