<script lang="ts">
	// Engine-backend mark: LynShen's mark for its own engine (lynshen-mark.svg:
	// two trunks in the text colour, the light --lynshen-light, drawn on a 16px
	// grid), monochrome vendor SVGs for codex (OpenAI) / claude, OpenCode's own
	// mark for an ACP session of OpenCode (`agent`), and a generic plug for
	// other ACP agents (lobehub's pi.svg is another company's Pi).
	import lynshen from '$lib/lynshen-mark.svg?raw';
	import openai from '@lobehub/icons-static-svg/icons/openai.svg?raw';
	import claude from '@lobehub/icons-static-svg/icons/claude.svg?raw';
	import opencode from '@lobehub/icons-static-svg/icons/opencode.svg?raw';
	import PlugIcon from 'phosphor-svelte/lib/PlugIcon';
	import type { BackendId } from '$lib/backends';

	let {
		backend,
		agent,
		size = 14
	}: {
		backend: BackendId;
		/** ACP: the agent's id ('opencode' has its mark). */
		agent?: string;
		size?: number;
	} = $props();
</script>

{#if backend === 'lynshen'}
	<span class="mark" style:font-size="{size}px" aria-hidden="true">{@html lynshen}</span>
{:else if backend === 'codex'}
	<span class="mark" style:font-size="{size}px" aria-hidden="true">{@html openai}</span>
{:else if backend === 'claude'}
	<span class="mark claude" style:font-size="{size}px" aria-hidden="true">{@html claude}</span>
{:else if backend === 'acp' && agent === 'opencode'}
	<span class="mark" style:font-size="{size}px" aria-hidden="true">{@html opencode}</span>
{:else if backend === 'acp'}
	<span class="mark acp" style:font-size="{size}px" aria-hidden="true"><PlugIcon size={size} /></span>
{/if}

<style>
	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		flex-shrink: 0;
		color: currentColor;
	}
	.mark.acp {
		color: var(--dim);
	}
	.mark :global(svg) {
		width: 1em;
		height: 1em;
	}
</style>
