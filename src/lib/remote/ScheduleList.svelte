<script lang="ts">
	// The phone's 定时任务 list: every agent's scheduled tasks with how the
	// latest run is going (后台任务运行中 included), a switch and 立即运行.
	// Creating and editing a task stays on the computer.
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import Switch from '$lib/ui/Switch.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import { useAgents } from '$lib/agentScope';
	import { runGoing, runStatusKey, stoppedByFailures, summary, type Schedule } from '$lib/schedules';
	import { t } from '$lib/i18n';
	import { when } from './desk';

	let {
		limit,
		onOpenSession
	}: {
		/** Show at most this many (the soonest first); all when absent. */
		limit?: number;
		onOpenSession: (session: string) => void;
	} = $props();

	const agentDirectory = useAgents();
	// Running ones first, then the soonest next run, then the switched off.
	const order = (s: Schedule) => (runGoing(s) ? 0 : s.enabled && s.next_run_at ? s.next_run_at : Number.MAX_SAFE_INTEGER);
	const schedules = $derived(
		[...agentDirectory.schedules].sort((a, b) => order(a) - order(b) || a.created_at - b.created_at).slice(0, limit ?? Infinity)
	);
	let starting = $state<Record<string, boolean>>({});

	async function act(work: () => Promise<unknown>) {
		try {
			await work();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		}
	}

	function run(s: Schedule) {
		starting[s.id] = true;
		setTimeout(() => (starting[s.id] = false), 1500);
		void act(async () => {
			await agentDirectory.runSchedule(s.id);
			toast.success(t('shell.schedule.started', { name: s.name }));
		});
	}

	function meta(s: Schedule): string {
		const parts = [agentDirectory.agentName(s.agent), summary(s)];
		if (stoppedByFailures(s)) parts.push(t('shell.schedule.stoppedAfter', { n: s.failures ?? 0 }));
		else if (!s.enabled) parts.push(t('shell.schedule.off'));
		else if (s.next_run_at) parts.push(t('shell.schedule.next', { time: when(s.next_run_at * 1000) }));
		return parts.join(' · ');
	}
</script>

{#each schedules as s (s.id)}
	{@const status = s.last_run?.status}
	{@const going = runGoing(s)}
	<div class="row" class:off={!s.enabled}>
		<button class="text" disabled={!s.last_run?.session} onclick={() => s.last_run?.session && onOpenSession(s.last_run.session)}>
			<span class="title">
				{#if going}<CircleNotchIcon size={13} class="spin" />{/if}
				<span class="name">{s.name}</span>
				{#if status && status !== 'done'}
					<span class="state {status}">
						{status === 'failed' && s.enabled && (s.failures ?? 0) > 1
							? t('shell.schedule.failuresInRow', { n: s.failures ?? 0 })
							: t(runStatusKey(status))}
					</span>
				{/if}
			</span>
			<span class="meta">{meta(s)}</span>
		</button>
		<button
			class="mini"
			disabled={starting[s.id] || going}
			onclick={() => run(s)}
			aria-label={t('shell.schedule.runNow')}
			title={t('shell.schedule.runNow')}
		>
			<PlayIcon size={16} />
		</button>
		<Switch
			checked={s.enabled}
			label={t('shell.schedule.enabled')}
			onChange={(enabled) => act(() => agentDirectory.setScheduleEnabled(s.id, enabled))}
		/>
	</div>
{:else}
	<p class="empty">{t('shell.schedule.empty')}</p>
{/each}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 52px;
		padding: 4px 8px 4px 12px;
		border-radius: var(--r-md);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.text:disabled {
		cursor: default;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		font-size: var(--fs-sm);
	}
	.title :global(svg) {
		flex: none;
		color: var(--accent-bright);
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row.off .name {
		color: var(--dim);
	}
	.state {
		flex: none;
		font-size: var(--fs-2xs);
		color: var(--accent-bright);
	}
	.state.waiting {
		color: var(--warn);
	}
	.state.failed {
		color: var(--err);
	}
	.meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.mini {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: var(--r-md);
		background: none;
		color: var(--dim);
		-webkit-tap-highlight-color: transparent;
	}
	.mini:active:not(:disabled) {
		background: var(--surface2);
	}
	.mini:disabled {
		opacity: 0.4;
	}
	.empty {
		margin: 0;
		padding: 4px 12px;
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
</style>
