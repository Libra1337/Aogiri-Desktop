<script lang="ts">
	// Adds or edits one of Claude Code's / Codex's custom providers: its API
	// address, its key (never shown back: the daemon only says one is saved),
	// and the models a conversation may pick, read from the API's model list
	// (测试连接, which also checks the address and the key) or typed. One of
	// them is the default (new conversations, Claude Code's background
	// requests).
	import { untrack } from 'svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import PlugsConnectedIcon from 'phosphor-svelte/lib/PlugsConnectedIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import { toolProviderModels, type ToolListedModel, type ProviderTool, type ToolApiProvider } from '$lib/protocol';
	import { changeToolProviders, providerId, providerLabel, providerUrlOk } from '$lib/toolProviders.svelte';
	import { BACKEND_LABELS } from '$lib/backends';
	import { fmtContext } from '$lib/composer/modelRows';
	import Button from '$lib/ui/Button.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { t } from '$lib/i18n';

	let {
		tool,
		provider,
		taken,
		onClose
	}: {
		tool: ProviderTool;
		/** The provider edited; none to add one. */
		provider?: ToolApiProvider;
		/** Ids already in use (a new provider's id is made from its name). */
		taken: string[];
		onClose: () => void;
	} = $props();

	const format = $derived(tool === 'claude' ? 'anthropic' : 'responses');
	const formatName = $derived(t(`settings.catalog.protocol.${format}`));

	// The form starts from the provider as it was when opened.
	const saved = untrack(() => provider);
	let name = $state(saved?.name ?? '');
	let baseUrl = $state(saved?.base_url ?? '');
	let key = $state('');
	// The models a conversation may pick, in the order shown, and the default.
	let models = $state<string[]>(saved ? [...saved.models] : []);
	let def = $state(saved?.model ?? '');

	// The API's model list: null until read.
	let listed = $state<ToolListedModel[] | null>(null);
	let hidden = $state(0);
	let testing = $state(false);
	let testError = $state('');
	let query = $state('');
	let typed = $state('');

	let busy = $state(false);
	let error = $state('');

	const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

	// The picked models come first, as they were when the list was read
	// (picking does not move rows); then ones typed since, then the rest.
	let first = $state<string[]>(saved ? [...saved.models] : []);
	const rows = $derived.by(() => {
		const known = new Map((listed ?? []).map((m) => [m.id, m]));
		const top = [...first, ...models.filter((id) => !first.includes(id) && !known.has(id))];
		return [...top.map((id) => known.get(id) ?? { id }), ...(listed ?? []).filter((m) => !top.includes(m.id))];
	});
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? rows.filter((m) => `${m.id} ${m.name ?? ''}`.toLowerCase().includes(q)) : rows;
	});

	function toggle(id: string) {
		if (models.includes(id)) {
			models = models.filter((m) => m !== id);
			if (def === id) def = models[0] ?? '';
		} else {
			models = [...models, id];
			def ||= id;
		}
	}

	function addTyped() {
		const id = typed.trim();
		if (!id) return;
		if (!models.includes(id)) models = [...models, id];
		def ||= id;
		typed = '';
	}

	/** Reads the API's model list with the key typed (or the saved one): the
	 *  request carries that key and nothing else. */
	async function test() {
		const url = baseUrl.trim();
		if (!providerUrlOk(url)) return void (testError = t('settings.toolProviders.badUrl'));
		if (!key.trim() && !provider?.has_key) return void (testError = t('settings.toolProviders.needKey'));
		testing = true;
		testError = '';
		try {
			const got = await toolProviderModels(tool, { base_url: url, ...(key.trim() ? { key: key.trim() } : { provider_id: provider?.id }) });
			listed = got.models;
			hidden = got.hidden;
			first = [...models];
		} catch (e) {
			listed = null;
			testError = t('settings.toolProviders.fetchFailed', { msg: message(e) });
		} finally {
			testing = false;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		addTyped();
		const url = baseUrl.trim();
		if (!providerUrlOk(url)) return void (error = t('settings.toolProviders.badUrl'));
		if (!provider && !key.trim()) return void (error = t('settings.toolProviders.needKey'));
		if (!models.length) return void (error = t('settings.toolProviders.needModel'));
		const label = providerLabel(name, url);
		const id = provider?.id ?? providerId(label, taken);
		busy = true;
		error = '';
		try {
			await changeToolProviders(tool, 'tool_provider_save', {
				// An empty key keeps the saved one.
				provider: { id, name: label, format, base_url: url, key: key.trim(), models, model: def || models[0] }
			});
			onClose();
		} catch (e) {
			error = message(e);
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={provider ? t('settings.toolProviders.editTitle', { name: provider.name }) : `${t('settings.toolProviders.add')} · ${BACKEND_LABELS[tool]}`}
	width={560}
	padded={false}
	dismissible={!busy}
	{onClose}
>
	<form class="ed" id="tool-provider-form" onsubmit={save}>
		<p class="privacy">{t('settings.toolProviders.hint', { tool: BACKEND_LABELS[tool] })}</p>
		<div class="fields">
			<label class="f">
				<span>{t('settings.toolProviders.baseUrl')}</span>
				<TextField bind:value={baseUrl} disabled={busy} mono placeholder="https://api.example.com/v1" />
				<span class="sub">{t('settings.toolProviders.formatHint', { format: formatName })}</span>
			</label>
			<label class="f">
				<span>{t('settings.toolProviders.apiKey')}</span>
				<TextField
					bind:value={key}
					disabled={busy}
					type="password"
					mono
					placeholder={provider?.has_key ? t('settings.toolProviders.keepKey') : t('settings.toolProviders.keyPlaceholder')}
				/>
			</label>
			<label class="f">
				<span>{t('settings.toolProviders.name')}</span>
				<TextField bind:value={name} disabled={busy} placeholder={t('settings.toolProviders.namePlaceholder')} />
			</label>
			<div class="testrow">
				<Button type="button" size="sm" disabled={testing || busy} onclick={test}>
					{#if testing}<CircleNotchIcon size={14} class="spin" />{:else}<PlugsConnectedIcon size={14} />{/if}
					{testing ? t('settings.toolProviders.testing') : t('settings.toolProviders.test')}
				</Button>
				{#if listed && !testError}
					<span class="ok" role="status"><CheckIcon size={13} /> {t('settings.toolProviders.testOk', { n: String(listed.length) })}</span>
				{/if}
			</div>
			{#if testError}<Notice onDismiss={() => (testError = '')}>{testError}</Notice>{/if}
		</div>

		<div class="models">
			<div class="mhead">
				<span class="mtitle">{t('settings.toolProviders.models')}</span>
				{#if models.length}
					<span class="mcount">{t('settings.toolProviders.picked', { n: String(models.length) })}</span>
				{/if}
			</div>
			{#if rows.length > 8}
				<TextField bind:value={query} placeholder={t('settings.toolProviders.search')} />
			{/if}
			{#if rows.length}
				<div class="mlist" role="listbox" aria-multiselectable="true" aria-label={t('settings.toolProviders.models')}>
					{#each shown as m (m.id)}
						{@const on = models.includes(m.id)}
						{@const win = fmtContext(m.context_window ?? undefined)}
						<div class="mrow" class:on>
							<button type="button" class="mpick" role="option" aria-selected={on} disabled={busy} onclick={() => toggle(m.id)}>
								<span class="box" class:on>{#if on}<CheckIcon size={11} weight="bold" />{/if}</span>
								<span class="mid">{m.id}</span>
								{#if m.name || win}
									<span class="mmeta">{[m.name, win].filter(Boolean).join(' · ')}</span>
								{/if}
							</button>
							{#if on && def === m.id}
								<span class="deftag">{t('settings.toolProviders.default')}</span>
							{:else if on}
								<button type="button" class="setdef" disabled={busy} onclick={() => (def = m.id)}>{t('settings.toolProviders.setDefault')}</button>
							{/if}
						</div>
					{:else}
						<div class="mempty">{t('settings.toolProviders.noMatch')}</div>
					{/each}
				</div>
			{:else if !testing}
				<p class="mhint">{t('settings.toolProviders.modelsHint')}</p>
			{/if}
			{#if hidden}
				<p class="mhint">{t('settings.toolProviders.hidden', { n: String(hidden), format: formatName })}</p>
			{/if}
			<div class="madd">
				<TextField bind:value={typed} disabled={busy} mono placeholder={t('settings.toolProviders.typeModel')} />
				<Button type="button" size="sm" disabled={busy || !typed.trim()} onclick={addTyped}>
					<PlusIcon size={14} />
					{t('settings.toolProviders.addModel')}
				</Button>
			</div>
		</div>

		{#if error}<Notice>{error}</Notice>{/if}
	</form>
	{#snippet footer()}
		<Button type="button" variant="ghost" disabled={busy} onclick={onClose}>{t('common.cancel')}</Button>
		<Button type="submit" form="tool-provider-form" variant="primary" disabled={busy}>{t('common.save')}</Button>
	{/snippet}
</Modal>

<style>
	.ed {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px 20px;
	}
	.privacy {
		margin: 0;
		padding: 8px 10px;
		border-radius: var(--r-sm);
		background: var(--surface2);
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.f > span:first-child {
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	.sub {
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.testrow {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 28px;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--ok);
		font-size: var(--fs-xs);
	}
	.models {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.mhead {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 24px;
	}
	.mtitle {
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	.mcount {
		color: var(--dim2);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
	}
	.mlist {
		display: flex;
		flex-direction: column;
		max-height: 240px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--hairline);
		border-radius: var(--r-sm);
	}
	.mrow {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		padding-right: 8px;
	}
	.mrow + .mrow {
		border-top: 1px solid var(--hairline);
	}
	.mrow:hover {
		background: var(--surface2);
	}
	.mpick {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 8px;
		min-width: 0;
		min-height: 32px;
		padding: 0 10px;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}
	.mpick:focus-visible {
		outline: 2px solid var(--brand-bright);
		outline-offset: -2px;
	}
	.box {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border: 1px solid var(--border);
		border-radius: 3px;
	}
	.box.on {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--on-accent);
	}
	.mid {
		min-width: 0;
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mmeta {
		flex-shrink: 0;
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.deftag,
	.setdef {
		flex-shrink: 0;
		font-size: var(--fs-xs);
	}
	.deftag {
		color: var(--dim);
	}
	.setdef {
		padding: 2px 6px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--brand-bright);
		font-family: inherit;
		cursor: pointer;
		opacity: 0;
	}
	.mrow:hover .setdef,
	.setdef:focus-visible {
		opacity: 1;
	}
	.mempty,
	.mhint {
		margin: 0;
		color: var(--dim2);
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
	.mempty {
		padding: 10px;
	}
	.madd {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
