<script lang="ts">
	// Files dragged over the window: the whole window takes them for the
	// conversation in front (design.md, "Workbench canvas"). A dashed frame
	// inside the window says so and counts them; it takes no pointer events,
	// so the drop lands where the system sends it (+page.svelte attaches it).
	import FileArrowUpIcon from 'phosphor-svelte/lib/FileArrowUpIcon';
	import { fade } from 'svelte/transition';
	import { motionMs } from '$lib/ui/motion';
	import { t } from '$lib/i18n';

	let { count }: { count: number } = $props();
</script>

<div class="droplayer" aria-hidden="true" in:fade={{ duration: motionMs(160) }} out:fade={{ duration: motionMs(120) }}>
	<div class="dropframe">
		<FileArrowUpIcon size={28} />
		<span class="droptitle">{t('shell.drop.title')}</span>
		<span class="dropcount">{t('shell.drop.count', { n: count })}</span>
	</div>
</div>

<style>
	.droplayer {
		position: fixed;
		inset: 0;
		z-index: 400;
		display: grid;
		padding: 14px;
		background: color-mix(in oklab, var(--bg) 72%, transparent);
		pointer-events: none;
	}
	.dropframe {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--r-xl);
		color: var(--text);
		animation: pop-in var(--t-pop) var(--ease-out) both;
	}
	.droptitle {
		font-size: var(--fs-lg);
		font-weight: 600;
	}
	.dropcount {
		color: var(--dim);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
