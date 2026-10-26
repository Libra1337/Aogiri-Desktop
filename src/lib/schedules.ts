// An agent's scheduled tasks, kept by the lynshen daemon: the wire shape,
// the human summary of when one repeats, and the checks the daemon applies.

import { getLocale, t } from './i18n';
import type { UsageTokens } from './protocol';

export interface ScheduleUsageTotals extends UsageTokens {
	/** Gateway-settled points, including group multipliers; null if unavailable. */
	gateway_cost: number | null;
	estimated_cost_usd: number | null;
	pending_requests: number;
	unpriced_requests: number;
	running: boolean;
}

export interface ScheduleUsage {
	totals: ScheduleUsageTotals;
	/** `parent`: a session a run started (newer daemons count those too). */
	sessions: (ScheduleUsageTotals & { session: string; started_at: number | null; parent?: string })[];
	billing_error?: string;
}

/** The cost of one session's row, or '' when none is known yet. */
export function rowCost(usage: ScheduleUsageTotals | undefined): string {
	if (!usage) return '';
	const cost = usageCost(usage);
	return cost === '—' ? '' : cost;
}

/** Keep settled points and reference USD estimates separate. */
export function usageCost(usage: ScheduleUsageTotals): string {
	const costs: string[] = [];
	if (usage.gateway_cost !== null) costs.push(t('shell.schedule.billedCost', { cost: usage.gateway_cost.toFixed(4) }));
	if (usage.estimated_cost_usd !== null) costs.push(t('shell.schedule.estimatedCost', { cost: usage.estimated_cost_usd.toFixed(4) }));
	return costs.join(' · ') || '—';
}

export type Repeat = 'once' | 'hourly' | 'daily' | 'weekdays' | 'weekly';

/** How a run went: `preparing` (its worktree is being made), `running`,
 *  `waiting` (an approval), `background` (its turn ended; work it left going
 *  comes back to it), `done` or `failed`. */
export type RunStatus = 'preparing' | 'running' | 'waiting' | 'background' | 'done' | 'failed';

/** One run of a task (daemons with `schedule_runs`). Times in unix seconds. */
export interface ScheduleRun {
	at: number;
	ended_at?: number | null;
	session: string | null;
	status: RunStatus;
	error?: string | null;
	/** Someone wrote in its session after it was done. */
	followed_up?: boolean;
	/** The worktree made for it: `{repo, path, branch, base, slug}`. */
	worktree?: { path: string; branch: string; base: string } | null;
}

/** Failures in a row after which the daemon switches a task off. */
export const MAX_FAILURES = 3;

export interface Schedule {
	id: string;
	agent: string;
	name: string;
	prompt: string;
	enabled: boolean;
	repeat: Repeat;
	/** Local "HH:MM"; hourly uses the minute only. */
	time: string;
	/** Weekly only: 0 = Sunday … 6. */
	days?: number[] | null;
	/** Once only: local "YYYY-MM-DD". */
	date?: string | null;
	/** Every run in a new session; false continues the previous run's. */
	new_session: boolean;
	/** Proposed by the agent itself; off until the user turns it on. */
	by_agent?: boolean;
	/** Unix seconds. */
	created_at: number;
	last_run_at: number | null;
	last_session: string | null;
	next_run_at: number | null;
	/** Each new session runs in a git worktree of its own. Absent from a
	 *  daemon before `schedule_runs`. */
	worktree?: boolean;
	/** What one run may cost: gateway points through the LynShen gateway,
	 *  estimated US dollars otherwise; null: no limit. */
	budget?: number | null;
	/** Runs failed in a row; at MAX_FAILURES the daemon switches it off. */
	failures?: number;
	last_run?: ScheduleRun | null;
	/** The runs before `last_run`, newest first (up to 20). */
	history?: ScheduleRun[];
}

/** What `schedule_save` takes: no id creates one. */
export type ScheduleDraft = Pick<Schedule, 'agent' | 'name' | 'prompt' | 'enabled' | 'repeat' | 'time' | 'new_session'> & {
	id?: string;
	days: number[];
	date: string;
	/** Sent only to a daemon that keeps them (`schedule_runs`). */
	worktree?: boolean;
	/** The budget as typed: '' for none. */
	budget?: string;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The draft as `schedule_save` expects it: `days` and `date` only where
 *  they apply. */
export function toWire(d: ScheduleDraft): Record<string, unknown> {
	const { days, date, id, worktree, budget, ...rest } = d;
	return {
		...(id ? { id } : {}),
		...rest,
		...(worktree !== undefined ? { worktree } : {}),
		...(budget !== undefined ? { budget: budget.trim() ? Number(budget) : null } : {}),
		name: d.name.trim(),
		prompt: d.prompt.trim(),
		...(d.repeat === 'weekly' ? { days: [...days].sort((a, b) => a - b) } : {}),
		...(d.repeat === 'once' ? { date } : {})
	};
}

export function toDraft(s: Schedule): ScheduleDraft {
	return {
		id: s.id,
		agent: s.agent,
		name: s.name,
		prompt: s.prompt,
		enabled: s.enabled,
		repeat: s.repeat,
		time: s.time,
		days: s.days ?? [],
		date: s.date ?? '',
		new_session: s.new_session,
		...(s.worktree !== undefined ? { worktree: s.worktree, budget: s.budget ? String(s.budget) : '' } : {})
	};
}

/** Why the daemon would refuse the draft (a message for the user), or null.
 *  `now` is for the once-only date, which must lie ahead. */
export function validate(d: ScheduleDraft, now = new Date()): string | null {
	if (!d.name.trim()) return t('shell.schedule.errName');
	if (!d.prompt.trim()) return t('shell.schedule.errPrompt');
	if (!TIME.test(d.time)) return t('shell.schedule.errTime');
	if (d.budget?.trim() && !(Number(d.budget) > 0)) return t('shell.schedule.errBudget');
	if (d.repeat === 'weekly' && (d.days.length === 0 || d.days.some((x) => !Number.isInteger(x) || x < 0 || x > 6)))
		return t('shell.schedule.errDays');
	if (d.repeat === 'once') {
		const at = localTime(d.date, d.time);
		if (!at) return t('shell.schedule.errDate');
		if (at <= now) return t('shell.schedule.errPast');
	}
	return null;
}

/** The local moment of `date` + `time`, or null when the date is invalid. */
function localTime(date: string, time: string): Date | null {
	const m = DATE.exec(date);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const [h, mi] = time.split(':').map(Number);
	const at = new Date(y, mo - 1, d, h, mi);
	return at.getMonth() === mo - 1 && at.getDate() === d ? at : null;
}

/** When it runs, e.g. 每天 11:00 · 每周一、三 18:00 · 每小时第 15 分. */
export function summary(s: Pick<Schedule, 'repeat' | 'time' | 'days' | 'date'>): string {
	const time = s.time;
	switch (s.repeat) {
		case 'hourly':
			return t('shell.schedule.sumHourly', { minute: Number(time.split(':')[1] ?? 0) });
		case 'daily':
			return t('shell.schedule.sumDaily', { time });
		case 'weekdays':
			return t('shell.schedule.sumWeekdays', { time });
		case 'weekly': {
			const names = t('shell.schedule.dayNames').split(',');
			// Monday first; Sunday last.
			const days = [...(s.days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
			return t('shell.schedule.sumWeekly', { days: days.map((d) => names[d]).join(t('shell.schedule.daySep')), time });
		}
		case 'once': {
			const at = localTime(s.date ?? '', time);
			const date = at
				? at.toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', {
						month: getLocale() === 'zh' ? 'long' : 'short',
						day: 'numeric'
					})
				: (s.date ?? '');
			return t('shell.schedule.sumOnce', { date, time });
		}
	}
}

/** Weekday chips in display order (Monday first). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Insert or replace by id. */
export function upsert(list: Schedule[], s: Schedule): Schedule[] {
	return list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
}

/** The task's runs, newest first: its latest, then the ones kept before it. */
export function runsOf(s: Pick<Schedule, 'last_run' | 'history'>): ScheduleRun[] {
	return [...(s.last_run ? [s.last_run] : []), ...(s.history ?? [])];
}

/** The task's latest run is not over. */
export function runGoing(s: Pick<Schedule, 'last_run'>): boolean {
	const status = s.last_run?.status;
	return status === 'preparing' || status === 'running' || status === 'waiting' || status === 'background';
}

/** The daemon switched the task off after failures in a row. */
export function stoppedByFailures(s: Pick<Schedule, 'enabled' | 'failures'>): boolean {
	return !s.enabled && (s.failures ?? 0) >= MAX_FAILURES;
}

/** The i18n key of a run's status. */
export function runStatusKey(status: RunStatus): string {
	return `shell.schedule.run.${status}`;
}

/** How long a run took, in whole minutes (at least 1); null while it goes. */
export function runMinutes(run: ScheduleRun): number | null {
	if (!run.ended_at) return null;
	return Math.max(1, Math.round((run.ended_at - run.at) / 60));
}
