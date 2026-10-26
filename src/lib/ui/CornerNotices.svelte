<script lang="ts">
	// Renders ui/notices.svelte.ts in the window's bottom-right corner, left
	// of the built-in browser when it covers that corner (the browser is a
	// native view over the page: a notice under it could not be seen), and
	// above the composer when the corner holds it (a narrow window), so the
	// send button stays in reach. A
	// raised card (--panel, --shadow-pop, --r-lg; glass like toasts): the
	// title, an address in mono, one action and ×. In from below, out to the
	// right; the rest slide into place. Reduced motion: at once.
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { T_FAST, T_MED, motionMs } from './motion';
	import { notices } from './notices.svelte';
	import { browser } from '$lib/browser.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { t } from '$lib/i18n';

	const EDGE = 16;
	/** The corner a stack takes, to test against the browser. */
	const AREA_W = 360;
	const AREA_H = 160;

	let vw = $state(0);
	let vh = $state(0);

	// The composers in the corner's way (each chat pane's bottom block),
	// measured when a notice shows and as the window resizes.
	let lift = $state(EDGE);
	const shown = $derived(notices.items.length > 0);
	function measure() {
		let bottom = EDGE;
		const from = vw - right - AREA_W;
		for (const el of document.querySelectorAll<HTMLElement>('.chatpane .bottom')) {
			const r = el.getBoundingClientRect();
			if (r.width && r.right > from && r.left < vw - right && r.bottom > vh - AREA_H) bottom = Math.max(bottom, vh - r.top + 8);
		}
		lift = bottom;
	}
	$effect(() => {
		if (!shown) return;
		void vw;
		void vh;
		void right;
		measure();
		const raf = requestAnimationFrame(measure);
		return () => cancelAnimationFrame(raf);
	});

	const right = $derived.by(() => {
		const r = browser.shown;
		if (!r) return EDGE;
		const z = prefs.zoom || 1;
		const left = r.x / z;
		const bottom = (r.y + r.h) / z;
		const covers = left + r.w / z > vw - AREA_W && bottom > vh - AREA_H;
		return covers ? Math.max(EDGE, vw - left + EDGE) : EDGE;
	});
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<!-- Not under an {#if}: the first notice's entrance and the last one's exit
     would not play (transitions are local to their block). -->
<div class="notices" style:right="{right}px" style:bottom="{lift}px" role="region" aria-live="polite" aria-label={t('common.notices')}>
	{#each notices.items as n (n.id)}
		<div
			class="notice toast"
			role="status"
			onpointerenter={() => notices.hold(n.id)}
			onpointerleave={() => notices.resume(n.id)}
			animate:flip={{ duration: motionMs(T_MED), easing: cubicOut }}
			in:fly={{ y: 8, duration: motionMs(T_MED), easing: cubicOut }}
			out:fly={{ x: 12, duration: motionMs(T_FAST), easing: cubicOut }}
		>
			<div class="body">
				<div class="title">{n.title}</div>
				{#if n.detail}<div class="detail selectable" title={n.detail}>{n.detail}</div>{/if}
			</div>
			{#if n.action}
				<button
					class="act"
					onclick={() => {
						n.action?.run();
						notices.dismiss(n.id);
					}}>{n.action.label}</button
				>
			{/if}
			<button class="close" aria-label={t('common.close')} title={t('common.close')} onclick={() => notices.dismiss(n.id)}><XIcon size={14} /></button>
		</div>
	{/each}
</div>

<style>
	.notices {
		position: fixed;
		bottom: 16px;
		z-index: 190;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		max-width: calc(100vw - 32px);
		pointer-events: none;
		transition:
			right var(--t-med) var(--ease-out),
			bottom var(--t-med) var(--ease-out);
	}
	.notice {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 340px;
		/* Not 100%: a leaving notice is out of the flow (animate:flip), and
		   the last one would leave the stack zero wide and squeeze it. */
		max-width: calc(100vw - 32px);
		padding: 10px 8px 10px 14px;
		border-radius: var(--r-lg);
		background: var(--panel);
		box-shadow: var(--shadow-pop);
		color: var(--text);
		font-size: var(--fs-sm);
		pointer-events: auto;
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.title {
		line-height: 18px;
	}
	.detail {
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}
	.act {
		flex-shrink: 0;
		padding: 4px 10px;
		border: none;
		border-radius: var(--r-sm);
		background: var(--surface2);
		color: inherit;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		transition: background var(--t-fast) var(--ease-base);
	}
	.act:hover {
		background: color-mix(in oklab, var(--text) 12%, transparent);
	}
	.close {
		display: inline-flex;
		flex-shrink: 0;
		padding: 4px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		cursor: pointer;
	}
	.close:hover {
		color: var(--text);
		background: var(--surface2);
	}
	@media (prefers-reduced-motion: reduce) {
		.notices {
			transition: none;
		}
	}
</style>
