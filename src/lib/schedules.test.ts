import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from './i18n';
import { MAX_FAILURES, rowCost, runGoing, runMinutes, runStatusKey, runsOf, stoppedByFailures, summary, toDraft, toWire, upsert, validate, usageCost, type Schedule, type ScheduleDraft, type ScheduleRun, type ScheduleUsageTotals } from './schedules';
import { t } from './i18n';

const draft = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
	agent: 'ops',
	name: 'Check',
	prompt: 'Look at the logs',
	enabled: true,
	repeat: 'daily',
	time: '11:00',
	days: [],
	date: '',
	new_session: true,
	...over
});

describe('schedule summary', () => {
	beforeEach(() => setLocale('zh'));

	it('says when each kind repeats', () => {
		expect(summary({ repeat: 'daily', time: '11:00' })).toBe('每天 11:00');
		expect(summary({ repeat: 'weekdays', time: '09:30' })).toBe('工作日 09:30');
		expect(summary({ repeat: 'hourly', time: '00:15' })).toBe('每小时第 15 分');
		expect(summary({ repeat: 'once', time: '11:00', date: '2026-10-02' })).toBe('10月2日 11:00 一次');
	});

	it('lists weekly days Monday first, Sunday last', () => {
		expect(summary({ repeat: 'weekly', time: '18:00', days: [3, 1] })).toBe('每周一、三 18:00');
		expect(summary({ repeat: 'weekly', time: '08:00', days: [0, 6] })).toBe('每周六、日 08:00');
	});

	it('speaks English too', () => {
		setLocale('en');
		expect(summary({ repeat: 'weekly', time: '18:00', days: [1, 3] })).toBe('Every Mon, Wed at 18:00');
		expect(summary({ repeat: 'hourly', time: '00:05' })).toBe('Every hour, 5 min past');
		expect(summary({ repeat: 'once', time: '11:00', date: '2026-10-02' })).toBe('Once, Oct 2 at 11:00');
	});
});

describe('schedule validation', () => {
	beforeEach(() => setLocale('zh'));
	const now = new Date(2026, 9, 1, 12, 0);

	it('accepts a complete draft', () => {
		expect(validate(draft(), now)).toBeNull();
		expect(validate(draft({ repeat: 'weekly', days: [1] }), now)).toBeNull();
		expect(validate(draft({ repeat: 'once', date: '2026-10-02' }), now)).toBeNull();
	});

	it('refuses what the daemon would', () => {
		expect(validate(draft({ name: ' ' }), now)).toBe('请填写名称');
		expect(validate(draft({ prompt: '' }), now)).toBe('请填写任务内容');
		expect(validate(draft({ time: '24:00' }), now)).toBe('时间格式不对');
		expect(validate(draft({ time: '9:00' }), now)).toBe('时间格式不对');
		expect(validate(draft({ repeat: 'weekly', days: [] }), now)).toBe('至少选一天');
		expect(validate(draft({ repeat: 'weekly', days: [7] }), now)).toBe('至少选一天');
		expect(validate(draft({ repeat: 'once', date: '2026-02-30' }), now)).toBe('日期不对');
		expect(validate(draft({ repeat: 'once', date: '2026-10-01', time: '11:00' }), now)).toBe('这个时间已经过了');
	});
});

describe('schedule wire shape', () => {
	it('sends days and date only where they apply', () => {
		expect(toWire(draft({ days: [3, 1], date: '2026-10-02' }))).toEqual({
			agent: 'ops',
			name: 'Check',
			prompt: 'Look at the logs',
			enabled: true,
			repeat: 'daily',
			time: '11:00',
			new_session: true
		});
		expect(toWire(draft({ id: 'sch-1', repeat: 'weekly', days: [5, 1] }))).toMatchObject({ id: 'sch-1', days: [1, 5] });
		expect(toWire(draft({ repeat: 'once', date: '2026-10-02' })).date).toBe('2026-10-02');
	});

	it('replaces a saved schedule by id or appends a new one', () => {
		const a = { id: 'a', name: 'A' } as Schedule;
		const b = { id: 'b', name: 'B' } as Schedule;
		expect(upsert([a], b).map((s) => s.id)).toEqual(['a', 'b']);
		expect(upsert([a, b], { ...a, name: 'A2' }).map((s) => s.name)).toEqual(['A2', 'B']);
	});
});


describe('schedule usage amounts', () => {
	it('keeps settled points and estimated USD distinct, including zero and unknown', () => {
		const usage = { gateway_cost: 0.05, estimated_cost_usd: 0.12 } as ScheduleUsageTotals;
		expect(usageCost(usage)).toBe('实际 0.0500 积分 · 估算 $0.1200');
		expect(usageCost({ ...usage, gateway_cost: 0, estimated_cost_usd: null })).toBe('实际 0.0000 积分');
		expect(usageCost({ ...usage, gateway_cost: null, estimated_cost_usd: null })).toBe('—');
	});
});

describe('schedule runs (daemons with schedule_runs)', () => {
	beforeEach(() => setLocale('zh'));
	const base: Schedule = {
		id: 'sch-1',
		agent: 'ops',
		name: '巡检',
		prompt: 'check',
		enabled: true,
		repeat: 'daily',
		time: '09:00',
		new_session: true,
		created_at: 1,
		last_run_at: null,
		last_session: null,
		next_run_at: null
	};
	const run = (status: ScheduleRun['status'], at = 100, ended_at?: number): ScheduleRun => ({ at, ended_at, session: `s-${at}`, status });

	it('sends worktree and budget only when the draft has them (an older daemon never sees them)', () => {
		const old = toWire(draft());
		expect('worktree' in old).toBe(false);
		expect('budget' in old).toBe(false);
		expect(toWire(draft({ worktree: true, budget: ' 2.5 ' }))).toMatchObject({ worktree: true, budget: 2.5 });
		expect(toWire(draft({ worktree: false, budget: '' }))).toMatchObject({ worktree: false, budget: null });
		// A task from an older daemon edits without them; a newer one with them.
		expect('worktree' in toDraft(base)).toBe(false);
		expect(toDraft({ ...base, worktree: true, budget: 3 })).toMatchObject({ worktree: true, budget: '3' });
		expect(toDraft({ ...base, worktree: false, budget: null })).toMatchObject({ budget: '' });
	});

	it('refuses a budget that is not above 0', () => {
		expect(validate(draft({ budget: '0' }))).toBe('花费上限要大于 0');
		expect(validate(draft({ budget: 'abc' }))).toBe('花费上限要大于 0');
		expect(validate(draft({ budget: '-1' }))).toBe('花费上限要大于 0');
		expect(validate(draft({ budget: '' }))).toBeNull();
		expect(validate(draft({ budget: '0.5' }))).toBeNull();
	});

	it('lists the latest run first, then the kept ones', () => {
		expect(runsOf({ last_run: run('running', 300), history: [run('done', 200), run('failed', 100)] }).map((r) => r.at)).toEqual([300, 200, 100]);
		expect(runsOf({ last_run: null })).toEqual([]);
		expect(runsOf({})).toEqual([]);
	});

	it('knows a run that is not over, and a task switched off by its failures', () => {
		for (const status of ['preparing', 'running', 'waiting', 'background'] as const) expect(runGoing({ last_run: run(status) })).toBe(true);
		for (const status of ['done', 'failed'] as const) expect(runGoing({ last_run: run(status) })).toBe(false);
		expect(runGoing({})).toBe(false);
		expect(stoppedByFailures({ enabled: false, failures: MAX_FAILURES })).toBe(true);
		expect(stoppedByFailures({ enabled: false, failures: 1 })).toBe(false);
		expect(stoppedByFailures({ enabled: true, failures: 5 })).toBe(false);
		expect(stoppedByFailures({ enabled: false })).toBe(false);
	});

	it('names every run status in both languages', () => {
		const statuses = ['preparing', 'running', 'waiting', 'background', 'done', 'failed'] as const;
		expect(t(runStatusKey('background'))).toBe('后台任务运行中');
		for (const status of statuses) expect(t(runStatusKey(status))).not.toContain('shell.schedule');
		setLocale('en');
		expect(t(runStatusKey('background'))).toBe('Background tasks running');
		for (const status of statuses) expect(t(runStatusKey(status))).not.toContain('shell.schedule');
	});

	it('says how long a run took and what its session cost', () => {
		expect(runMinutes(run('done', 0, 30))).toBe(1);
		expect(runMinutes(run('done', 0, 600))).toBe(10);
		expect(runMinutes(run('running', 0))).toBeNull();
		const totals = (over: Partial<ScheduleUsageTotals>): ScheduleUsageTotals => ({
			input_tokens: 0,
			cached_input_tokens: 0,
			cache_write_tokens: 0,
			output_tokens: 0,
			reasoning_tokens: 0,
			turns: 1,
			gateway_cost: null,
			estimated_cost_usd: null,
			pending_requests: 0,
			unpriced_requests: 0,
			running: false,
			...over
		});
		expect(rowCost(undefined)).toBe('');
		expect(rowCost(totals({}))).toBe('');
		expect(rowCost(totals({ gateway_cost: 1.5 }))).toBe('实际 1.5000 积分');
	});
});
