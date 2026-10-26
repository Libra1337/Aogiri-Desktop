<script lang="ts">
	// A count that rolls to its value while it is `live` (an edit still
	// streaming grows its line counts): up from 0 when it appears live, then
	// from where it is on each change. Not live, and under reduced motion, it
	// shows the value at once.
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { untrack } from 'svelte';
	import { motionMs } from './motion';

	let { value, live = false }: { value: number; live?: boolean } = $props();

	/** Longer for a bigger change, within a glance (≤ --t-enter). */
	const span = (from: number, to: number) => motionMs(Math.min(400, 160 + 50 * Math.log2(1 + Math.abs(to - from))));
	const count = new Tween(untrack(() => (live ? 0 : value)), { easing: cubicOut });
	$effect(() => {
		const to = value;
		untrack(() => count.set(to, { duration: live ? span(count.current, to) : 0 }));
	});
</script>

{Math.round(count.current)}
