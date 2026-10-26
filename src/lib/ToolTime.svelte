<script lang="ts">
	// How long a tool call, or a run of calls, took: the union of the calls'
	// spans (runTime), mono --fs-2xs --dim2. It ticks only while a call runs
	// and the page shows (visibleInterval); a call replayed from a transcript
	// has no time and shows none.
	import { visibleInterval } from '$lib/visibleInterval';
	import { runTime } from '$lib/toolSummary';
	import { fmtDur } from '$lib/turnStats';

	let { spans }: { spans: readonly { startedAt?: number; endedAt?: number; running: boolean }[] } = $props();

	const running = $derived(spans.some((x) => x.running && x.startedAt));
	let now = $state(Date.now());
	$effect(() => {
		if (!running) return;
		now = Date.now();
		return visibleInterval(() => (now = Date.now()), 100);
	});
	const took = $derived(runTime(spans, now));
	/** Tenths of a second while it runs (no "230ms" flicker), then the turn's format. */
	const text = $derived(took === null || (took === 0 && !running) ? '' : running && took < 60_000 ? `${(took / 1000).toFixed(1)}s` : fmtDur(took));
</script>

{#if text}<span class="took">{text}</span>{/if}

<style>
	.took {
		flex-shrink: 0;
		color: var(--dim2);
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
