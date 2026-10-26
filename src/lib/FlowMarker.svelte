<script lang="ts">
	// A step of the conversation's own course, where it happened (Flow in
	// chat.svelte.ts): a hairline divider with what it was — the reader
	// stopped the turn, the engine restarted, the app reconnected to the
	// daemon, another model or provider, the turn picked up again, background
	// work done, a deferred action. Quiet enough to read past: --fs-xs --dim
	// on --hairline rules, like the compaction divider (CompactionCard).
	import PauseCircleIcon from 'phosphor-svelte/lib/PauseCircleIcon';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import PlugsIcon from 'phosphor-svelte/lib/PlugsIcon';
	import ArrowsLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRightIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import HandPalmIcon from 'phosphor-svelte/lib/HandPalmIcon';
	import { t } from '$lib/i18n';
	import type { Flow } from '$lib/chat.svelte';

	let { flow, text }: { flow: Flow; text: string } = $props();

	const ICONS = {
		interrupted: PauseCircleIcon,
		restart: ArrowsClockwiseIcon,
		reconnect: PlugsIcon,
		switch: ArrowsLeftRightIcon,
		fallback: ArrowsLeftRightIcon,
		retry: ArrowCounterClockwiseIcon,
		task: CheckCircleIcon,
		action: HandPalmIcon
	} as const;
	const Icon = $derived(ICONS[flow.type]);
	const label = $derived(flow.type === 'interrupted' ? t('chat.flow.interrupted') : text);
</script>

<div class="flow {flow.type}" role="note">
	<span class="rule" aria-hidden="true"></span>
	<span class="what" title={label}><Icon size={13} /><span class="label">{label}</span></span>
	<span class="rule" aria-hidden="true"></span>
</div>

<style>
	.flow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 2px 0;
		color: var(--dim2);
		font-size: var(--fs-xs);
		line-height: 16px;
	}
	.rule {
		flex: 1;
		min-width: 16px;
		height: 1px;
		background: var(--hairline);
	}
	.what {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 80%;
	}
	.what :global(svg) {
		flex-shrink: 0;
	}
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--dim);
	}
	/* The reader's own stop reads a step stronger. */
	.interrupted .label {
		color: var(--text);
	}
</style>
