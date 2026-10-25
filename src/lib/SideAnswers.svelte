<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { t } from '$lib/i18n';
	import type { ChatState } from '$lib/chat.svelte';

	// Above the transcript: the session's /btw answers, which are beside the
	// conversation, never part of it. Background work lists in the subagents
	// card (agents/BackgroundCommands.svelte).
	let { chat }: { chat: ChatState } = $props();
</script>

{#if chat.sideAnswers.length}
	<div class="strip">
		{#each chat.sideAnswers as a, i (i)}
			<div class="side">
				<div class="row">
					<span class="kind">{t('chat.btw.label')}</span>
					<span class="q">{a.question}</span>
					<span class="grow"></span>
					<IconButton size="sm" label={t('chat.btw.dismiss')} title={t('chat.btw.dismiss')} onclick={() => chat.sideAnswers.splice(i, 1)}>
						<XIcon size={13} />
					</IconButton>
				</div>
				{#if a.pending}
					<span class="dim"><CircleNotchIcon size={12} class="spin" /> {t('chat.btw.pending')}</span>
				{:else if a.error}
					<span class="dim">{a.error}</span>
				{:else}
					<div class="answer">{a.answer || t('chat.btw.empty')}</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/* A top strip (design.md, "Workbench canvas"): opaque --bg, a hairline
	   under it, outside the scrolling transcript. */
	.strip {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 18px;
		border-bottom: 1px solid var(--hairline);
		background: var(--bg);
		font-size: var(--fs-xs);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--dim);
	}
	.kind {
		color: var(--dim2);
		white-space: nowrap;
	}
	.q {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}
	.grow {
		flex: 1;
	}
	.answer {
		padding-left: 2px;
		color: var(--text);
		white-space: pre-wrap;
		line-height: 1.55;
	}
	.dim {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--dim2);
	}
</style>
