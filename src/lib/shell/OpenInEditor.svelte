<script lang="ts">
	// The title bar's 在 VS Code 中打开: the project folder opens in the editor
	// last chosen; the caret lists the editors installed on this computer
	// (editors.rs), with their own app icons. Nothing shows when none is.
	import { onMount } from 'svelte';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
	import { t } from '$lib/i18n';
	import { editors } from '$lib/editors.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import PopMenu from '$lib/ui/PopMenu.svelte';

	let { path }: { path: string } = $props();

	let menuOpen = $state(false);
	onMount(() => void editors.load());

	const editor = $derived(editors.preferred);

	async function open(id: string) {
		menuOpen = false;
		const name = editors.list.find((e) => e.id === id)?.name ?? id;
		await editors.open(id, path).catch((e) => toast.error(t('editor.external.failed', { name, error: String(e) })));
	}
	function toggleMenu() {
		menuOpen = !menuOpen;
		if (menuOpen) void editors.load();
	}
</script>

{#if editor}
	<div class="oie" class:open={menuOpen}>
		<button class="main" title={t('editor.external.openIn', { name: editor.name })} aria-label={t('editor.external.openIn', { name: editor.name })} onclick={() => open(editor.id)}>
			{#if editor.icon}<img src={editor.icon} alt="" width="16" height="16" />{:else}<CodeIcon size={16} />{/if}
		</button>
		<button class="more" title={t('editor.external.choose')} aria-label={t('editor.external.choose')} aria-expanded={menuOpen} onclick={toggleMenu}>
			<CaretDownIcon size={10} />
		</button>
		{#if menuOpen}
			<PopMenu
				title={t('editor.external.choose')}
				items={editors.list.map((e) => ({ key: e.id, label: e.name, img: e.icon ?? undefined, icon: e.icon ? undefined : CodeIcon, checked: e.id === editor.id }))}
				onSelect={open}
				onClose={() => (menuOpen = false)}
			/>
		{/if}
	</div>
{/if}

<style>
	/* One 28px title bar button (design.md §3 Title bar) with a narrow caret
	   beside it; the pair shares the hover fill. */
	.oie {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 28px;
		border-radius: var(--r-sm);
	}
	.oie:hover,
	.oie.open {
		background: var(--surface2);
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		cursor: pointer;
	}
	.main {
		width: 28px;
	}
	.more {
		width: 14px;
		margin-left: -4px;
	}
	.oie:hover button,
	.oie.open button {
		color: var(--text);
	}
	img {
		display: block;
	}
</style>
