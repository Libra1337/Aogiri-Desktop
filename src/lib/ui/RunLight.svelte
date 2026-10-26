<script lang="ts">
	// The running light over a line of the transcript (a tool call at work):
	// the navigator's sweep (ui/shimmer.ts, Sidebar.svelte .veil) on the same
	// clock, its veil in the colour under the line, which the parent sets as
	// --row-bg (default --bg). The parent is `position: relative` and clips
	// it. Reduced motion or a background image under the canvas: no veil, the
	// words stay as they are.
	import { shimmer } from './shimmer';
</script>

<i class="veil" aria-hidden="true" use:shimmer={'canvas'}></i>

<style>
	.veil {
		--veil: 30%;
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 300%;
		pointer-events: none;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--row-bg, var(--bg)) var(--veil), transparent) 0%,
			color-mix(in srgb, var(--row-bg, var(--bg)) var(--veil), transparent) 42%,
			transparent 50%,
			color-mix(in srgb, var(--row-bg, var(--bg)) var(--veil), transparent) 58%,
			color-mix(in srgb, var(--row-bg, var(--bg)) var(--veil), transparent) 100%
		);
		transform: translateX(-60%);
	}
	:global([data-theme='light']) .veil {
		--veil: 22%;
	}
	:global(:root[data-canvas-bg]) .veil {
		display: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.veil {
			display: none;
		}
	}
</style>
