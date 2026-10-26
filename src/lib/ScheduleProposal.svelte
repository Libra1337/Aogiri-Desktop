<script lang="ts">
	// A scheduled task the agent proposed (`propose_schedule`). Nothing is
	// scheduled until the user creates it: 创建 opens the task dialog filled
	// in from the proposal (onCreate); the task keeps the proposal's id
	// (`origin`), so the card then says 已创建. 不用了 sets it aside here.
	// Where tasks can't be created (no handler: the phone page, a daemon
	// without `origin`), the card only shows the proposal.
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import Button from '$lib/ui/Button.svelte';
	import { summary } from '$lib/schedules';
	import type { Proposal } from '$lib/turnSummary';
	import { t } from '$lib/i18n';

	let {
		proposal,
		created = false,
		declined = false,
		onCreate,
		onDecline
	}: {
		proposal: Proposal;
		created?: boolean;
		declined?: boolean;
		onCreate?: (proposal: Proposal) => void;
		onDecline?: (proposal: Proposal) => void;
	} = $props();

	const when = $derived(summary({ repeat: proposal.repeat, time: proposal.time, days: proposal.days ?? null, date: proposal.date ?? null }));
</script>

<div class="proposal" class:settled={created || declined}>
	<span class="icon"><CalendarPlusIcon size={16} /></span>
	<div class="text">
		<span class="label">{t('chat.proposal.title')} · {when}</span>
		<span class="name">{proposal.name}</span>
		{#if proposal.prompt}<span class="prompt">{proposal.prompt}</span>{/if}
	</div>
	{#if created}
		<span class="done"><CheckIcon size={14} />{t('chat.proposal.created')}</span>
	{:else if declined}
		<span class="done">{t('chat.proposal.declined')}</span>
	{:else if onCreate}
		<div class="acts">
			{#if onDecline}<Button size="sm" variant="ghost" onclick={() => onDecline(proposal)}>{t('chat.proposal.decline')}</Button>{/if}
			<Button size="sm" variant="primary" onclick={() => onCreate(proposal)}>{t('chat.proposal.create')}</Button>
		</div>
	{/if}
</div>

<style>
	.proposal {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 12px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		background: var(--surface);
	}
	.icon {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--r-md);
		background: var(--surface2);
		color: var(--dim);
	}
	.text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label {
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	.name {
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: 500;
	}
	.prompt {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
	.acts {
		display: flex;
		flex-shrink: 0;
		gap: 6px;
	}
	.done {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 5px;
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	.settled .icon {
		color: var(--dim2);
	}
</style>
