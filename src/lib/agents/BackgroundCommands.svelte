<script lang="ts">
	// The session's background commands (shells, monitors: the engine's
	// background tasks that are not a subagent or a Workflow), under the
	// subagents in the subagents card, the phone's sheet and the agents tab.
	// One row each: a 6px state dot, what it runs, its latest output line,
	// and on hover or focus its output and a stop button. They outlive the
	// turn that started them; the session shows as having background work
	// meanwhile (sessionStatus).
	import StopIcon from 'phosphor-svelte/lib/StopIcon';
	import TerminalWindowIcon from 'phosphor-svelte/lib/TerminalWindowIcon';
	import { t } from '$lib/i18n';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { backgroundCommands } from '$lib/agentProgress';
	import { taskKindLabel, type ChatState } from '$lib/chat.svelte';

	let {
		chat,
		onStop,
		onOutput,
		heading = true
	}: {
		chat: ChatState;
		onStop?: (id: string) => void;
		/** Asks the engine for a task's output (task_output). */
		onOutput?: (id: string) => void;
		/** A 后台命令 heading over the rows (under the subagents). */
		heading?: boolean;
	} = $props();

	const commands = $derived(backgroundCommands(chat.bgTasks, chat.subagents));
	// Shell and Monitor tasks write output the engine can read back.
	const hasOutput = (kind: string) => kind.startsWith('local_bash') || kind.startsWith('monitor');
	let open = $state<string | null>(null);
	function toggle(id: string) {
		open = open === id ? null : id;
		if (open) onOutput?.(id);
	}
</script>

{#if commands.length}
	{#if heading}<div class="head">{t('chat.task.commands')}<span class="n">{commands.length}</span></div>{/if}
	<ul class="cmds">
		{#each commands as c (c.id)}
			{@const out = open === c.id ? chat.taskOutputs[c.id] : undefined}
			<li class="cmd">
				<button class="cmain" disabled={!onOutput || !hasOutput(c.kind)} aria-expanded={hasOutput(c.kind) ? open === c.id : undefined} title={c.description} onclick={() => toggle(c.id)}>
					<span class="l1">
						<span class="sdot pulse" role="img" aria-label={t('dock.agents.state.running')}></span>
						<TerminalWindowIcon size={12} />
						<span class="cname">{c.description || taskKindLabel(c.kind)}</span>
					</span>
					<span class="msg">{c.message || taskKindLabel(c.kind)}</span>
				</button>
				{#if onStop}
					<span class="cacts">
						<IconButton size="xs" label={t('chat.task.stop')} title={t('chat.task.stop')} onclick={() => onStop(c.id)}><StopIcon size={12} /></IconButton>
					</span>
				{/if}
				{#if open === c.id}
					<div class="out">
						{#if !out}
							<span class="dim">{t('chat.task.loading')}</span>
						{:else if out.error}
							<span class="dim">{out.error}</span>
						{:else}
							{#if out.truncated}<span class="dim">{t('chat.task.truncated')}</span>{/if}
							<pre>{out.output || t('chat.task.noOutput')}</pre>
							<button class="again" onclick={() => onOutput?.(c.id)}>{t('chat.task.refresh')}</button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 6px 8px 2px;
		font-size: var(--fs-xs);
		font-weight: 600;
		line-height: 16px;
		color: var(--dim2);
	}
	.n {
		font-family: var(--font-mono);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.cmds {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cmd {
		position: relative;
		border-radius: var(--r-md);
		transition: background var(--t-fast) var(--ease-base);
	}
	.cmd:hover {
		background: var(--surface2);
	}
	.cmain {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 5px 8px;
		border: none;
		border-radius: inherit;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.cmain:disabled {
		cursor: default;
	}
	.cmain:focus-visible {
		outline-offset: -2px;
	}
	.l1 {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		line-height: 18px;
		color: var(--dim);
	}
	.sdot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: var(--r-full);
		background: var(--info);
	}
	.cname {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-sm);
		font-weight: 500;
		color: var(--text);
	}
	.msg {
		padding-left: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		line-height: 16px;
		color: var(--dim);
	}
	/* Over the first line's right end on hover and keyboard focus, on the
	   hovered row's fill (as the subagents' actions). */
	.cacts {
		position: absolute;
		top: 3px;
		right: 4px;
		display: inline-flex;
		padding: 1px;
		border-radius: var(--r-sm);
		background: linear-gradient(var(--surface2), var(--surface2)), var(--bg);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--t-fast) var(--ease-base);
	}
	.cmd:hover .cacts,
	.cmd:focus-within .cacts {
		opacity: 1;
		pointer-events: auto;
	}
	.out {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		margin: 0 8px 6px 20px;
		font-size: var(--fs-xs);
	}
	.out pre {
		box-sizing: border-box;
		width: 100%;
		max-height: 200px;
		margin: 0;
		padding: 6px 8px;
		overflow: auto;
		overscroll-behavior: contain;
		border-radius: var(--r-md);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.dim {
		color: var(--dim);
	}
	.again {
		padding: 0;
		border: none;
		background: none;
		color: var(--dim);
		font: inherit;
		cursor: pointer;
	}
	.again:hover {
		color: var(--text);
	}
	@media (hover: none) {
		.cacts {
			opacity: 1;
			pointer-events: auto;
		}
	}
</style>
