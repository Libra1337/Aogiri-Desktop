<script lang="ts">
	// Where a new conversation goes, asked before it opens (⌘N, the title
	// bar's and the sidebar's +, the palette, the tray): the projects, a
	// conversation of no project, or a folder to add. The project the entry
	// belongs to (else the active one) is picked, so Enter opens it there;
	// ⌘1–9 pick a project directly. The draft can still move to another
	// project before its first message (NewSessionPicker).
	import { tick } from 'svelte';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import FolderIcon from 'phosphor-svelte/lib/FolderIcon';
	import FolderPlusIcon from 'phosphor-svelte/lib/FolderPlusIcon';
	import GitBranchIcon from 'phosphor-svelte/lib/GitBranchIcon';
	import ChatCircleIcon from 'phosphor-svelte/lib/ChatCircleIcon';
	import Modal from '$lib/ui/Modal.svelte';
	import TabGlyph from '$lib/workbench/TabGlyph.svelte';
	import { t } from '$lib/i18n';
	import { binding, comboLabel, matches } from '$lib/shortcuts';
	import type { Project } from '$lib/types';

	let {
		projects,
		current,
		onPick,
		onOpenFolder,
		onClose
	}: {
		projects: Project[];
		/** The project picked when nothing else is. */
		current?: string;
		/** null: a conversation of no project. */
		onPick: (p: Project | null) => void;
		onOpenFolder: () => void;
		onClose: () => void;
	} = $props();

	type Row = { key: string; label: string; desc?: string; project?: Project; kind: 'project' | 'none' | 'open'; run: () => void };
	const LOOSE = '\u0000none';
	const OPEN = '\u0000open';

	let query = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	const short = (path: string) => path.replace(/^(\/Users|\/home)\/[^/]+/, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~');
	const done = (fn: () => void) => () => {
		onClose();
		fn();
	};

	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? projects.filter((p) => `${p.name} ${p.path}`.toLowerCase().includes(q)) : projects;
	});
	const rows = $derived<Row[]>([
		...shown.map((p) => ({ key: p.id, label: p.name, desc: short(p.path), project: p, kind: 'project' as const, run: done(() => onPick(p)) })),
		{ key: LOOSE, label: t('shell.projectPick.none'), desc: t('shell.projectPick.noneHint'), kind: 'none' as const, run: done(() => onPick(null)) },
		{ key: OPEN, label: t('shell.startPicker.openFolder'), kind: 'open' as const, run: done(onOpenFolder) }
	]);
	let idx = $state(0);
	// The entry's project first in line, else the first match.
	$effect(() => {
		const at = rows.findIndex((r) => r.key === current);
		idx = query.trim() || at < 0 ? 0 : at;
	});
	$effect(() => {
		tick().then(() => inputEl?.focus());
	});
	const digit = (n: number) => {
		const c = binding('sessionN');
		return c ? comboLabel({ ...c, key: String(n) }) : '';
	};

	function onKey(e: KeyboardEvent) {
		const n = matches(e, 'sessionN');
		if (typeof n === 'number' && n > 0) {
			// The window's own ⌘1…9 switch conversations: not while this is open.
			e.preventDefault();
			e.stopPropagation();
			if (shown[n - 1]) rows[n - 1]!.run();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			idx = Math.min(idx + 1, rows.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			idx = Math.max(idx - 1, 0);
		} else if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			rows[idx]?.run();
		}
	}
</script>

<Modal label={t('shell.projectPick.label')} width={560} placement="top" padded={false} {onClose}>
	<div class="search">
		<MagnifyingGlassIcon size={16} />
		<input bind:this={inputEl} bind:value={query} onkeydown={onKey} placeholder={t('shell.projectPick.search')} aria-label={t('shell.projectPick.search')} />
	</div>
	<div class="rows" role="listbox" aria-label={t('shell.projectPick.label')}>
		{#if shown.length}<div class="group">{t('shell.projects')}</div>{/if}
		{#each rows as r, i (r.key)}
			{#if r.kind === 'none'}<div class="sep"></div>{/if}
			<button class="row" class:sel={i === idx} role="option" aria-selected={i === idx} onclick={r.run} onmouseenter={() => (idx = i)}>
				<span class="ico">
					{#if r.project?.icon}<TabGlyph icon={r.project.icon} color={r.project.color ?? 'var(--dim)'} size={16} />{:else if r.project?.worktree}<GitBranchIcon size={16} color={r.project.color} />{:else if r.project}<FolderIcon size={16} color={r.project.color} />{:else if r.kind === 'none'}<ChatCircleIcon size={16} />{:else}<FolderPlusIcon size={16} />{/if}
				</span>
				<span class="text">
					<span class="label">{r.label}</span>
					{#if r.desc}<span class="desc">{r.desc}</span>{/if}
				</span>
				{#if r.project && i < 9}<span class="keys">{digit(i + 1)}</span>{/if}
			</button>
		{/each}
	</div>
	<div class="foot">{t('shell.projectPick.foot', { keys: digit(1) ? `${digit(1)}–9` : '1–9' })}</div>
</Modal>

<style>
	/* The command palette's frame (CommandPalette.svelte). */
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 13px 16px;
		border-bottom: 1px solid var(--hairline);
		color: var(--dim);
	}
	.search input {
		flex: 1;
		border: none;
		outline: none;
		background: none;
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--fs-lg);
	}
	.search input::placeholder {
		color: var(--dim2);
	}
	.rows {
		max-height: calc(64vh - 90px);
		overflow-y: auto;
		padding: 6px;
	}
	.group {
		padding: 8px 11px 4px;
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.sep {
		height: 1px;
		margin: 4px 8px;
		background: var(--hairline);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		text-align: left;
		padding: 7px 11px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--text);
		cursor: pointer;
		font-size: var(--fs-sm);
	}
	.row.sel {
		background: var(--surface2);
	}
	.ico {
		display: inline-flex;
		justify-content: center;
		width: 16px;
		flex-shrink: 0;
		color: var(--dim);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.label,
	.desc {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.desc {
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.keys {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		color: var(--dim2);
		flex-shrink: 0;
	}
	.foot {
		padding: 9px 16px;
		border-top: 1px solid var(--hairline);
		font-size: var(--fs-2xs);
		font-family: var(--font-mono);
		color: var(--dim2);
		text-align: center;
	}
</style>
