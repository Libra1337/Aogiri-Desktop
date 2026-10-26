<script lang="ts">
	// Settings → 编码智能体 → Claude Code / Codex: the tool's own custom
	// providers (an API and a key the user brings). A list (each opens its
	// editor), and which one new conversations start on; a conversation keeps
	// the provider it started on. The daemon keeps them and their keys
	// (`tool_providers`); requests go to the provider with its key alone,
	// never with the LynShen account. A daemon without the feature: a note.
	import { onMount } from 'svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import KeyIcon from 'phosphor-svelte/lib/KeyIcon';
	import type { ProviderTool, ToolApiProvider } from '$lib/protocol';
	import { changeToolProviders, loadToolProviders, toolProviderConfigs } from '$lib/toolProviders.svelte';
	import { engineHas } from '$lib/engineVersion.svelte';
	import { BACKEND_LABELS } from '$lib/backends';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import Select from '$lib/ui/Select.svelte';
	import { confirm } from '$lib/ui/confirm.svelte';
	import { t } from '$lib/i18n';
	import ToolProviderEditor from './ToolProviderEditor.svelte';

	let { tool }: { tool: ProviderTool } = $props();

	const toolName = $derived(BACKEND_LABELS[tool]);
	const supported = $derived(engineHas('tool_providers'));
	const config = $derived(toolProviderConfigs[tool]);
	const providers = $derived(config?.providers ?? []);

	// The Select's value, put back to the saved one when a change fails.
	let selected = $state('');
	let busy = $state(false);
	let listError = $state('');
	// The editor: null when closed, 'new' to add, else the provider edited.
	let editing = $state<ToolApiProvider | 'new' | null>(null);

	$effect(() => {
		selected = config?.selected ?? '';
	});

	const options = $derived([
		{ value: '', label: t('settings.toolProviders.system', { tool: toolName }) },
		...providers.map((p) => ({ value: p.id, label: p.name }))
	]);

	const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
	const host = (url: string) => {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	};

	async function load() {
		try {
			await loadToolProviders(tool, true);
			listError = '';
		} catch (e) {
			listError = t('settings.toolProviders.loadFailed', { msg: message(e) });
		}
	}

	async function select(id: string) {
		busy = true;
		try {
			await changeToolProviders(tool, 'tool_provider_select', { provider_id: id });
			listError = '';
		} catch (e) {
			listError = message(e);
			selected = config?.selected ?? '';
		} finally {
			busy = false;
		}
	}

	async function remove(p: ToolApiProvider) {
		const ok = await confirm({
			title: t('settings.toolProviders.deleteTitle', { name: p.name }),
			message: t('settings.toolProviders.deleteMessage', { tool: toolName }),
			confirmLabel: t('settings.toolProviders.remove'),
			danger: true
		});
		if (!ok) return;
		busy = true;
		try {
			await changeToolProviders(tool, 'tool_provider_remove', { provider_id: p.id });
			listError = '';
		} catch (e) {
			listError = message(e);
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		if (supported) void load();
	});
</script>

<div class="tp" id="set-providers-{tool}">
	<div class="tphead">
		<span class="title"><KeyIcon size={13} /> {t('settings.toolProviders.title')}</span>
		<span class="grow"></span>
		{#if supported && config}
			<Button variant="ghost" size="sm" disabled={busy} onclick={() => (editing = 'new')}>
				<PlusIcon size={14} />
				{t('settings.toolProviders.add')}
			</Button>
		{/if}
	</div>
	{#if !supported}
		<p class="hint">{t('settings.toolProviders.oldDaemon')}</p>
	{:else}
		<p class="hint">{t('settings.toolProviders.hint', { tool: toolName })}</p>
		{#if listError}
			<Notice onDismiss={config ? () => (listError = '') : undefined}>{listError}</Notice>
			{#if !config}
				<div><Button size="sm" onclick={load}>{t('common.retry')}</Button></div>
			{/if}
		{/if}
		{#if providers.length}
			<div class="list">
				{#each providers as p (p.id)}
					<div class="prow">
						<button class="pmain" disabled={busy} onclick={() => (editing = p)} title={t('settings.toolProviders.edit')}>
							<span class="pline">
								<span class="pname">{p.name}</span>
								{#if config?.selected === p.id}<span class="ptag">{t('settings.toolProviders.isDefault')}</span>{/if}
							</span>
							<span class="pdetail" title={p.base_url}>
								{host(p.base_url)} · {t('settings.toolProviders.modelCount', { n: String(p.models.length) })} · {p.model}
								{#if p.has_key} · ••••••••{/if}
							</span>
						</button>
						<IconButton
							size="sm"
							disabled={busy}
							onclick={() => remove(p)}
							label={t('settings.toolProviders.remove')}
							title={t('settings.toolProviders.remove')}
						>
							<TrashIcon size={14} />
						</IconButton>
					</div>
				{/each}
			</div>
			<div class="defrow">
				<span class="deflabel">{t('settings.toolProviders.defaultLabel')}</span>
				<div class="selw"><Select bind:value={selected} {options} disabled={busy} onChange={select} /></div>
			</div>
		{/if}
	{/if}
</div>

{#if editing}
	<ToolProviderEditor
		{tool}
		provider={editing === 'new' ? undefined : editing}
		taken={providers.map((p) => p.id)}
		onClose={() => (editing = null)}
	/>
{/if}

<style>
	.tp {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.tphead {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 28px;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.title :global(svg) {
		color: var(--dim);
	}
	.grow {
		flex: 1;
	}
	.hint {
		margin: 0;
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.prow {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		padding-right: 4px;
		border-radius: var(--r-sm);
		transition: background var(--t-fast) var(--ease-out);
	}
	.prow + .prow {
		border-top: 1px solid var(--hairline);
	}
	.prow:hover {
		background: var(--surface2);
	}
	.pmain {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: 8px 8px;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pmain:focus-visible {
		outline: 2px solid var(--brand-bright);
		outline-offset: -2px;
		border-radius: var(--r-sm);
	}
	.pline {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.pname {
		overflow: hidden;
		font-size: var(--fs-sm);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ptag {
		flex: none;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: var(--r-sm);
		color: var(--dim);
		font-size: var(--fs-2xs);
	}
	.pdetail {
		overflow: hidden;
		color: var(--dim2);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.defrow {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 2px;
	}
	.deflabel {
		color: var(--dim);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
	.selw {
		width: 280px;
		max-width: 100%;
	}
</style>
