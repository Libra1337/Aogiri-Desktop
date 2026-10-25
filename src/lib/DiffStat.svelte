<script lang="ts">
	// Lines an edit added and removed, "+47 −9" in mono: --ok and --err. The
	// numbers roll while the edit is still being made (`live`); a row that
	// was never live renders them as text, with no animation behind it.
	import AnimatedCount from '$lib/ui/AnimatedCount.svelte';
	import { untrack } from 'svelte';

	let { add, del, live = false }: { add: number; del: number; live?: boolean } = $props();
	// Once live, the numbers keep their roll until the row goes.
	let rolls = $state(untrack(() => live));
	$effect(() => {
		if (live) rolls = true;
	});
</script>

<span class="dstat"
	><span class="add">+{#if rolls}<AnimatedCount value={add} {live} />{:else}{add}{/if}</span><span class="del">−{#if rolls}<AnimatedCount value={del} {live} />{:else}{del}{/if}</span></span
>

<style>
	.dstat {
		display: inline-flex;
		gap: 6px;
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.add {
		color: var(--ok);
	}
	.del {
		color: var(--err);
	}
</style>
