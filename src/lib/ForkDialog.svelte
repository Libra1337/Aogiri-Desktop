<script lang="ts">
	// Forking a conversation after a turn: the new conversation goes on in
	// the same folder as the original (原目录), or in a new worktree of its
	// own whose files are as they were when that turn ended (its checkpoint),
	// so neither side's edits reach the other. A worktree fork opens as a
	// project of its own beside the original's, as a parallel task does.
	import { onMount } from 'svelte';
	import GitForkIcon from 'phosphor-svelte/lib/GitForkIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import Button from '$lib/ui/Button.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import { git, gitCheckpointCapture, gitForkWorktree, worktreeBase } from '$lib/protocol';
	import { forkNames } from '$lib/forks';
	import { t } from '$lib/i18n';
	import type { WorktreeMeta } from '$lib/types';

	let {
		repo,
		cwd,
		title,
		session,
		keep,
		latest,
		checkpoint,
		onFork,
		onClose
	}: {
		/** The repository's main checkout (worktrees are made beside it). */
		repo: string;
		/** Where the original works. */
		cwd: string;
		title: string;
		/** The original's desktop id: its checkpoints are kept under it. */
		session: string;
		/** User turns the fork keeps. */
		keep: number;
		/** It forks after the last turn: the files are as they are now. */
		latest: boolean;
		/** The checkpoint taken before turn `keep` in this run of the app, if any. */
		checkpoint?: string;
		onFork: (worktree?: { path: string; meta: WorktreeMeta }) => void;
		onClose: () => void;
	} = $props();

	let where = $state<'here' | 'worktree'>('here');
	/** The branch a worktree starts from (null: no repository). */
	let base = $state<string | null>(null);
	let busy = $state(false);
	let error = $state('');

	onMount(() => {
		git(['branch', '--show-current'], repo)
			.then((out) => (base = String(out ?? '').trim() || null))
			.catch(() => (base = null));
	});

	// svelte-ignore state_referenced_locally
	const names = forkNames(title);

	async function confirm() {
		if (where === 'here') return onFork();
		if (busy || base === null) return;
		busy = true;
		error = '';
		try {
			const container = await worktreeBase(repo);
			const path = `${container}${container.includes('\\') ? '\\' : '/'}${names.slug}`;
			// After the last turn the files are as they are now; after an earlier
			// one, as the checkpoint taken before the next turn has them.
			const sha = latest ? await gitCheckpointCapture(cwd) : (checkpoint ?? '');
			await gitForkWorktree(repo, path, names.branch, sha, latest ? undefined : session, latest ? undefined : keep);
			onFork({ path, meta: { isWorktree: true, mainRepoPath: repo, branch: names.branch, baseBranch: base, slug: names.slug } });
		} catch (e) {
			error = /no checkpoint/.test(String(e)) ? t('chat.fork.noCheckpoint') : String(e);
			busy = false;
		}
	}
</script>

<Modal title={t('chat.fork.title')} dismissible={!busy} {onClose}>
	{#snippet icon()}<GitForkIcon size={15} />{/snippet}
	<p class="hint">{t('chat.fork.hint', { n: keep })}</p>
	<div class="choices" role="radiogroup" aria-label={t('chat.fork.title')}>
		<label class="choice" class:on={where === 'here'}>
			<input type="radio" bind:group={where} value="here" disabled={busy} />
			<span class="name">{t('chat.fork.sameDir')}</span>
			<span class="desc">{t('chat.fork.sameDirDesc')}</span>
		</label>
		<label class="choice" class:on={where === 'worktree'} class:off={base === null}>
			<input type="radio" bind:group={where} value="worktree" disabled={busy || base === null} />
			<span class="name">{t('chat.fork.worktree')}</span>
			<span class="desc">{base === null ? t('chat.fork.noRepo') : t('chat.fork.worktreeDesc', { branch: names.branch })}</span>
		</label>
	</div>
	{#if error}
		<Notice mono onDismiss={() => (error = '')}>{error}</Notice>
	{/if}
	{#snippet footer()}
		<Button size="sm" onclick={onClose} disabled={busy}>{t('common.cancel')}</Button>
		<Button size="sm" variant="primary" onclick={confirm} disabled={busy}>
			{#if busy}<CircleNotchIcon size={14} class="spin" /> {t('chat.fork.making')}{:else}{t('chat.fork.confirm')}{/if}
		</Button>
	{/snippet}
</Modal>

<style>
	.hint {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--dim);
		line-height: 1.5;
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.choice {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 8px;
		row-gap: 2px;
		padding: 10px 12px;
		border-radius: var(--r-md);
		box-shadow: inset 0 0 0 1px var(--border);
		cursor: pointer;
		transition: box-shadow var(--t-fast) var(--ease-out);
	}
	.choice.on {
		box-shadow: inset 0 0 0 1px var(--border-strong);
		background: var(--surface);
	}
	.choice.off {
		cursor: default;
		opacity: 0.6;
	}
	.choice input {
		grid-row: span 2;
		margin: 2px 0 0;
		accent-color: var(--accent);
	}
	.name {
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.desc {
		font-size: var(--fs-xs);
		color: var(--dim);
		line-height: 1.5;
	}
</style>
