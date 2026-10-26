<script lang="ts">
	// A scheduled task's run records (its latest and the 20 kept before it):
	// how each went, when, how long, what it cost and its session.
	import Button from '$lib/ui/Button.svelte';
	import { useAgents } from '$lib/agentScope';
	import { rowCost, runMinutes, runStatusKey, runsOf, type Schedule, type ScheduleUsage } from '$lib/schedules';
	import { t } from '$lib/i18n';

	let {
		schedule,
		onOpenSession
	}: {
		schedule: Schedule;
		onOpenSession: (session: string) => void;
	} = $props();

	const directory = useAgents();
	const runs = $derived(runsOf(schedule));
	let usage = $state<ScheduleUsage | null>(null);
	let loading = $state(false);
	let refresh = $state(0);

	// What each run's session cost (the sessions it started are in the
	// task's totals on the 花费记录 table).
	$effect(() => {
		void refresh;
		void schedule.last_run?.status;
		const id = schedule.id;
		let stale = false;
		loading = true;
		directory
			.scheduleUsage(id)
			.then(
				(next) => {
					if (!stale) usage = next;
				},
				() => {}
			)
			.finally(() => {
				if (!stale) loading = false;
			});
		return () => {
			stale = true;
		};
	});
	const costOf = (session: string | null) => (session ? rowCost(usage?.sessions.find((row) => row.session === session)) : '');

	function when(seconds: number): string {
		return new Date(seconds * 1000).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="runs-head">
	<span>{t('shell.schedule.runsHint')}</span>
	<Button size="sm" variant="ghost" disabled={loading} onclick={() => refresh++}>{loading ? t('common.loading') : t('shell.schedule.refreshUsage')}</Button>
</div>
{#if runs.length === 0}
	<p class="empty">{t('shell.schedule.runsEmpty')}</p>
{:else}
	<ol class="runs">
		{#each runs as run, i (`${run.at}-${i}`)}
			{@const minutes = runMinutes(run)}
			{@const cost = costOf(run.session)}
			<li>
				<button class="run" disabled={!run.session} onclick={() => run.session && onOpenSession(run.session)}>
					<span class="status {run.status}"><i></i>{t(runStatusKey(run.status))}</span>
					<span class="at">{when(run.at)}</span>
					<span class="detail">
						{#if minutes !== null}<span>{t('shell.schedule.runMinutes', { n: minutes })}</span>{/if}
						{#if cost}<span>{cost}</span>{/if}
						{#if run.worktree}<span class="mono">{t('shell.schedule.runWorktree', { branch: run.worktree.branch })}</span>{/if}
						{#if run.followed_up}<span>{t('shell.schedule.runFollowedUp')}</span>{/if}
					</span>
				</button>
				{#if run.status === 'failed' && run.error}<div class="error">{run.error}</div>{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.runs-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 4px 0;
	}
	.empty {
		margin: 4px 0;
		color: var(--dim2);
	}
	.runs {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		border-bottom: 1px solid var(--hairline);
	}
	.run {
		display: grid;
		grid-template-columns: 9.5em 8em 1fr;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 4px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-xs);
		text-align: left;
		cursor: pointer;
	}
	.run:hover:not(:disabled) {
		background: var(--surface2);
	}
	.run:disabled {
		cursor: default;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}
	.status i {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--dim2);
		flex: none;
	}
	.status.done i {
		background: var(--ok);
	}
	.status.failed {
		color: var(--err);
	}
	.status.failed i {
		background: var(--err);
	}
	.status.waiting i {
		background: var(--warn);
	}
	.status.running i,
	.status.preparing i,
	.status.background i {
		background: var(--accent-bright);
	}
	.at {
		font-variant-numeric: tabular-nums;
		color: var(--dim);
	}
	.detail {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		min-width: 0;
		color: var(--dim2);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.error {
		padding: 0 4px 6px calc(9.5em + 14px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-xs);
		color: var(--dim);
	}
</style>
