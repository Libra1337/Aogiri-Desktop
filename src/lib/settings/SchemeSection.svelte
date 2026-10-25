<script lang="ts">
	// Settings → 通用 → 配色: custom colour schemes (colorScheme.ts). One row
	// per theme picks its colours (默认 or a scheme of that lightness); the
	// editor below changes a scheme's four colours, shown live over the whole
	// window while it is open, with the contrast it keeps on the canvas and
	// the frame tone. A scheme that misses design.md's contrast rule says
	// what fails and is not applied. Schemes and the choice sync with the
	// LynShen account; the background image and glass are their own rows.
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Select from '$lib/ui/Select.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import { t } from '$lib/i18n';
	import { confirm } from '$lib/ui/confirm.svelte';
	import { CONTRAST, lightnessOf, normalizeHex, schemeContrast, SCHEMES_MAX, type ColorScheme, type SchemeSeeds } from '$lib/colorScheme';
	import { createScheme, deleteScheme, previewScheme, setSchemeSlot, themeState, updateScheme } from '$lib/theme.svelte';

	const MODES = ['light', 'dark'] as const;
	const SEEDS = ['bg', 'text', 'accent', 'link'] as const;

	/** The scheme open in the editor. */
	let editing = $state<string | null>(null);
	/** Its colours as typed (a field may hold an unfinished value). */
	let draft = $state<SchemeSeeds & { name: string }>({ name: '', bg: '', text: '', accent: '', link: '' });
	const scheme = $derived(themeState.schemes.find((s) => s.id === editing) ?? null);

	function open(s: ColorScheme) {
		editing = s.id;
		draft = { name: s.name, bg: s.bg, text: s.text, accent: s.accent, link: s.link };
	}
	function close() {
		editing = null;
		previewScheme(null);
	}
	// Leaving Settings ends the preview.
	$effect(() => () => untrack(() => previewScheme(null)));

	/** The draft's colours when all four are colours. */
	const seeds = $derived.by((): SchemeSeeds | null => {
		const c = SEEDS.map((k) => normalizeHex(draft[k]));
		return c.every(Boolean) ? { bg: c[0]!, text: c[1]!, accent: c[2]!, link: c[3]! } : null;
	});
	const check = $derived(seeds ? schemeContrast(seeds) : null);
	// The window shows the draft while the editor is open.
	$effect(() => {
		const s = seeds;
		const on = editing;
		untrack(() => previewScheme(on && s ? s : null));
	});

	function save() {
		if (!scheme || !seeds) return;
		updateScheme(scheme.id, { name: draft.name.trim() || scheme.name, ...seeds });
		close();
	}
	function add(mode: 'light' | 'dark') {
		const created = createScheme(t('settings.scheme.newName', { n: themeState.schemes.length + 1 }), mode);
		if (created) open(created);
	}
	async function remove(s: ColorScheme) {
		const ok = await confirm({ title: t('settings.scheme.deleteTitle', { name: s.name }), message: t('settings.scheme.deleteMessage'), confirmLabel: t('settings.scheme.delete'), danger: true });
		if (!ok) return;
		if (editing === s.id) close();
		deleteScheme(s.id);
	}
	const ratio = (n: number) => `${n.toFixed(1)}:1`;
</script>

{#each MODES as mode (mode)}
	{@const fits = themeState.schemes.filter((s) => lightnessOf(s.bg) === mode)}
	<SettingsRow id="scheme-{mode}" title={t(`settings.scheme.${mode}`)} description={t('settings.scheme.slotHint')}>
		<div class="slot">
			<Select
				value={themeState[mode]}
				options={[{ value: '', label: t('settings.scheme.builtin') }, ...fits.map((s) => ({ value: s.id, label: s.name }))]}
				onChange={(v) => setSchemeSlot(mode, v)}
			/>
			<Button size="sm" variant="ghost" disabled={themeState.schemes.length >= SCHEMES_MAX} onclick={() => add(mode)}><PlusIcon size={14} /> {t('settings.scheme.add')}</Button>
		</div>
	</SettingsRow>
{/each}

{#if themeState.schemes.length}
	<SettingsRow id="schemes" title={t('settings.scheme.list')} stacked>
		<ul class="schemes">
			{#each themeState.schemes as s (s.id)}
				<li class="scheme" class:on={editing === s.id}>
					<button class="pick" onclick={() => (editing === s.id ? close() : open(s))} aria-expanded={editing === s.id}>
						<span class="swatch" style:background={s.bg} style:color={s.text} aria-hidden="true">
							<i style:background={s.accent}></i><i style:background={s.link}></i>
						</span>
						<span class="name">{s.name}</span>
						<span class="kind">{t(`settings.scheme.kind.${lightnessOf(s.bg)}`)}</span>
					</button>
					<IconButton size="sm" label={t('settings.scheme.delete')} title={t('settings.scheme.delete')} onclick={() => remove(s)}><TrashIcon size={14} /></IconButton>
				</li>
				{#if editing === s.id}
					<li class="editor">
						<label class="field">
							<span class="flabel">{t('settings.scheme.name')}</span>
							<div class="w-md"><TextField bind:value={draft.name} /></div>
						</label>
						{#each SEEDS as key (key)}
							{@const ok = !!normalizeHex(draft[key])}
							<label class="field">
								<span class="flabel">{t(`settings.scheme.seed.${key}`)}</span>
								<input class="color" type="color" value={normalizeHex(draft[key]) ?? '#000000'} oninput={(e) => (draft[key] = e.currentTarget.value)} aria-label={t(`settings.scheme.seed.${key}`)} />
								<div class="hex" class:bad={!ok}><TextField mono bind:value={draft[key]} /></div>
							</label>
						{/each}
						{#if check}
							<p class="figures">
								{t('settings.scheme.contrast')}
								<span class:bad={check.text < CONTRAST.text}>{t('settings.scheme.figure.text', { r: ratio(check.text) })}</span>
								<span>{t('settings.scheme.figure.dim', { r: ratio(check.dim) })}</span>
								<span>{t('settings.scheme.figure.dim2', { r: ratio(check.dim2) })}</span>
								<span class:bad={check.link < CONTRAST.link}>{t('settings.scheme.figure.link', { r: ratio(check.link) })}</span>
							</p>
							{#if check.problems.length}
								<p class="problem" role="alert">{check.problems.map((p) => t(`settings.scheme.problem.${p}`)).join(' ')}</p>
							{/if}
						{/if}
						<div class="acts">
							<Button size="sm" variant="primary" disabled={!seeds || !!check?.problems.length} onclick={save}>{t('settings.scheme.save')}</Button>
							<Button size="sm" variant="secondary" onclick={close}>{t('settings.scheme.cancel')}</Button>
						</div>
					</li>
				{/if}
			{/each}
		</ul>
	</SettingsRow>
{/if}

<style>
	.slot {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.schemes {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.scheme {
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: var(--r-sm);
	}
	.scheme:hover,
	.scheme.on {
		background: var(--surface2);
	}
	.pick {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		min-width: 0;
		min-height: 32px;
		padding: 4px 8px;
		border: none;
		border-radius: inherit;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}
	.pick:focus-visible {
		outline-offset: -2px;
	}
	/* The scheme in small: its canvas with the accent and link as two marks. */
	.swatch {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 3px;
		width: 34px;
		height: 20px;
		padding: 0 5px;
		border: 1px solid var(--border);
		border-radius: var(--r-sm);
	}
	.swatch i {
		width: 8px;
		height: 8px;
		border-radius: var(--r-full);
	}
	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.kind {
		flex: none;
		margin-left: auto;
		font-size: var(--fs-xs);
		color: var(--dim);
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 4px 0 8px;
		padding: 12px;
		border-radius: var(--r-md);
		background: var(--surface);
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: var(--fs-sm);
	}
	.flabel {
		width: 72px;
		flex: none;
		color: var(--dim);
	}
	.w-md {
		width: 220px;
	}
	.color {
		width: 28px;
		height: 28px;
		flex: none;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--r-sm);
		background: none;
		cursor: pointer;
	}
	.hex {
		width: 120px;
	}
	.hex.bad :global(input) {
		border-color: var(--err);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}
	.figures .bad,
	.problem {
		color: var(--err);
	}
	.problem {
		margin: 0;
		font-size: var(--fs-xs);
	}
	.acts {
		display: flex;
		gap: 8px;
	}
</style>
