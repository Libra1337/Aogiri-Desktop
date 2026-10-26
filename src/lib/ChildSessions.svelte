<script lang="ts">
	// The conversations a turn started (`start_session`): one row each, the
	// engine, the title and where it is now (sent, replied, waiting for your
	// approval there, still at work); a click opens it. A conversation
	// waiting for an approval shows the --warn dot (design.md "Status,
	// attention and emphasis").
	import ChatCircleDotsIcon from 'phosphor-svelte/lib/ChatCircleDotsIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { BACKEND_LABELS, type BackendId } from '$lib/backends/types';
	import { conversationTitle } from '$lib/sessions/sessionMessage';
	import type { ChildSession } from '$lib/turnSummary';
	import { t } from '$lib/i18n';

	let { sessions, onOpen }: { sessions: ChildSession[]; onOpen?: (session: string) => void } = $props();
	const engineLabel = (e: string) => BACKEND_LABELS[(e || 'lynshen') as BackendId] ?? e;
</script>

<div class="children" aria-label={t('chat.children.label')}>
	{#each sessions as s (s.session)}
		<button class="row" disabled={!onOpen} onclick={() => onOpen?.(s.session)} title={onOpen ? t('chat.children.open') : undefined}>
			<ChatCircleDotsIcon size={14} />
			<span class="engine">{engineLabel(s.engine)}</span>
			<span class="title">{conversationTitle(s.title)}</span>
			{#if s.status}
				<span class="state" class:wait={s.status === 'waiting_approval'} class:ok={s.status === 'replied'}>{t(`chat.children.status.${s.status}`)}</span>
			{/if}
			{#if onOpen}<span class="go"><CaretRightIcon size={13} /></span>{/if}
		</button>
	{/each}
</div>

<style>
	.children {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		background: var(--surface);
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--t-fast) var(--ease-base),
			color var(--t-fast) var(--ease-base);
	}
	.row:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.row:disabled {
		cursor: default;
	}
	.row :global(svg) {
		flex-shrink: 0;
	}
	.engine {
		flex-shrink: 0;
		font-weight: 500;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		font-size: var(--fs-xs);
		color: var(--dim);
	}
	.state.ok {
		color: var(--ok);
	}
	.state.wait::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warn);
	}
	.go {
		display: inline-flex;
		color: var(--dim2);
	}
</style>
