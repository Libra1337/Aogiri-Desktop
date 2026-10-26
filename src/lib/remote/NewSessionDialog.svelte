<script lang="ts">
	// Start a session from the remote app: pick the project and the engine
	// that runs it: LynShen, Claude Code, Codex, or one of the computer's
	// built-in ACP agents (a daemon with `acp_presets`; the daemon starts it
	// by id). Chats run on LynShen only (the chat mode is LynShen's).
	import { untrack } from 'svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Select from '$lib/ui/Select.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import type { ProjectView } from './store.svelte';
	import { useHost } from './connection.svelte';
	import { t } from '$lib/i18n';
	import { CHATS_ENABLED } from '$lib/types';
	import BackendIcon from '$lib/BackendIcon.svelte';
	import { engineHas } from '$lib/engineVersion.svelte';
	import type { AcpBuiltin } from '$lib/protocol';
	import { pickEngines, type EngineRow } from './engines';

	let {
		project,
		onCreate,
		onClose
	}: {
		/** Preselected project; any project of the active workspace otherwise. */
		project?: ProjectView;
		onCreate: (project: ProjectView, engine: string, acpAgent?: { id: string; name: string; noApprovals?: boolean }) => void;
		onClose: () => void;
	} = $props();
	const conn = useHost();
	const remoteProjects = conn.projects;
	// The computer's built-in agents, asked once per connection.
	let builtins = $state<AcpBuiltin[]>([]);
	$effect(() => {
		if (engineHas('acp_presets')) conn.acpBuiltins().then((list) => (builtins = list), () => {});
	});

	const projects = $derived((remoteProjects.active?.projects ?? []).filter((p) => CHATS_ENABLED || !p.chats));
	let projectId = $state(untrack(() => project?.id ?? ''));
	$effect(() => {
		if (!projectId && projects.length) projectId = projects[0].id;
	});
	const chosen = $derived(projects.find((p) => p.id === projectId) ?? project);
	let engine = $state('lynshen');
	const rows = $derived<EngineRow[]>(
		chosen?.chats ? pickEngines([], false).slice(0, 1) : pickEngines(builtins, conn.may('full_auto'), t('shell.remote.scope.lockedDesc'))
	);
	const native = $derived(rows.filter((r) => r.engine !== 'acp').map((r) => ({ value: r.key, label: r.label })));
	const agentRows = $derived(rows.filter((r) => r.engine === 'acp'));
	const picked = $derived(rows.find((r) => r.key === engine));
	$effect(() => {
		if (!picked || picked.disabled) engine = 'lynshen';
	});
	function start() {
		if (!chosen || !picked) return;
		if (picked.engine === 'acp' && picked.agent)
			onCreate(chosen, 'acp', { id: picked.agent, name: picked.label, ...(picked.noApprovals ? { noApprovals: true } : {}) });
		else onCreate(chosen, picked.key);
	}
	const label = (p: ProjectView) => (p.chats ? t('shell.remote.chats') : p.name);
</script>

<Modal title={t('shell.remote.newSession')} width={420} {onClose}>
	<div class="form">
		{#if !project}
			<div class="field">
				<span class="caption">{t('shell.remote.project')}</span>
				<Select
					value={projectId}
					options={projects.map((p) => ({ value: p.id, label: label(p) }))}
					onChange={(v) => (projectId = v)}
				/>
			</div>
		{/if}
		<div class="field">
			<span class="caption">{t('shell.remote.engine')}</span>
			<Segmented bind:value={engine} options={native} />
			{#if agentRows.length}
				<span class="caption sub">{t('settings.acp.builtins')}</span>
				<div class="agents" role="radiogroup" aria-label={t('settings.acp.builtins')}>
					{#each agentRows as r (r.key)}
						<button
							class="agent"
							class:on={engine === r.key}
							role="radio"
							aria-checked={engine === r.key}
							disabled={r.disabled}
							data-agent={r.agent}
							onclick={() => (engine = r.key)}
						>
							<BackendIcon backend="acp" agent={r.agent} size={16} />
							<span class="aname">{r.label}</span>
							{#if r.note}<span class="anote" class:warn={!r.disabled && r.noApprovals}>{r.note}</span>{/if}
						</button>
					{/each}
				</div>
				{#if picked?.noApprovals}<p class="warnline">{t('chat.noApprovalHint')}</p>{/if}
			{/if}
		</div>
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={onClose}>{t('common.cancel')}</Button>
		<Button variant="primary" disabled={!chosen || !picked || picked.disabled} onclick={start}>
			{t('shell.remote.create')}
		</Button>
	{/snippet}
</Modal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.caption {
		font-size: var(--fs-sm);
		color: var(--dim);
	}
	.caption.sub {
		margin-top: 4px;
		font-size: var(--fs-xs);
	}
	.agents {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.agent {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: var(--r-md);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
	}
	.agent.on {
		border-color: var(--border);
		background: var(--surface2);
	}
	.agent:disabled {
		color: var(--dim2);
	}
	.aname {
		flex: 1;
		min-width: 0;
	}
	.anote {
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.anote.warn,
	.warnline {
		color: var(--warn);
	}
	.warnline {
		margin: 0;
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
</style>
