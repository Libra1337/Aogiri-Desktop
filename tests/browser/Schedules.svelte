<script lang="ts">
	// The workbench's 定时任务 page (ScheduleBoard) on a scripted computer,
	// for the browser regressions and the B12 screenshots:
	//   ?scheduleBoard                      a newer daemon (schedule_runs): run
	//                                       records, a task switched off after
	//                                       failures, one on background work
	//   &oldSchedules                       a daemon before them (no records,
	//                                       no worktree or cost limit offered)
	//   &dialog=new|edit                    the task dialog open
	// window.__scheduleOps: every op the page sent.
	import { onMount } from 'svelte';
	import ScheduleBoard from '../../src/lib/ScheduleBoard.svelte';
	import ScheduleDialog from '../../src/lib/ScheduleDialog.svelte';
	import Toaster from '../../src/lib/ui/Toaster.svelte';
	import ConfirmHost from '../../src/lib/ui/ConfirmHost.svelte';
	import { AgentDirectory } from '../../src/lib/agents.svelte';
	import { provideAgents } from '../../src/lib/agentScope';
	import { DaemonClient, type SocketLike } from '../../src/lib/daemon';
	import { engine } from '../../src/lib/engineVersion.svelte';
	import { setLocale } from '../../src/lib/i18n';
	import type { Schedule } from '../../src/lib/schedules';

	const params = new URL(location.href).searchParams;
	setLocale(params.get('lang') === 'en' ? 'en' : 'zh');
	type Frame = Record<string, unknown>;
	const old = params.has('oldSchedules');
	engine.features = old ? ['queue', 'files'] : ['queue', 'files', 'schedule_runs'];
	const now = Math.floor(Date.now() / 1000);
	const run = (ago: number, status: string, minutes: number, extra: Frame = {}) => ({
		at: now - ago,
		ended_at: status === 'running' || status === 'background' ? null : now - ago + minutes * 60,
		session: `s-${ago}`,
		status,
		...extra
	});
	let schedules: Frame[] = [
		{
			id: 'sch-a', agent: 'ops', name: '每日巡检', prompt: '检查昨晚的部署日志，有异常就汇报。', enabled: true, repeat: 'daily', time: '09:00', days: [], date: null,
			new_session: true, by_agent: false, created_at: 1, last_run_at: now - 600, last_session: 's-600', next_run_at: now + 80000,
			worktree: true, budget: 20, failures: 0, skipped: 0,
			last_run: run(600, 'background', 0, { worktree: { path: '/Users/me/code/.lynshen-worktrees/ops/sch-a-1026-0900', branch: 'task/sch-a-1026-0900', base: 'main' } }),
			history: [
				run(86400, 'done', 7, { worktree: { path: '/w', branch: 'task/sch-a-1025-0900', base: 'main' } }),
				run(172800, 'failed', 120, { error: '运行超过 2 小时，已停止。' }),
				run(259200, 'done', 4, { followed_up: true }),
				run(345600, 'done', 5)
			]
		},
		{
			id: 'sch-b', agent: 'ops', name: '夜间构建', prompt: '跑一遍完整构建和测试。', enabled: false, repeat: 'weekdays', time: '02:00', days: [], date: null,
			new_session: true, by_agent: false, created_at: 2, last_run_at: now - 50000, last_session: 's-50000', next_run_at: null,
			worktree: false, budget: 5, failures: 3, skipped: 0,
			last_run: run(50000, 'failed', 3, { error: '花费 5.2100 点，超过上限 5，已停止。' }),
			history: [run(136400, 'failed', 2, { error: 'HTTP 502' }), run(222800, 'failed', 1, { error: 'HTTP 502' }), run(309200, 'done', 9)]
		},
		{
			id: 'sch-c', agent: 'ops', name: '周报', prompt: '汇总这周的改动。', enabled: true, repeat: 'weekly', time: '18:00', days: [5], date: null,
			new_session: true, by_agent: false, created_at: 3, last_run_at: null, last_session: null, next_run_at: now + 200000,
			worktree: false, budget: null, failures: 0, skipped: 0, last_run: null, history: []
		}
	];
	if (old) schedules = schedules.map(({ worktree, budget, failures, skipped, last_run, history, ...rest }) => (void [worktree, budget, failures, skipped, last_run, history], rest));
	const usage = (session: string, points: number) => ({ session, started_at: null, input_tokens: 120000, cached_input_tokens: 80000, cache_write_tokens: 0, output_tokens: 9000, reasoning_tokens: 0, turns: 2, gateway_cost: points, estimated_cost_usd: null, pending_requests: 0, unpriced_requests: 0, running: false, gateway_requests: 4 });
	const ops: Frame[] = [];
	class Computer implements SocketLike {
		readyState = 1;
		onopen: (() => void) | null = null;
		onmessage: ((event: { data: unknown }) => void) | null = null;
		onclose: (() => void) | null = null;
		onerror: (() => void) | null = null;
		constructor() {
			setTimeout(() => {
				this.emit({ type: 'hello', protocol: 2, version: '0.8.0', features: engine.features });
				this.emit({ type: 'agents', agents: [{ id: 'ops', name: 'Ops', enabled: true, busy: true, cwd: '/Users/me/code/ops', avatar_seed: 'ops' }] });
				this.emit({ type: 'schedules', schedules });
			});
		}
		emit(frame: Frame) {
			this.onmessage?.({ data: JSON.stringify(frame) });
		}
		send(text: string) {
			const op = JSON.parse(text) as Frame;
			ops.push(op);
			const answer = (frame: Frame) => setTimeout(() => this.emit({ ...frame, id: op.id }), 20);
			switch (op.op) {
				case 'schedule_list':
					return answer({ type: 'schedules', schedules });
				case 'schedule_usage': {
					const rows = [usage('s-600', 3.2), usage('s-86400', 2.75), usage('s-50000', 5.21)];
					return answer({ type: 'schedule_usage', schedule: op.schedule, totals: { ...usage('', 11.16), session: undefined }, sessions: rows });
				}
				case 'schedule_save': {
					const change = op.schedule as Frame;
					const known = schedules.find((x) => x.id === change.id);
					const saved = known
						? { ...known, ...change, ...(change.enabled === true && !known.enabled ? { failures: 0, next_run_at: now + 3600 } : {}) }
						: { ...change, id: 'sch-new', created_at: 9, last_run_at: null, last_session: null, next_run_at: now + 3600, ...(old ? {} : { failures: 0, last_run: null, history: [] }) };
					if (old) for (const key of ['worktree', 'budget']) delete (saved as Frame)[key];
					schedules = known ? schedules.map((x) => (x.id === change.id ? saved : x)) : [...schedules, saved];
					setTimeout(() => this.emit({ type: 'schedules', schedules }), 10);
					return answer({ type: 'schedule_saved', schedule: saved });
				}
				case 'schedule_run':
					return answer({ type: 'schedule_started', schedule: op.schedule });
				case 'timer_list':
					return answer({ type: 'timers', timers: [] });
				case 'ping':
					return answer({ type: 'pong' });
				default:
					if (typeof op.id === 'number') answer({ type: 'error', message: `${op.op} requires session` });
			}
		}
		close() {}
	}
	Object.assign(window, { __scheduleOps: ops });
	const client = new DaemonClient(async () => ({ url: 'ws://computer', token: 't' }), () => new Computer());
	const directory = new AgentDirectory(client);
	client.onEvent = (frame) => directory.handle(frame);
	provideAgents(directory);
	onMount(() => directory.start());
	const dialog = params.get('dialog');
	const editing = $derived(dialog === 'edit' ? (directory.schedules.find((s) => s.id === 'sch-a') as Schedule | undefined) : undefined);
</script>

<Toaster />
<ConfirmHost />
<main class="page">
	<ScheduleBoard agents={directory.agents} onOpenSession={(s) => ((window as unknown as { __opened: string }).__opened = s)} onOpenAgent={() => {}} />
</main>
{#if dialog === 'new' || (dialog === 'edit' && editing)}
	<ScheduleDialog agent="ops" schedule={editing} onClose={() => {}} />
{/if}

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 32px;
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-sans);
	}
</style>
